package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrEssayNotFound = errors.New("essay question not found")

type EssayQuestion struct {
	ID         string
	MaterialID string
	Question   string
	OrderIndex int
	CreatedAt  time.Time
}

type EssayComment struct {
	ID               string
	EssayQuestionID  string
	AuthorID         string
	AuthorName       string
	AuthorRole       string
	Content          string
	CreatedAt        time.Time
}

type EssayRepository interface {
	CreateQuestion(ctx context.Context, q *EssayQuestion) error
	ListQuestions(ctx context.Context, materialID string) ([]*EssayQuestion, error)
	DeleteQuestion(ctx context.Context, id string) error
	CreateComment(ctx context.Context, c *EssayComment) error
	ListComments(ctx context.Context, essayQuestionID string) ([]*EssayComment, error)
	// DeleteCommentsByStudentCourse removes all essay answers a student wrote for
	// the materials of a course. Returns the number of rows deleted.
	DeleteCommentsByStudentCourse(ctx context.Context, courseID, authorID string) (int64, error)
}

type sqliteEssayRepository struct{ db *sql.DB }

func NewEssayRepository(db *sql.DB) EssayRepository {
	return &sqliteEssayRepository{db: db}
}

func (r *sqliteEssayRepository) CreateQuestion(ctx context.Context, q *EssayQuestion) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO essay_questions (id, material_id, question, order_index, created_at)
		VALUES (?, ?, ?, ?, ?)`,
		q.ID, q.MaterialID, q.Question, q.OrderIndex, q.CreatedAt)
	if err != nil {
		return fmt.Errorf("create essay question: %w", err)
	}
	return nil
}

func (r *sqliteEssayRepository) ListQuestions(ctx context.Context, materialID string) ([]*EssayQuestion, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, material_id, question, order_index, created_at
		FROM essay_questions WHERE material_id = ?
		ORDER BY order_index ASC, created_at ASC`, materialID)
	if err != nil {
		return nil, fmt.Errorf("list essay questions: %w", err)
	}
	defer rows.Close()

	var out []*EssayQuestion
	for rows.Next() {
		q := &EssayQuestion{}
		if err := rows.Scan(&q.ID, &q.MaterialID, &q.Question, &q.OrderIndex, &q.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan essay question: %w", err)
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

func (r *sqliteEssayRepository) DeleteQuestion(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM essay_questions WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete essay question: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrEssayNotFound
	}
	return nil
}

func (r *sqliteEssayRepository) CreateComment(ctx context.Context, c *EssayComment) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO essay_comments (id, essay_question_id, author_id, content, created_at)
		VALUES (?, ?, ?, ?, ?)`,
		c.ID, c.EssayQuestionID, c.AuthorID, c.Content, c.CreatedAt)
	if err != nil {
		return fmt.Errorf("create essay comment: %w", err)
	}
	return nil
}

func (r *sqliteEssayRepository) DeleteCommentsByStudentCourse(ctx context.Context, courseID, authorID string) (int64, error) {
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM essay_comments
		WHERE author_id = ?
		  AND essay_question_id IN (
		    SELECT eq.id FROM essay_questions eq
		    WHERE eq.material_id IN (SELECT id FROM course_materials WHERE course_id = ?)
		  )`,
		authorID, courseID)
	if err != nil {
		return 0, fmt.Errorf("delete essay comments by student/course: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (r *sqliteEssayRepository) ListComments(ctx context.Context, essayQuestionID string) ([]*EssayComment, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT ec.id, ec.essay_question_id, ec.author_id, u.full_name, u.role, ec.content, ec.created_at
		FROM essay_comments ec
		JOIN users u ON u.id = ec.author_id
		WHERE ec.essay_question_id = ?
		ORDER BY ec.created_at ASC`, essayQuestionID)
	if err != nil {
		return nil, fmt.Errorf("list essay comments: %w", err)
	}
	defer rows.Close()

	var out []*EssayComment
	for rows.Next() {
		c := &EssayComment{}
		if err := rows.Scan(&c.ID, &c.EssayQuestionID, &c.AuthorID, &c.AuthorName, &c.AuthorRole, &c.Content, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan essay comment: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
