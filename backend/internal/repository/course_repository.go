package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// GeneralCourseID is the sentinel "Materi Umum" course: a single course that
// every student & teacher can access without class/enrollment restrictions.
// It is hidden from the normal course list and used by the Materi Umum page.
const GeneralCourseID = "general"

// kelasColumn is a correlated subquery returning the assigned class names of a
// course joined with "||" (NULL when none).
const kelasColumn = `(SELECT GROUP_CONCAT(cl.name, '||') FROM course_classes cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.course_id = c.id)`

func splitKelas(s sql.NullString) []string {
	if !s.Valid || s.String == "" {
		return nil
	}
	return strings.Split(s.String, "||")
}

var ErrCourseNotFound = errors.New("course not found")
var ErrCourseDuplicate = errors.New("course already exists")
var ErrAlreadyEnrolled = errors.New("student already enrolled")
var ErrNotEnrolled = errors.New("student not enrolled")

type Course struct {
	ID           string
	Code         string
	Name         string
	Description  string
	TeacherID    string
	TeacherName  string
	TeacherEmail string
	IsActive        bool
	StudentCount    int
	Kelas           []string
	BackgroundImage string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Enrollment struct {
	ID               string
	CourseID         string
	StudentID        string
	StudentName      string
	StudentEmail     string
	StudentKelas     string
	StudentJurusan   string
	StudentIsActive  bool
	EnrolledAt       time.Time
}

type CourseListFilter struct {
	TeacherID string
	StudentID string
	Page      int
	PageSize  int
}

type CourseRepository interface {
	Create(ctx context.Context, c *Course) error
	GetByID(ctx context.Context, id string) (*Course, error)
	Update(ctx context.Context, c *Course) error
	Delete(ctx context.Context, id string) error
	List(ctx context.Context, f CourseListFilter) ([]*Course, int, error)
	// SetCourseClasses replaces the set of classes assigned to a course.
	SetCourseClasses(ctx context.Context, courseID string, classIDs []string) error
	// FindCourseIDsByKelasName returns IDs of active courses assigned to a kelas name.
	FindCourseIDsByKelasName(ctx context.Context, kelasName string) ([]string, error)
}

type EnrollmentRepository interface {
	Enroll(ctx context.Context, courseID, studentID, enrollmentID string) error
	Unenroll(ctx context.Context, courseID, studentID string) error
	IsEnrolled(ctx context.Context, courseID, studentID string) (bool, error)
	ListStudents(ctx context.Context, courseID string, page, pageSize int) ([]*Enrollment, int, error)
	IsTeacher(ctx context.Context, courseID, userID string) (bool, error)
}

type sqliteCourseRepository struct{ db *sql.DB }
type sqliteEnrollmentRepository struct{ db *sql.DB }

func NewCourseRepository(db *sql.DB) CourseRepository {
	return &sqliteCourseRepository{db: db}
}

func NewEnrollmentRepository(db *sql.DB) EnrollmentRepository {
	return &sqliteEnrollmentRepository{db: db}
}

// ─── CourseRepository ────────────────────────────────────────────────────────

func (r *sqliteCourseRepository) Create(ctx context.Context, c *Course) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO courses (id, code, name, description, teacher_id, is_active, background_image, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.Code, c.Name, c.Description, c.TeacherID, c.IsActive, c.BackgroundImage, c.CreatedAt, c.UpdatedAt,
	)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrCourseDuplicate
		}
		return fmt.Errorf("create course: %w", err)
	}
	return nil
}

func (r *sqliteCourseRepository) GetByID(ctx context.Context, id string) (*Course, error) {
	c := &Course{}
	var kelas sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT c.id, c.code, c.name, c.description, c.teacher_id,
		       u.full_name, u.email, c.is_active, c.created_at, c.updated_at,
		       (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS student_count,
		       `+kelasColumn+`, c.background_image
		FROM courses c
		JOIN users u ON u.id = c.teacher_id
		WHERE c.id = ?`, id,
	).Scan(&c.ID, &c.Code, &c.Name, &c.Description, &c.TeacherID,
		&c.TeacherName, &c.TeacherEmail, &c.IsActive, &c.CreatedAt, &c.UpdatedAt, &c.StudentCount, &kelas, &c.BackgroundImage)
	c.Kelas = splitKelas(kelas)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrCourseNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get course by id: %w", err)
	}
	return c, nil
}

func (r *sqliteCourseRepository) Update(ctx context.Context, c *Course) error {
	c.UpdatedAt = time.Now()
	res, err := r.db.ExecContext(ctx, `
		UPDATE courses SET code=?, name=?, description=?, teacher_id=?, is_active=?, background_image=?, updated_at=?
		WHERE id=?`,
		c.Code, c.Name, c.Description, c.TeacherID, c.IsActive, c.BackgroundImage, c.UpdatedAt, c.ID,
	)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrCourseDuplicate
		}
		return fmt.Errorf("update course: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrCourseNotFound
	}
	return nil
}

func (r *sqliteCourseRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM courses WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete course: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrCourseNotFound
	}
	return nil
}

func (r *sqliteCourseRepository) List(ctx context.Context, f CourseListFilter) ([]*Course, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 20
	}
	offset := (f.Page - 1) * f.PageSize

	// Always hide the sentinel "Materi Umum" course from normal listings.
	where := "WHERE c.id <> ?"
	args := []any{GeneralCourseID}

	if f.TeacherID != "" {
		where += " AND c.teacher_id = ?"
		args = append(args, f.TeacherID)
	}
	if f.StudentID != "" {
		where += " AND EXISTS (SELECT 1 FROM course_enrollments e WHERE e.course_id=c.id AND e.student_id=?)"
		args = append(args, f.StudentID)
	}

	var total int
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM courses c `+where, countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count courses: %w", err)
	}

	listArgs := append(args, f.PageSize, offset)
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.id, c.code, c.name, c.description, c.teacher_id,
		       u.full_name, u.email, c.is_active, c.created_at, c.updated_at,
		       (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS student_count,
		       `+kelasColumn+`
		FROM courses c
		JOIN users u ON u.id = c.teacher_id
		`+where+` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list courses: %w", err)
	}
	defer rows.Close()

	var courses []*Course
	for rows.Next() {
		c := &Course{}
		var kelas sql.NullString
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.Description, &c.TeacherID,
			&c.TeacherName, &c.TeacherEmail, &c.IsActive, &c.CreatedAt, &c.UpdatedAt, &c.StudentCount, &kelas); err != nil {
			return nil, 0, fmt.Errorf("scan course: %w", err)
		}
		c.Kelas = splitKelas(kelas)
		courses = append(courses, c)
	}
	return courses, total, rows.Err()
}

func (r *sqliteCourseRepository) SetCourseClasses(ctx context.Context, courseID string, classIDs []string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM course_classes WHERE course_id = ?`, courseID); err != nil {
		return fmt.Errorf("clear course classes: %w", err)
	}
	for _, cid := range classIDs {
		if cid == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO course_classes (id, course_id, class_id) VALUES (?, ?, ?)`,
			uuid.New().String(), courseID, cid); err != nil {
			return fmt.Errorf("assign class: %w", err)
		}
	}
	return tx.Commit()
}

func (r *sqliteCourseRepository) FindCourseIDsByKelasName(ctx context.Context, kelasName string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.id FROM courses c
		JOIN course_classes cc ON cc.course_id = c.id
		JOIN classes cl ON cl.id = cc.class_id
		WHERE cl.name = ? AND c.is_active = 1`, kelasName)
	if err != nil {
		return nil, fmt.Errorf("find courses by kelas: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan course id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ─── EnrollmentRepository ────────────────────────────────────────────────────

func (r *sqliteEnrollmentRepository) Enroll(ctx context.Context, courseID, studentID, enrollmentID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO course_enrollments (id, course_id, student_id)
		VALUES (?, ?, ?)`,
		enrollmentID, courseID, studentID,
	)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrAlreadyEnrolled
		}
		return fmt.Errorf("enroll student: %w", err)
	}
	return nil
}

func (r *sqliteEnrollmentRepository) Unenroll(ctx context.Context, courseID, studentID string) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM course_enrollments WHERE course_id=? AND student_id=?`, courseID, studentID)
	if err != nil {
		return fmt.Errorf("unenroll student: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotEnrolled
	}
	return nil
}

func (r *sqliteEnrollmentRepository) IsEnrolled(ctx context.Context, courseID, studentID string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM course_enrollments WHERE course_id=? AND student_id=?`,
		courseID, studentID,
	).Scan(&count)
	return count > 0, err
}

func (r *sqliteEnrollmentRepository) IsTeacher(ctx context.Context, courseID, userID string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM courses WHERE id=? AND teacher_id=?`, courseID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *sqliteEnrollmentRepository) ListStudents(ctx context.Context, courseID string, page, pageSize int) ([]*Enrollment, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var total int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM course_enrollments WHERE course_id=?`, courseID,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count enrollments: %w", err)
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.course_id, e.student_id, u.full_name, u.email, u.kelas, u.jurusan, u.is_active, e.enrolled_at
		FROM course_enrollments e
		JOIN users u ON u.id = e.student_id
		WHERE e.course_id=?
		ORDER BY u.full_name ASC LIMIT ? OFFSET ?`,
		courseID, pageSize, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list enrollments: %w", err)
	}
	defer rows.Close()

	var enrollments []*Enrollment
	for rows.Next() {
		e := &Enrollment{}
		var isActiveInt int
		if err := rows.Scan(&e.ID, &e.CourseID, &e.StudentID, &e.StudentName, &e.StudentEmail, &e.StudentKelas, &e.StudentJurusan, &isActiveInt, &e.EnrolledAt); err != nil {
			return nil, 0, fmt.Errorf("scan enrollment: %w", err)
		}
		e.StudentIsActive = isActiveInt != 0
		enrollments = append(enrollments, e)
	}
	return enrollments, total, rows.Err()
}
