package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"

	"lms/backend/internal/normalize"
)

func init() {
	goose.AddMigrationContext(upNormalizeNamesPhones, downNormalizeNamesPhones)
}

// sqlExecer is satisfied by both *sql.Tx and *sql.DB, so NormalizePeople can run
// inside the migration transaction and be exercised directly from tests.
type sqlExecer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func upNormalizeNamesPhones(ctx context.Context, tx *sql.Tx) error {
	_, err := NormalizePeople(ctx, tx)
	return err
}

// The down migration is a no-op: we don't want a rollback to un-normalize data.
func downNormalizeNamesPhones(ctx context.Context, tx *sql.Tx) error { return nil }

// NormalizePeople rewrites existing user & parent names to Title Case and phone
// numbers to local "0…" form. Idempotent; returns the number of rows updated.
func NormalizePeople(ctx context.Context, db sqlExecer) (int, error) {
	type row struct{ id, name, phone string }

	collect := func(query string) ([]row, error) {
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.name, &r.phone); err != nil {
				return nil, err
			}
			out = append(out, r)
		}
		return out, rows.Err()
	}

	updated := 0
	apply := func(rows []row, updateSQL string) error {
		for _, r := range rows {
			nn, np := normalize.Name(r.name), normalize.PhoneID(r.phone)
			if nn == r.name && np == r.phone {
				continue
			}
			if _, err := db.ExecContext(ctx, updateSQL, nn, np, r.id); err != nil {
				return err
			}
			updated++
		}
		return nil
	}

	// Read fully before writing (SQLite keeps a single connection open).
	users, err := collect(`SELECT id, full_name, phone FROM users`)
	if err != nil {
		return updated, err
	}
	parents, err := collect(`SELECT id, nama_ortu, phone FROM parents`)
	if err != nil {
		return updated, err
	}
	if err := apply(users, `UPDATE users SET full_name = ?, phone = ? WHERE id = ?`); err != nil {
		return updated, err
	}
	if err := apply(parents, `UPDATE parents SET nama_ortu = ?, phone = ? WHERE id = ?`); err != nil {
		return updated, err
	}
	return updated, nil
}
