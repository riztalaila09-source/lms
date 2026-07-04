package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

var ErrQuestionNotFound = errors.New("question not found")

type Question struct {
	ID           string
	MaterialID   string
	Question     string
	Options      []string
	CorrectIndex int
	OrderIndex   int
	Image        string
}

type QuestionRepository interface {
	Create(ctx context.Context, q *Question) error
	ListByMaterial(ctx context.Context, materialID string) ([]*Question, error)
	Delete(ctx context.Context, id string) error
	GetMaterialID(ctx context.Context, questionID string) (string, error)
}

type sqliteQuestionRepository struct{ db *sql.DB }

func NewQuestionRepository(db *sql.DB) QuestionRepository {
	return &sqliteQuestionRepository{db: db}
}

func (r *sqliteQuestionRepository) Create(ctx context.Context, q *Question) error {
	opts, err := json.Marshal(q.Options)
	if err != nil {
		return fmt.Errorf("marshal options: %w", err)
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO material_questions (id, material_id, question, options_json, correct_index, order_index, image)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		q.ID, q.MaterialID, q.Question, string(opts), q.CorrectIndex, q.OrderIndex, q.Image)
	if err != nil {
		return fmt.Errorf("create question: %w", err)
	}
	return nil
}

func (r *sqliteQuestionRepository) ListByMaterial(ctx context.Context, materialID string) ([]*Question, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, material_id, question, options_json, correct_index, order_index, image
		FROM material_questions WHERE material_id = ? ORDER BY order_index ASC, created_at ASC`, materialID)
	if err != nil {
		return nil, fmt.Errorf("list questions: %w", err)
	}
	defer rows.Close()

	var out []*Question
	for rows.Next() {
		q := &Question{}
		var optsJSON string
		if err := rows.Scan(&q.ID, &q.MaterialID, &q.Question, &optsJSON, &q.CorrectIndex, &q.OrderIndex, &q.Image); err != nil {
			return nil, fmt.Errorf("scan question: %w", err)
		}
		_ = json.Unmarshal([]byte(optsJSON), &q.Options)
		out = append(out, q)
	}
	return out, rows.Err()
}

func (r *sqliteQuestionRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM material_questions WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete question: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrQuestionNotFound
	}
	return nil
}

func (r *sqliteQuestionRepository) GetMaterialID(ctx context.Context, questionID string) (string, error) {
	var mid string
	err := r.db.QueryRowContext(ctx, `SELECT material_id FROM material_questions WHERE id = ?`, questionID).Scan(&mid)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrQuestionNotFound
	}
	if err != nil {
		return "", fmt.Errorf("get question material: %w", err)
	}
	return mid, nil
}
