package migrations

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

// Migration 00010 disabled the admin account back when the product was
// "teacher-driven". Admin is a first-class role again (Admin panel, access
// policy, backup, dsb.), so re-enable the default admin login and make sure it
// exists. On a fresh database this restores admin@lms.local / admin123.
func init() {
	goose.AddMigrationContext(upReenableAdmin, downReenableAdmin)
}

func upReenableAdmin(ctx context.Context, tx *sql.Tx) error {
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}
	// Ensure the default admin exists (no-op if already present).
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, username, email, password_hash, role, full_name, is_active)
		VALUES (?, 'admin', 'admin@lms.local', ?, 'admin', 'System Admin', 1)
		ON CONFLICT(email) DO NOTHING
	`, uuid.New().String(), string(hash)); err != nil {
		return fmt.Errorf("ensure admin: %w", err)
	}
	// Re-enable any disabled admin account (existing password is preserved).
	if _, err := tx.ExecContext(ctx, `UPDATE users SET is_active = 1 WHERE role = 'admin'`); err != nil {
		return fmt.Errorf("enable admin: %w", err)
	}
	return nil
}

func downReenableAdmin(ctx context.Context, tx *sql.Tx) error {
	// Intentionally a no-op: we don't want a rollback to lock admins out again.
	return nil
}
