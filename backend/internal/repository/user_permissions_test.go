package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

func TestUserRepository_PermissionsRoundTrip(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	repo := repository.NewUserRepository(db)
	now := time.Now().UTC()

	u := &repository.User{
		ID: testutil.NewUserID(), Username: "perm_g", Email: "perm_g@t.com", PasswordHash: "x",
		Role: "teacher", FullName: "Guru Perm", IsActive: true,
		Permissions: []string{"kelola_nilai", "kelola_absensi"},
		CreatedAt:   now, UpdatedAt: now,
	}
	require.NoError(t, repo.Create(ctx, u))

	got, err := repo.GetByID(ctx, u.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"kelola_nilai", "kelola_absensi"}, got.Permissions)

	// Update replaces the set.
	got.Permissions = []string{"kelola_tugas"}
	require.NoError(t, repo.Update(ctx, got))
	got2, _ := repo.GetByID(ctx, u.ID)
	assert.Equal(t, []string{"kelola_tugas"}, got2.Permissions)

	// Empty permissions round-trip to nil (not a JSON error).
	got2.Permissions = nil
	require.NoError(t, repo.Update(ctx, got2))
	got3, _ := repo.GetByID(ctx, u.ID)
	assert.Empty(t, got3.Permissions)
}
