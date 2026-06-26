package database

import (
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"

	// registers the Go seed migration via init()
	_ "lms/backend/internal/database/migrations"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

func RunMigrations(db *sql.DB) error {
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}

	if err := goose.Up(db, "migrations"); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}
