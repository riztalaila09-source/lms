package database_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/database" // registers the modernc sqlite driver
)

// writeLMSDB creates a minimal valid LMS SQLite file (has goose_db_version) with
// a marker row, so we can prove which file "won" after a restore swap.
func writeLMSDB(t *testing.T, path, marker string) {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+path)
	require.NoError(t, err)
	_, err = db.Exec(`CREATE TABLE goose_db_version (id INTEGER PRIMARY KEY, version_id INTEGER, is_applied INTEGER, tstamp DATETIME)`)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO goose_db_version (version_id, is_applied) VALUES (1, 1)`)
	require.NoError(t, err)
	_, err = db.Exec(`CREATE TABLE marker (v TEXT)`)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO marker (v) VALUES (?)`, marker)
	require.NoError(t, err)
	require.NoError(t, db.Close())
}

func readMarker(t *testing.T, path string) string {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	require.NoError(t, err)
	defer db.Close()
	var v string
	require.NoError(t, db.QueryRow(`SELECT v FROM marker`).Scan(&v))
	return v
}

func TestApplyPendingRestore_Swaps(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "lms.db")
	writeLMSDB(t, path, "LIVE")
	writeLMSDB(t, path+database.PendingRestoreSuffix, "RESTORED")

	require.NoError(t, database.ApplyPendingRestore(path))

	// Staged file consumed; live DB now carries the restored marker.
	_, err := os.Stat(path + database.PendingRestoreSuffix)
	assert.True(t, os.IsNotExist(err), "pending file should be gone")
	assert.Equal(t, "RESTORED", readMarker(t, path))
}

func TestApplyPendingRestore_Noop(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "lms.db")
	writeLMSDB(t, path, "LIVE")
	// No pending file → live DB untouched.
	require.NoError(t, database.ApplyPendingRestore(path))
	assert.Equal(t, "LIVE", readMarker(t, path))
}

func TestApplyPendingRestore_DiscardsInvalid(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "lms.db")
	writeLMSDB(t, path, "LIVE")
	require.NoError(t, os.WriteFile(path+database.PendingRestoreSuffix, []byte("not a database"), 0o600))

	err := database.ApplyPendingRestore(path)
	require.Error(t, err) // reported, but...
	// ...the bad staged file is dropped and the live DB is left intact.
	_, statErr := os.Stat(path + database.PendingRestoreSuffix)
	assert.True(t, os.IsNotExist(statErr), "invalid pending file should be discarded")
	assert.Equal(t, "LIVE", readMarker(t, path))
}
