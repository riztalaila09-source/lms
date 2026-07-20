package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

// After all migrations run, the default admin (admin@lms.local / admin123) must
// be present and ACTIVE — migration 00010 disabled it and 00058 re-enables it.
func TestAdminSeed_LoginWorksAfterMigrations(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewUserService(repository.NewUserRepository(db), newTestJWTService(), nil)

	res, err := svc.Login(ctx, "admin@lms.local", "admin123")
	require.NoError(t, err, "default admin must be able to log in")
	assert.NotEmpty(t, res.Token)
	assert.Equal(t, "admin", res.User.Role)
	assert.True(t, res.User.IsActive, "admin account must be active")
}
