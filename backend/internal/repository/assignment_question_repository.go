package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

type AssignmentQuestion struct {
	ID           string
	AssignmentID string
	Question     string
	Options      []string
	CorrectIndex int
	OrderIndex   int
	Image        string
}

type AssignmentQuestionRepository interface {
	// SetForAssignment replaces the whole question set of an assignment.
	SetForAssignment(ctx context.Context, assignmentID string, qs []*AssignmentQuestion) error
	ListByAssignment(ctx context.Context, assignmentID string) ([]*AssignmentQuestion, error)
}

type sqliteAssignmentQuestionRepository struct{ db *sql.DB }

func NewAssignmentQuestionRepository(db *sql.DB) AssignmentQuestionRepository {
	return &sqliteAssignmentQuestionRepository{db: db}
}

func (r *sqliteAssignmentQuestionRepository) SetForAssignment(ctx context.Context, assignmentID string, qs []*AssignmentQuestion) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM assignment_questions WHERE assignment_id = ?`, assignmentID); err != nil {
		return fmt.Errorf("clear questions: %w", err)
	}
	for i, q := range qs {
		opts, _ := json.Marshal(q.Options)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO assignment_questions (id, assignment_id, question, options_json, correct_index, order_index, image)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), assignmentID, q.Question, string(opts), q.CorrectIndex, i, q.Image); err != nil {
			return fmt.Errorf("insert question: %w", err)
		}
	}
	return tx.Commit()
}

func (r *sqliteAssignmentQuestionRepository) ListByAssignment(ctx context.Context, assignmentID string) ([]*AssignmentQuestion, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, assignment_id, question, options_json, correct_index, order_index, image
		FROM assignment_questions WHERE assignment_id = ? ORDER BY order_index ASC, created_at ASC`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("list questions: %w", err)
	}
	defer rows.Close()

	var out []*AssignmentQuestion
	for rows.Next() {
		q := &AssignmentQuestion{}
		var optsJSON string
		if err := rows.Scan(&q.ID, &q.AssignmentID, &q.Question, &optsJSON, &q.CorrectIndex, &q.OrderIndex, &q.Image); err != nil {
			return nil, fmt.Errorf("scan question: %w", err)
		}
		_ = json.Unmarshal([]byte(optsJSON), &q.Options)
		out = append(out, q)
	}
	return out, rows.Err()
}
