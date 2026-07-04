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

func TestClassRepository_RenameCascades(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	classRepo := repository.NewClassRepository(db)
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "CLS-A", CreatedAt: now}))
	var clsID string
	list, _ := classRepo.List(ctx)
	for _, c := range list {
		if c.Name == "CLS-A" {
			clsID = c.ID
		}
	}
	require.NotEmpty(t, clsID)

	mkStudent := func(s, kelas string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "cr_" + s, Email: s + "@cr.com", PasswordHash: "x", Role: "student", FullName: "S " + s, IsActive: true, Kelas: kelas, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	in1 := mkStudent("in1", "CLS-A")
	in2 := mkStudent("in2", "CLS-A")
	other := mkStudent("other", "CLS-B")

	// Rename cascades to students' kelas.
	renamed, err := classRepo.Rename(ctx, clsID, "X TKJ 1")
	require.NoError(t, err)
	assert.Equal(t, "X TKJ 1", renamed.Name)

	g1, _ := userRepo.GetByID(ctx, in1.ID)
	g2, _ := userRepo.GetByID(ctx, in2.ID)
	go2, _ := userRepo.GetByID(ctx, other.ID)
	assert.Equal(t, "X TKJ 1", g1.Kelas)
	assert.Equal(t, "X TKJ 1", g2.Kelas)
	assert.Equal(t, "CLS-B", go2.Kelas, "students in other classes are untouched")

	// studentCount tracks the new name.
	list, _ = classRepo.List(ctx)
	for _, c := range list {
		if c.ID == clsID {
			assert.Equal(t, "X TKJ 1", c.Name)
			assert.Equal(t, 2, c.StudentCount)
		}
	}

	// Renaming to an existing class name is rejected.
	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "X TKR 1", CreatedAt: now}))
	_, err = classRepo.Rename(ctx, clsID, "X TKR 1")
	assert.ErrorIs(t, err, repository.ErrClassDuplicate)
}
