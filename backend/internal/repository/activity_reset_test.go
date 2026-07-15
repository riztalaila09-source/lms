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

// ResetAll menghapus SELURUH catatan login (semua pengguna sekaligus).
func TestActivity_ResetAll(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	actRepo := repository.NewActivityRepository(db)
	now := time.Now().UTC()

	mk := func(name string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "ar_" + name, Email: name + "@ar.com", PasswordHash: "x",
			Role: "student", FullName: name, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	a, b := mk("Ana"), mk("Budi")
	require.NoError(t, actRepo.Record(ctx, testutil.NewUserID(), a.ID, "login"))
	require.NoError(t, actRepo.Record(ctx, testutil.NewUserID(), a.ID, "login"))
	require.NoError(t, actRepo.Record(ctx, testutil.NewUserID(), b.ID, "login"))

	entries, total, err := actRepo.Aggregate(ctx, "", 1, 50)
	require.NoError(t, err)
	assert.Equal(t, 2, total) // 2 pengguna punya login
	assert.Len(t, entries, 2)

	require.NoError(t, actRepo.ResetAll(ctx))

	entries, total, err = actRepo.Aggregate(ctx, "", 1, 50)
	require.NoError(t, err)
	assert.Equal(t, 0, total)
	assert.Empty(t, entries)
}
