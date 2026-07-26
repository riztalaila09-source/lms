package service_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func TestSchoolService_RestoreBackup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// A real, valid LMS snapshot to restore.
	snapshot, _, err := svc.ExportBackup(ctx, "admin")
	require.NoError(t, err)
	require.NotEmpty(t, snapshot)

	// Point the service at a db path inside a temp dir.
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "lms.db")
	svc.SetDBPath(dbPath)

	// Non-admin denied.
	_, err = svc.RestoreBackup(ctx, "teacher", snapshot)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Non-SQLite payload rejected.
	_, err = svc.RestoreBackup(ctx, "admin", []byte("this is not a database"))
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// Valid snapshot is staged as <dbPath>.pending-restore (not applied yet).
	msg, err := svc.RestoreBackup(ctx, "admin", snapshot)
	require.NoError(t, err)
	assert.Contains(t, msg, "Restart")
	staged, err := os.ReadFile(dbPath + ".pending-restore")
	require.NoError(t, err)
	assert.Equal(t, snapshot, staged)

	// A corrupt SQLite-looking file (valid header, garbage body) is rejected.
	bad := append([]byte("SQLite format 3\x00"), make([]byte, 200)...)
	_, err = svc.RestoreBackup(ctx, "admin", bad)
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
}

func TestSchoolService_RestoreBackup_Unavailable(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))
	// No SetDBPath → restore unavailable.
	_, err := svc.RestoreBackup(ctx, "admin", []byte("SQLite format 3\x00"))
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
}
