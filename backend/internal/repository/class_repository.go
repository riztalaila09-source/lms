package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrClassNotFound = errors.New("class not found")
var ErrClassDuplicate = errors.New("class already exists")

type Class struct {
	ID           string
	Name         string
	StudentCount int
	CreatedAt    time.Time
}

type ClassRepository interface {
	Create(ctx context.Context, c *Class) error
	List(ctx context.Context) ([]*Class, error)
	Delete(ctx context.Context, id string) error
	// Rename renames a class and cascades the new name onto students' kelas.
	Rename(ctx context.Context, id, newName string) (*Class, error)
}

type sqliteClassRepository struct{ db *sql.DB }

func NewClassRepository(db *sql.DB) ClassRepository {
	return &sqliteClassRepository{db: db}
}

func (r *sqliteClassRepository) Create(ctx context.Context, c *Class) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO classes (id, name, created_at) VALUES (?, ?, ?)`, c.ID, c.Name, c.CreatedAt)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrClassDuplicate
		}
		return fmt.Errorf("create class: %w", err)
	}
	return nil
}

func (r *sqliteClassRepository) List(ctx context.Context) ([]*Class, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.id, c.name,
		       (SELECT COUNT(*) FROM users u WHERE u.role='student' AND u.kelas = c.name) AS student_count,
		       c.created_at
		FROM classes c ORDER BY c.name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list classes: %w", err)
	}
	defer rows.Close()

	var out []*Class
	for rows.Next() {
		c := &Class{}
		if err := rows.Scan(&c.ID, &c.Name, &c.StudentCount, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan class: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *sqliteClassRepository) Rename(ctx context.Context, id, newName string) (*Class, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var oldName string
	var createdAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT name, created_at FROM classes WHERE id = ?`, id).Scan(&oldName, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrClassNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get class: %w", err)
	}

	if newName != oldName {
		if _, err := tx.ExecContext(ctx, `UPDATE classes SET name = ? WHERE id = ?`, newName, id); err != nil {
			if isSQLiteConstraintError(err) {
				return nil, ErrClassDuplicate
			}
			return nil, fmt.Errorf("rename class: %w", err)
		}
		// Cascade to students who reference the class by name; also re-derive
		// their jurusan from the new class name (X-TKJ-1 → TKJ).
		jur := JurusanFromKelas(newName)
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET kelas = ?, jurusan = CASE WHEN ?<>'' THEN ? ELSE jurusan END
			 WHERE kelas = ? AND role = 'student'`, newName, jur, jur, oldName); err != nil {
			return nil, fmt.Errorf("cascade kelas: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &Class{ID: id, Name: newName, CreatedAt: createdAt}, nil
}

func (r *sqliteClassRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM classes WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete class: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrClassNotFound
	}
	return nil
}
