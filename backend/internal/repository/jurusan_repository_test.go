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

func TestJurusanRepository_CrudAndRenameCascade(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	jurRepo := repository.NewJurusanRepository(db)
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	// Seeded defaults (from migration) exist.
	list, err := jurRepo.List(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, list, "seeded jurusans present")

	// Create a new one.
	require.NoError(t, jurRepo.Create(ctx, &repository.Jurusan{ID: testutil.NewUserID(), Name: "JUR-X", CreatedAt: now}))
	// Duplicate rejected.
	assert.ErrorIs(t, jurRepo.Create(ctx, &repository.Jurusan{ID: testutil.NewUserID(), Name: "JUR-X", CreatedAt: now}), repository.ErrJurusanDuplicate)

	var jurID string
	list, _ = jurRepo.List(ctx)
	for _, j := range list {
		if j.Name == "JUR-X" {
			jurID = j.ID
		}
	}
	require.NotEmpty(t, jurID)

	mkStudent := func(s, jurusan string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "jr_" + s, Email: s + "@jr.com", PasswordHash: "x", Role: "student", FullName: "S " + s, IsActive: true, Jurusan: jurusan, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	a := mkStudent("a", "JUR-X")
	b := mkStudent("b", "TKJ")

	// Rename cascades to students' jurusan.
	renamed, err := jurRepo.Rename(ctx, jurID, "AKL")
	require.NoError(t, err)
	assert.Equal(t, "AKL", renamed.Name)
	ga, _ := userRepo.GetByID(ctx, a.ID)
	gb, _ := userRepo.GetByID(ctx, b.ID)
	assert.Equal(t, "AKL", ga.Jurusan)
	assert.Equal(t, "TKJ", gb.Jurusan, "other majors untouched")

	// Delete.
	require.NoError(t, jurRepo.Delete(ctx, jurID))
	assert.ErrorIs(t, jurRepo.Delete(ctx, jurID), repository.ErrJurusanNotFound)
}
