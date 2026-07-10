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

// Gender round-trips through Create → GetByID → Update → GetByID.
func TestUserRepository_Gender(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	repo := repository.NewUserRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	u := &repository.User{
		ID: testutil.NewUserID(), Username: "g_u", Email: "g@u.com", PasswordHash: "x",
		Role: "student", FullName: "Gina", IsActive: true, Gender: "P", CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, repo.Create(ctx, u))

	got, err := repo.GetByID(ctx, u.ID)
	require.NoError(t, err)
	assert.Equal(t, "P", got.Gender)

	got.Gender = "L"
	require.NoError(t, repo.Update(ctx, got))
	got, err = repo.GetByID(ctx, u.ID)
	require.NoError(t, err)
	assert.Equal(t, "L", got.Gender)
}

// TeacherStats counts male/female students (blank gender excluded from both).
func TestDashboardRepository_TeacherStats_Gender(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	dashRepo := repository.NewDashboardRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	mk := func(name, gender string) {
		u := &repository.User{ID: testutil.NewUserID(), Username: "gd_" + name, Email: name + "@gd.com",
			PasswordHash: "x", Role: "student", FullName: name, IsActive: true, Gender: gender, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
	}
	// Baseline from seed data (gender='') so we assert on the delta we add.
	base, err := dashRepo.TeacherStats(ctx)
	require.NoError(t, err)

	mk("A", "L")
	mk("B", "L")
	mk("C", "P")
	mk("D", "") // unspecified — counted in neither

	got, err := dashRepo.TeacherStats(ctx)
	require.NoError(t, err)
	assert.Equal(t, base.SiswaLaki+2, got.SiswaLaki)
	assert.Equal(t, base.SiswaPerempuan+1, got.SiswaPerempuan)
}
