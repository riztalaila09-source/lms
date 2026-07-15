package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
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
		// Teachers reference classes as a comma-joined list; rename the token there too.
		if err := rewriteTeacherKelas(ctx, tx, oldName, newName); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &Class{ID: id, Name: newName, CreatedAt: createdAt}, nil
}

// rewriteTeacherKelas updates the comma-joined "kelas" list of every teacher
// that references oldName: it renames the token to newName, or drops it entirely
// when newName is "". Other classes the teacher teaches are preserved. Runs
// inside the caller's transaction. Exact-token match avoids clobbering names
// that merely share a prefix (e.g. X-TKJ-1 vs X-TKJ-10).
func rewriteTeacherKelas(ctx context.Context, tx *sql.Tx, oldName, newName string) error {
	rows, err := tx.QueryContext(ctx,
		`SELECT id, kelas FROM users WHERE role = 'teacher' AND kelas LIKE ?`, "%"+oldName+"%")
	if err != nil {
		return fmt.Errorf("find teachers: %w", err)
	}
	type upd struct{ id, kelas string }
	var updates []upd
	for rows.Next() {
		var uid, kelas string
		if err := rows.Scan(&uid, &kelas); err != nil {
			rows.Close()
			return fmt.Errorf("scan teacher: %w", err)
		}
		var kept []string
		changed := false
		for _, p := range strings.Split(kelas, ",") {
			t := strings.TrimSpace(p)
			if t == "" {
				continue
			}
			if t == oldName {
				changed = true
				if newName != "" {
					kept = append(kept, newName)
				}
				continue
			}
			kept = append(kept, t)
		}
		if changed {
			updates = append(updates, upd{uid, strings.Join(kept, ", ")})
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate teachers: %w", err)
	}
	// Apply after the cursor is closed (SQLite is single-connection here).
	for _, u := range updates {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET kelas = ? WHERE id = ?`, u.kelas, u.id); err != nil {
			return fmt.Errorf("update teacher kelas: %w", err)
		}
	}
	return nil
}

func (r *sqliteClassRepository) Delete(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var name string
	err = tx.QueryRowContext(ctx, `SELECT name FROM classes WHERE id = ?`, id).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrClassNotFound
	}
	if err != nil {
		return fmt.Errorf("get class: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM classes WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete class: %w", err)
	}

	// Students in the deleted class lose their assignment (shown as "-") until a
	// manager reassigns them via edit; their derived jurusan is cleared too.
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET kelas = '', jurusan = '' WHERE kelas = ? AND role = 'student'`, name); err != nil {
		return fmt.Errorf("clear student kelas: %w", err)
	}

	// Teachers may teach several classes; drop just the deleted one.
	if err := rewriteTeacherKelas(ctx, tx, name, ""); err != nil {
		return err
	}

	return tx.Commit()
}
