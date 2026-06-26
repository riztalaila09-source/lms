package testutil

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/database"
	_ "lms/backend/internal/database/migrations"

	_ "modernc.org/sqlite"
)

// SetupTestDB opens an in-memory SQLite database, runs all migrations, and
// registers a cleanup to close it when the test finishes.
func SetupTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:?_pragma=foreign_keys(ON)")
	require.NoError(t, err)

	t.Cleanup(func() { db.Close() })

	require.NoError(t, database.RunMigrations(db))

	return db
}

// NewUserID returns a new random UUID string.
func NewUserID() string {
	return uuid.New().String()
}

// Now returns a truncated UTC time suitable for database comparisons.
func Now() time.Time {
	return time.Now().UTC().Truncate(time.Second)
}
