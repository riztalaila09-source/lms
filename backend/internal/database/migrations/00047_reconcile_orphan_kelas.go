package migrations

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/pressly/goose/v3"
)

// One-time cleanup of "kelas" values left dangling by class deletions that
// happened before delete-cascade existed. Students pointing at a class that no
// longer exists are cleared (shown as "-"); teachers keep only the classes that
// still exist in their comma-joined list.
func init() {
	goose.AddMigrationContext(upReconcileOrphanKelas, downReconcileOrphanKelas)
}

func upReconcileOrphanKelas(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `SELECT name FROM classes`)
	if err != nil {
		return fmt.Errorf("list classes: %w", err)
	}
	valid := map[string]bool{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return fmt.Errorf("scan class: %w", err)
		}
		valid[n] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// Students reference exactly one class — clear it if it's gone.
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET kelas = '', jurusan = ''
		 WHERE role = 'student' AND kelas <> '' AND kelas NOT IN (SELECT name FROM classes)`); err != nil {
		return fmt.Errorf("clear orphan student kelas: %w", err)
	}

	// Teachers keep a comma-joined list; drop only the orphan tokens.
	trows, err := tx.QueryContext(ctx, `SELECT id, kelas FROM users WHERE role = 'teacher' AND kelas <> ''`)
	if err != nil {
		return fmt.Errorf("list teachers: %w", err)
	}
	type upd struct{ id, kelas string }
	var updates []upd
	for trows.Next() {
		var id, kelas string
		if err := trows.Scan(&id, &kelas); err != nil {
			trows.Close()
			return fmt.Errorf("scan teacher: %w", err)
		}
		var kept []string
		changed := false
		for _, p := range strings.Split(kelas, ",") {
			t := strings.TrimSpace(p)
			if t == "" {
				changed = true
				continue
			}
			if valid[t] {
				kept = append(kept, t)
			} else {
				changed = true
			}
		}
		newKelas := strings.Join(kept, ", ")
		if changed && newKelas != kelas {
			updates = append(updates, upd{id, newKelas})
		}
	}
	trows.Close()
	if err := trows.Err(); err != nil {
		return err
	}
	for _, u := range updates {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET kelas = ? WHERE id = ?`, u.kelas, u.id); err != nil {
			return fmt.Errorf("update teacher kelas: %w", err)
		}
	}
	return nil
}

// Irreversible data reconciliation; nothing to undo.
func downReconcileOrphanKelas(ctx context.Context, tx *sql.Tx) error { return nil }
