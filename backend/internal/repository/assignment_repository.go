package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrAssignmentNotFound = errors.New("assignment not found")
var ErrSubmissionNotFound = errors.New("submission not found")

type Assignment struct {
	ID              string
	CourseID        string
	CourseName      string
	Title           string
	Description     string
	Deadline        sql.NullTime
	MaxScore        int
	IsActive        bool
	CreatedByID     string
	CreatedByName   string
	Type            string // 'uraian' | 'pilihan_ganda'
	SubmissionCount int
	Submitted       bool // student view: caller already submitted
	Blocked         bool // student view: caller is blocked
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Submission struct {
	ID           string
	AssignmentID string
	StudentID    string
	StudentName  string
	StudentKelas string
	Content          string
	FileURL          string
	Submitted        bool
	SubmittedAt      sql.NullTime
	Score            sql.NullInt64
	Feedback         string
	GradedAt         sql.NullTime
	TimeTakenSeconds int
}

type AssignmentListFilter struct {
	CourseID  string
	TeacherID string // restrict to courses taught by this teacher
	StudentID string // restrict to courses this student is enrolled in
	Page      int
	PageSize  int
}

type AssignmentRepository interface {
	Create(ctx context.Context, a *Assignment) error
	GetByID(ctx context.Context, id string) (*Assignment, error)
	Update(ctx context.Context, a *Assignment) error
	Delete(ctx context.Context, id string) error
	List(ctx context.Context, f AssignmentListFilter) ([]*Assignment, int, error)
	Block(ctx context.Context, id, assignmentID, studentID string) error
	Unblock(ctx context.Context, assignmentID, studentID string) error
	ListBlockedStudentIDs(ctx context.Context, assignmentID string) ([]string, error)
	IsBlocked(ctx context.Context, assignmentID, studentID string) (bool, error)
}

type SubmissionRepository interface {
	Upsert(ctx context.Context, s *Submission) error
	// CreateQuizSubmission stores an auto-graded MCQ result (score + time).
	CreateQuizSubmission(ctx context.Context, id, assignmentID, studentID string, score, timeTaken int) error
	Get(ctx context.Context, assignmentID, studentID string) (*Submission, error)
	GetByID(ctx context.Context, id string) (*Submission, error)
	ListByAssignment(ctx context.Context, assignmentID string) ([]*Submission, error)
	ListByAssignmentIDs(ctx context.Context, ids []string) ([]*Submission, error)
	Grade(ctx context.Context, id string, score int, feedback string, gradedAt time.Time) error
}

type sqliteAssignmentRepository struct{ db *sql.DB }
type sqliteSubmissionRepository struct{ db *sql.DB }

func NewAssignmentRepository(db *sql.DB) AssignmentRepository { return &sqliteAssignmentRepository{db: db} }
func NewSubmissionRepository(db *sql.DB) SubmissionRepository { return &sqliteSubmissionRepository{db: db} }

// ─── Assignments ─────────────────────────────────────────────────────────────

func (r *sqliteAssignmentRepository) Create(ctx context.Context, a *Assignment) error {
	if a.Type == "" {
		a.Type = "uraian"
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO assignments (id, course_id, title, description, deadline, max_score, is_active, created_by, type, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.CourseID, a.Title, a.Description, a.Deadline, a.MaxScore, a.IsActive, a.CreatedByID, a.Type, a.CreatedAt, a.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create assignment: %w", err)
	}
	return nil
}

const assignmentSelect = `
	SELECT a.id, a.course_id, c.name, a.title, a.description, a.deadline, a.max_score, a.is_active, a.created_by,
	       COALESCE(uc.full_name, ''), a.type,
	       (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count,
	       a.created_at, a.updated_at
	FROM assignments a
	JOIN courses c ON c.id = a.course_id
	LEFT JOIN users uc ON uc.id = a.created_by`

func scanAssignment(s interface{ Scan(...any) error }, a *Assignment, withStudentCols bool) error {
	if withStudentCols {
		return s.Scan(&a.ID, &a.CourseID, &a.CourseName, &a.Title, &a.Description, &a.Deadline, &a.MaxScore,
			&a.IsActive, &a.CreatedByID, &a.CreatedByName, &a.Type, &a.SubmissionCount, &a.CreatedAt, &a.UpdatedAt, &a.Submitted, &a.Blocked)
	}
	return s.Scan(&a.ID, &a.CourseID, &a.CourseName, &a.Title, &a.Description, &a.Deadline, &a.MaxScore,
		&a.IsActive, &a.CreatedByID, &a.CreatedByName, &a.Type, &a.SubmissionCount, &a.CreatedAt, &a.UpdatedAt)
}

func (r *sqliteAssignmentRepository) GetByID(ctx context.Context, id string) (*Assignment, error) {
	a := &Assignment{}
	err := scanAssignment(r.db.QueryRowContext(ctx, assignmentSelect+` WHERE a.id = ?`, id), a, false)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	return a, nil
}

func (r *sqliteAssignmentRepository) Update(ctx context.Context, a *Assignment) error {
	a.UpdatedAt = time.Now()
	res, err := r.db.ExecContext(ctx, `
		UPDATE assignments SET title=?, description=?, deadline=?, max_score=?, is_active=?, updated_at=?
		WHERE id=?`,
		a.Title, a.Description, a.Deadline, a.MaxScore, a.IsActive, a.UpdatedAt, a.ID)
	if err != nil {
		return fmt.Errorf("update assignment: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrAssignmentNotFound
	}
	return nil
}

func (r *sqliteAssignmentRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM assignments WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete assignment: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrAssignmentNotFound
	}
	return nil
}

func (r *sqliteAssignmentRepository) Block(ctx context.Context, id, assignmentID, studentID string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO assignment_blocks (id, assignment_id, student_id) VALUES (?, ?, ?)`,
		id, assignmentID, studentID)
	if err != nil {
		return fmt.Errorf("block student: %w", err)
	}
	return nil
}

func (r *sqliteAssignmentRepository) Unblock(ctx context.Context, assignmentID, studentID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM assignment_blocks WHERE assignment_id = ? AND student_id = ?`, assignmentID, studentID)
	if err != nil {
		return fmt.Errorf("unblock student: %w", err)
	}
	return nil
}

func (r *sqliteAssignmentRepository) ListBlockedStudentIDs(ctx context.Context, assignmentID string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT student_id FROM assignment_blocks WHERE assignment_id = ?`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("list blocked: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan blocked: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *sqliteAssignmentRepository) IsBlocked(ctx context.Context, assignmentID, studentID string) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM assignment_blocks WHERE assignment_id = ? AND student_id = ?)`,
		assignmentID, studentID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("is blocked: %w", err)
	}
	return exists, nil
}

func (r *sqliteAssignmentRepository) List(ctx context.Context, f AssignmentListFilter) ([]*Assignment, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 50
	}
	offset := (f.Page - 1) * f.PageSize

	conds := []string{}
	args := []any{}
	if f.CourseID != "" {
		conds = append(conds, "a.course_id = ?")
		args = append(args, f.CourseID)
	}
	if f.TeacherID != "" {
		conds = append(conds, "c.teacher_id = ?")
		args = append(args, f.TeacherID)
	}
	if f.StudentID != "" {
		conds = append(conds, "a.course_id IN (SELECT course_id FROM course_enrollments WHERE student_id = ?)")
		args = append(args, f.StudentID)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM assignments a JOIN courses c ON c.id = a.course_id`+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count assignments: %w", err)
	}

	// student-aware columns (submitted / blocked); empty studentID → both false
	listSelect := `
		SELECT a.id, a.course_id, c.name, a.title, a.description, a.deadline, a.max_score, a.is_active, a.created_by,
		       COALESCE(uc.full_name, ''), a.type,
		       (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count,
		       a.created_at, a.updated_at,
		       EXISTS(SELECT 1 FROM assignment_submissions s2 WHERE s2.assignment_id=a.id AND s2.student_id=?) AS submitted,
		       EXISTS(SELECT 1 FROM assignment_blocks ab WHERE ab.assignment_id=a.id AND ab.student_id=?) AS blocked
		FROM assignments a
		JOIN courses c ON c.id = a.course_id
		LEFT JOIN users uc ON uc.id = a.created_by`
	listArgs := append([]any{f.StudentID, f.StudentID}, args...)
	listArgs = append(listArgs, f.PageSize, offset)
	rows, err := r.db.QueryContext(ctx, listSelect+where+
		` ORDER BY a.deadline IS NULL, a.deadline ASC, a.created_at DESC LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list assignments: %w", err)
	}
	defer rows.Close()

	var out []*Assignment
	for rows.Next() {
		a := &Assignment{}
		if err := scanAssignment(rows, a, true); err != nil {
			return nil, 0, fmt.Errorf("scan assignment: %w", err)
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

// ─── Submissions ─────────────────────────────────────────────────────────────

func (r *sqliteSubmissionRepository) Upsert(ctx context.Context, s *Submission) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO assignment_submissions (id, assignment_id, student_id, content, file_url, submitted_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(assignment_id, student_id) DO UPDATE SET
			content = excluded.content,
			file_url = excluded.file_url,
			submitted_at = excluded.submitted_at`,
		s.ID, s.AssignmentID, s.StudentID, s.Content, s.FileURL, time.Now())
	if err != nil {
		return fmt.Errorf("upsert submission: %w", err)
	}
	return nil
}

const submissionSelect = `
	SELECT s.id, s.assignment_id, s.student_id, u.full_name, u.kelas, s.content, s.file_url,
	       s.submitted_at, s.score, s.feedback, s.graded_at, s.time_taken_seconds
	FROM assignment_submissions s
	JOIN users u ON u.id = s.student_id`

func scanSubmission(sc interface{ Scan(...any) error }, s *Submission) error {
	err := sc.Scan(&s.ID, &s.AssignmentID, &s.StudentID, &s.StudentName, &s.StudentKelas, &s.Content,
		&s.FileURL, &s.SubmittedAt, &s.Score, &s.Feedback, &s.GradedAt, &s.TimeTakenSeconds)
	if err == nil {
		s.Submitted = true
	}
	return err
}

func (r *sqliteSubmissionRepository) CreateQuizSubmission(ctx context.Context, id, assignmentID, studentID string, score, timeTaken int) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO assignment_submissions (id, assignment_id, student_id, content, file_url, submitted_at, score, graded_at, time_taken_seconds)
		VALUES (?, ?, ?, '', '', ?, ?, ?, ?)
		ON CONFLICT(assignment_id, student_id) DO NOTHING`,
		id, assignmentID, studentID, now, score, now, timeTaken)
	if err != nil {
		return fmt.Errorf("create quiz submission: %w", err)
	}
	return nil
}

func (r *sqliteSubmissionRepository) Get(ctx context.Context, assignmentID, studentID string) (*Submission, error) {
	s := &Submission{}
	err := scanSubmission(r.db.QueryRowContext(ctx, submissionSelect+
		` WHERE s.assignment_id = ? AND s.student_id = ?`, assignmentID, studentID), s)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrSubmissionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get submission: %w", err)
	}
	return s, nil
}

func (r *sqliteSubmissionRepository) GetByID(ctx context.Context, id string) (*Submission, error) {
	s := &Submission{}
	err := scanSubmission(r.db.QueryRowContext(ctx, submissionSelect+` WHERE s.id = ?`, id), s)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrSubmissionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get submission by id: %w", err)
	}
	return s, nil
}

func (r *sqliteSubmissionRepository) ListByAssignment(ctx context.Context, assignmentID string) ([]*Submission, error) {
	rows, err := r.db.QueryContext(ctx, submissionSelect+` WHERE s.assignment_id = ? ORDER BY u.full_name ASC`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("list submissions: %w", err)
	}
	defer rows.Close()
	return collectSubmissions(rows)
}

func (r *sqliteSubmissionRepository) ListByAssignmentIDs(ctx context.Context, ids []string) ([]*Submission, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	rows, err := r.db.QueryContext(ctx, submissionSelect+
		` WHERE s.assignment_id IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return nil, fmt.Errorf("list submissions by ids: %w", err)
	}
	defer rows.Close()
	return collectSubmissions(rows)
}

func collectSubmissions(rows *sql.Rows) ([]*Submission, error) {
	var out []*Submission
	for rows.Next() {
		s := &Submission{}
		if err := scanSubmission(rows, s); err != nil {
			return nil, fmt.Errorf("scan submission: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *sqliteSubmissionRepository) Grade(ctx context.Context, id string, score int, feedback string, gradedAt time.Time) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE assignment_submissions SET score=?, feedback=?, graded_at=? WHERE id=?`,
		score, feedback, gradedAt, id)
	if err != nil {
		return fmt.Errorf("grade submission: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrSubmissionNotFound
	}
	return nil
}
