package migrations

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

func init() {
	goose.AddMigrationContext(upSeedAdmin, downSeedAdmin)
}

func upSeedAdmin(ctx context.Context, tx *sql.Tx) error {
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO users (id, username, email, password_hash, role, full_name, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(email) DO NOTHING
	`,
		uuid.New().String(),
		"admin",
		"admin@lms.local",
		string(hash),
		"admin",
		"System Admin",
		1,
	)
	return err
}

func downSeedAdmin(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE username = 'admin' AND role = 'admin'`)
	return err
}
