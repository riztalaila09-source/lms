package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// PendingRestoreSuffix marks a staged backup awaiting a restart to be swapped in.
const PendingRestoreSuffix = ".pending-restore"

// ApplyPendingRestore swaps a staged backup file into place before the DB is
// opened. If `path+PendingRestoreSuffix` exists and passes an integrity check,
// the live DB (plus its -wal/-shm sidecars) is replaced by it. Safe to call on
// every startup; a no-op when no staged file is present.
func ApplyPendingRestore(path string) error {
	pending := path + PendingRestoreSuffix
	if _, err := os.Stat(pending); err != nil {
		return nil // nothing staged
	}
	if err := VerifySQLiteBackup(pending); err != nil {
		_ = os.Remove(pending) // drop the bad file so we don't retry forever
		return fmt.Errorf("staged restore invalid, discarded: %w", err)
	}
	for _, p := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove %s: %w", p, err)
		}
	}
	if err := os.Rename(pending, path); err != nil {
		return fmt.Errorf("apply restore: %w", err)
	}
	log.Printf("database: applied restored backup from %s", pending)
	return nil
}

// VerifySQLiteBackup opens the file with a throwaway connection and confirms it
// is a valid SQLite DB carrying this app's migrations table.
func VerifySQLiteBackup(file string) error {
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", file))
	if err != nil {
		return err
	}
	defer db.Close()
	var res string
	if err := db.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil {
		return fmt.Errorf("integrity_check: %w", err)
	}
	if res != "ok" {
		return fmt.Errorf("integrity_check: %s", res)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM goose_db_version`).Scan(&n); err != nil {
		return fmt.Errorf("not an LMS database: %w", err)
	}
	return nil
}

func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}

	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=busy_timeout(5000)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	return db, nil
}
