package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrCompletionNotFound = errors.New("completion not found")

type Completion struct {
	ID          string
	MaterialID  string
	StudentID   string
	StudentName string
	StudentKelas string
	ReadPercent int
	QuizPassed  bool
	CompletedAt time.Time
}

type StudentSummary struct {
	StudentID      string
	StudentName    string
	StudentKelas   string
	CompletedCount int
	TotalMaterials int
	Percent        int
}

type CompletionRepository interface {
	Upsert(ctx context.Context, c *Completion) error
	GetByStudentMaterial(ctx context.Context, studentID, materialID string) (*Completion, error)
	ListByCourse(ctx context.Context, courseID string) ([]*StudentSummary, error)
	// DeleteByStudentCourse removes a student's completion records for every
	// material in a course. Returns the number of rows deleted.
	DeleteByStudentCourse(ctx context.Context, courseID, studentID string) (int64, error)
}

type sqliteCompletionRepository struct{ db *sql.DB }

func NewCompletionRepository(db *sql.DB) CompletionRepository {
	return &sqliteCompletionRepository{db: db}
}

func (r *sqliteCompletionRepository) Upsert(ctx context.Context, c *Completion) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO material_completions (id, material_id, student_id, read_percent, quiz_passed, completed_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(material_id, student_id) DO UPDATE SET
		  read_percent = excluded.read_percent,
		  quiz_passed  = excluded.quiz_passed,
		  completed_at = excluded.completed_at`,
		c.ID, c.MaterialID, c.StudentID, c.ReadPercent, boolToInt(c.QuizPassed), c.CompletedAt)
	if err != nil {
		return fmt.Errorf("upsert completion: %w", err)
	}
	return nil
}

func (r *sqliteCompletionRepository) GetByStudentMaterial(ctx context.Context, studentID, materialID string) (*Completion, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT mc.id, mc.material_id, mc.student_id, u.full_name, u.kelas,
		       mc.read_percent, mc.quiz_passed, mc.completed_at
		FROM material_completions mc
		JOIN users u ON u.id = mc.student_id
		WHERE mc.student_id = ? AND mc.material_id = ?`,
		studentID, materialID)

	c := &Completion{}
	var quizInt int
	err := row.Scan(&c.ID, &c.MaterialID, &c.StudentID, &c.StudentName, &c.StudentKelas,
		&c.ReadPercent, &quizInt, &c.CompletedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrCompletionNotFound
		}
		return nil, fmt.Errorf("get completion: %w", err)
	}
	c.QuizPassed = quizInt != 0
	return c, nil
}

func (r *sqliteCompletionRepository) ListByCourse(ctx context.Context, courseID string) ([]*StudentSummary, error) {
	totalRow := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM course_materials WHERE course_id = ? AND is_published = 1`, courseID)
	var total int
	if err := totalRow.Scan(&total); err != nil {
		return nil, fmt.Errorf("count materials: %w", err)
	}

	// The "Materi Umum" course has no enrollments — it's for everyone — so count
	// every student. Normal courses count only their enrolled students.
	query, args := `
		SELECT u.id, u.full_name, u.kelas, COUNT(mc.id) AS completed_count
		FROM course_enrollments e
		JOIN users u ON u.id = e.student_id
		LEFT JOIN material_completions mc
		  ON mc.student_id = e.student_id
		  AND mc.material_id IN (SELECT id FROM course_materials WHERE course_id = ? AND is_published = 1)
		WHERE e.course_id = ?
		GROUP BY u.id, u.full_name, u.kelas
		ORDER BY u.full_name ASC`, []any{courseID, courseID}
	if courseID == GeneralCourseID {
		query, args = `
			SELECT u.id, u.full_name, u.kelas, COUNT(mc.id) AS completed_count
			FROM users u
			LEFT JOIN material_completions mc
			  ON mc.student_id = u.id
			  AND mc.material_id IN (SELECT id FROM course_materials WHERE course_id = ? AND is_published = 1)
			WHERE u.role = 'student'
			GROUP BY u.id, u.full_name, u.kelas
			ORDER BY u.full_name ASC`, []any{courseID}
	}
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list completions by course: %w", err)
	}
	defer rows.Close()

	var out []*StudentSummary
	for rows.Next() {
		s := &StudentSummary{TotalMaterials: total}
		if err := rows.Scan(&s.StudentID, &s.StudentName, &s.StudentKelas, &s.CompletedCount); err != nil {
			return nil, fmt.Errorf("scan summary: %w", err)
		}
		if total > 0 {
			s.Percent = s.CompletedCount * 100 / total
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *sqliteCompletionRepository) DeleteByStudentCourse(ctx context.Context, courseID, studentID string) (int64, error) {
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM material_completions
		WHERE student_id = ?
		  AND material_id IN (SELECT id FROM course_materials WHERE course_id = ?)`,
		studentID, courseID)
	if err != nil {
		return 0, fmt.Errorf("delete completions by student/course: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
