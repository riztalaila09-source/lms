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

func mkStudentP(t *testing.T, ur repository.UserRepository, ctx context.Context, name string) *repository.User {
	now := time.Now().UTC().Truncate(time.Second)
	sfx := testutil.NewUserID()[:8]
	u := &repository.User{ID: testutil.NewUserID(), Username: "pp_" + sfx, Email: sfx + "@pp.com", PasswordHash: "x",
		Role: "student", FullName: name, IsActive: true, Kelas: "X-TKJ-1", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, ur.Create(ctx, u))
	return u
}

func TestParentRepository_CRUDAndChildren(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	pr := repository.NewParentRepository(db)
	ur := repository.NewUserRepository(db)

	kakak := mkStudentP(t, ur, ctx, "Kakak")
	adik := mkStudentP(t, ur, ctx, "Adik")
	lain := mkStudentP(t, ur, ctx, "Lain")

	p := &repository.Parent{ID: testutil.NewUserID(), NamaAyah: "Pak Budi", NamaIbu: "Bu Sri", Phone: "0812", Pekerjaan: "Petani"}
	require.NoError(t, pr.Create(ctx, p))

	// Link two siblings to the one household.
	require.NoError(t, pr.SetChildren(ctx, p.ID, []string{kakak.ID, adik.ID}))

	got, err := pr.GetByID(ctx, p.ID)
	require.NoError(t, err)
	assert.Equal(t, "Pak Budi", got.NamaAyah)
	assert.Len(t, got.Children, 2, "one parent can have many children")

	// The third student remains unlinked.
	gl, _ := ur.GetByID(ctx, lain.ID)
	assert.Equal(t, "", gl.ParentID)
	gk, _ := ur.GetByID(ctx, kakak.ID)
	assert.Equal(t, p.ID, gk.ParentID)

	// SetChildren replaces the set: drop adik, keep kakak.
	require.NoError(t, pr.SetChildren(ctx, p.ID, []string{kakak.ID}))
	got, _ = pr.GetByID(ctx, p.ID)
	require.Len(t, got.Children, 1)
	assert.Equal(t, kakak.ID, got.Children[0].StudentID)
	ga, _ := ur.GetByID(ctx, adik.ID)
	assert.Equal(t, "", ga.ParentID, "detached child is unlinked")

	// Update fields.
	got.NamaWali = "Paman"
	require.NoError(t, pr.Update(ctx, got))
	got2, _ := pr.GetByID(ctx, p.ID)
	assert.Equal(t, "Paman", got2.NamaWali)

	// List finds it (with children attached).
	list, total, err := pr.List(ctx, "", 1, 20)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, total, 1)
	var found *repository.Parent
	for _, x := range list {
		if x.ID == p.ID {
			found = x
		}
	}
	require.NotNil(t, found)
	assert.Len(t, found.Children, 1)

	// Search by phone.
	_, totalSearch, err := pr.List(ctx, "0812", 1, 20)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, totalSearch, 1)

	// Delete detaches remaining children (ON DELETE SET NULL) but keeps the student.
	require.NoError(t, pr.Delete(ctx, p.ID))
	_, err = pr.GetByID(ctx, p.ID)
	assert.ErrorIs(t, err, repository.ErrParentNotFound)
	gk2, err := ur.GetByID(ctx, kakak.ID)
	require.NoError(t, err, "student still exists after parent deletion")
	assert.Equal(t, "", gk2.ParentID, "child unlinked after parent deleted")

	// Deleting a missing parent reports not-found.
	assert.ErrorIs(t, pr.Delete(ctx, "no-such"), repository.ErrParentNotFound)
}
