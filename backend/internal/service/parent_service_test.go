package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func setupParentSvc(t *testing.T) (*service.ParentService, repository.UserRepository, context.Context) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewParentService(repository.NewParentRepository(db), userRepo)
	return svc, userRepo, ctx
}

func mkStudentSvc(t *testing.T, ur repository.UserRepository, ctx context.Context, name, role string) *repository.User {
	now := time.Now().UTC().Truncate(time.Second)
	sfx := testutil.NewUserID()[:8]
	u := &repository.User{ID: testutil.NewUserID(), Username: "ps_" + sfx, Email: sfx + "@ps.com", PasswordHash: "x",
		Role: role, FullName: name, IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, ur.Create(ctx, u))
	return u
}

func TestParentService_CreateLinksChildren(t *testing.T) {
	svc, ur, ctx := setupParentSvc(t)
	a := mkStudentSvc(t, ur, ctx, "Anak1", "student")
	b := mkStudentSvc(t, ur, ctx, "Anak2", "student")

	p, err := svc.CreateParent(ctx, "teacher", service.ParentInput{
		NamaOrtu: "Pak A", Phone: "0899", StudentIDs: []string{a.ID, b.ID},
	})
	require.NoError(t, err)
	assert.Len(t, p.Children, 2)
}

func TestParentService_GetMyParent(t *testing.T) {
	svc, ur, ctx := setupParentSvc(t)
	child := mkStudentSvc(t, ur, ctx, "Anak", "student")
	orphan := mkStudentSvc(t, ur, ctx, "Yatim", "student")

	// No linked parent yet -> nil, no error (so callers render an empty result).
	got, err := svc.GetMyParent(ctx, child.ID)
	require.NoError(t, err)
	assert.Nil(t, got)

	// After linking, the child sees their guardian (read-only).
	_, err = svc.CreateParent(ctx, "admin", service.ParentInput{NamaOrtu: "Bunda", Phone: "0812", StudentIDs: []string{child.ID}})
	require.NoError(t, err)
	got, err = svc.GetMyParent(ctx, child.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "Bunda", got.NamaOrtu)
	assert.Equal(t, "0812", got.Phone)

	// A student not linked to that parent still gets nil.
	got, err = svc.GetMyParent(ctx, orphan.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestParentService_ManagerGate(t *testing.T) {
	svc, ur, ctx := setupParentSvc(t)
	a := mkStudentSvc(t, ur, ctx, "Anak", "student")

	_, err := svc.CreateParent(ctx, "student", service.ParentInput{NamaOrtu: "X", StudentIDs: []string{a.ID}})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	_, _, err = svc.ListParents(ctx, "student", "", 1, 20)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
}

func TestParentService_ValidatesStudents(t *testing.T) {
	svc, ur, ctx := setupParentSvc(t)
	teacher := mkStudentSvc(t, ur, ctx, "Guru", "teacher") // a non-student id

	// Non-existent id.
	_, err := svc.CreateParent(ctx, "admin", service.ParentInput{NamaOrtu: "X", StudentIDs: []string{"nope"}})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// Existing user that is not a student.
	_, err = svc.CreateParent(ctx, "admin", service.ParentInput{NamaOrtu: "X", StudentIDs: []string{teacher.ID}})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// No name at all.
	_, err = svc.CreateParent(ctx, "admin", service.ParentInput{})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
}

func TestParentService_UpdateReplacesChildren(t *testing.T) {
	svc, ur, ctx := setupParentSvc(t)
	a := mkStudentSvc(t, ur, ctx, "A", "student")
	b := mkStudentSvc(t, ur, ctx, "B", "student")

	p, err := svc.CreateParent(ctx, "admin", service.ParentInput{NamaOrtu: "Bu B", StudentIDs: []string{a.ID}})
	require.NoError(t, err)

	updated, err := svc.UpdateParent(ctx, "admin", p.ID, service.ParentInput{NamaOrtu: "Bu B", StudentIDs: []string{b.ID}})
	require.NoError(t, err)
	require.Len(t, updated.Children, 1)
	assert.Equal(t, b.ID, updated.Children[0].StudentID)

	ga, _ := ur.GetByID(ctx, a.ID)
	assert.Equal(t, "", ga.ParentID, "removed child detached")

	// Update missing parent → not found.
	_, err = svc.UpdateParent(ctx, "admin", "nope", service.ParentInput{NamaOrtu: "X"})
	assert.ErrorIs(t, err, service.ErrParentNotFound)
}
