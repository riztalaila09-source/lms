package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrJurusanNotFound = errors.New("jurusan not found")
var ErrJurusanDuplicate = errors.New("jurusan already exists")

type Jurusan struct {
	ID           string
	Name         string
	StudentCount int
	CreatedAt    time.Time
}

type JurusanRepository interface {
	Create(ctx context.Context, j *Jurusan) error
	List(ctx context.Context) ([]*Jurusan, error)
	Delete(ctx context.Context, id string) error
	// Rename renames a jurusan and cascades the new name onto students' jurusan.
	Rename(ctx context.Context, id, newName string) (*Jurusan, error)
}

type sqliteJurusanRepository struct{ db *sql.DB }

func NewJurusanRepository(db *sql.DB) JurusanRepository {
	return &sqliteJurusanRepository{db: db}
}

func (r *sqliteJurusanRepository) Create(ctx context.Context, j *Jurusan) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO jurusans (id, name, created_at) VALUES (?, ?, ?)`, j.ID, j.Name, j.CreatedAt)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrJurusanDuplicate
		}
		return fmt.Errorf("create jurusan: %w", err)
	}
	return nil
}

func (r *sqliteJurusanRepository) List(ctx context.Context) ([]*Jurusan, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT j.id, j.name,
		       (SELECT COUNT(*) FROM users u WHERE u.role='student' AND u.jurusan = j.name) AS student_count,
		       j.created_at
		FROM jurusans j ORDER BY j.name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list jurusans: %w", err)
	}
	defer rows.Close()

	var out []*Jurusan
	for rows.Next() {
		j := &Jurusan{}
		if err := rows.Scan(&j.ID, &j.Name, &j.StudentCount, &j.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan jurusan: %w", err)
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

func (r *sqliteJurusanRepository) Rename(ctx context.Context, id, newName string) (*Jurusan, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var oldName string
	var createdAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT name, created_at FROM jurusans WHERE id = ?`, id).Scan(&oldName, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrJurusanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get jurusan: %w", err)
	}

	if newName != oldName {
		if _, err := tx.ExecContext(ctx, `UPDATE jurusans SET name = ? WHERE id = ?`, newName, id); err != nil {
			if isSQLiteConstraintError(err) {
				return nil, ErrJurusanDuplicate
			}
			return nil, fmt.Errorf("rename jurusan: %w", err)
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET jurusan = ? WHERE jurusan = ? AND role = 'student'`, newName, oldName); err != nil {
			return nil, fmt.Errorf("cascade jurusan: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &Jurusan{ID: id, Name: newName, CreatedAt: createdAt}, nil
}

func (r *sqliteJurusanRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM jurusans WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete jurusan: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrJurusanNotFound
	}
	return nil
}
