package handler_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	parentv1 "lms/backend/gen/parent/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func parentClaims(role string) context.Context {
	return context.WithValue(context.Background(), middleware.TestContextKey(), &service.Claims{UserID: "u1", Role: role})
}

func TestParentHandler_CRUD(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewParentService(repository.NewParentRepository(db), userRepo)
	h := handler.NewParentHandler(svc)

	now := time.Now().UTC().Truncate(time.Second)
	student := &repository.User{ID: testutil.NewUserID(), Username: "ph_s", Email: "ph_s@x.com", PasswordHash: "x",
		Role: "student", FullName: "Siswa", IsActive: true, Kelas: "X-TKJ-1", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, student))

	t.Run("no claims → unauthenticated", func(t *testing.T) {
		_, err := h.CreateParent(context.Background(), connect.NewRequest(&parentv1.CreateParentRequest{NamaAyah: "X"}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})

	t.Run("student role → permission denied", func(t *testing.T) {
		_, err := h.CreateParent(parentClaims("student"), connect.NewRequest(&parentv1.CreateParentRequest{NamaAyah: "X"}))
		require.Error(t, err)
		assert.Equal(t, connect.CodePermissionDenied, connect.CodeOf(err))
	})

	var parentID string
	t.Run("teacher creates with child", func(t *testing.T) {
		res, err := h.CreateParent(parentClaims("teacher"), connect.NewRequest(&parentv1.CreateParentRequest{
			NamaAyah: "Pak Budi", Phone: "0812", StudentIds: []string{student.ID},
		}))
		require.NoError(t, err)
		assert.Len(t, res.Msg.Children, 1)
		parentID = res.Msg.Id
	})

	t.Run("invalid child → invalid argument", func(t *testing.T) {
		_, err := h.CreateParent(parentClaims("admin"), connect.NewRequest(&parentv1.CreateParentRequest{
			NamaAyah: "X", StudentIds: []string{"nope"},
		}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("list returns the parent", func(t *testing.T) {
		res, err := h.ListParents(parentClaims("admin"), connect.NewRequest(&parentv1.ListParentsRequest{}))
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(res.Msg.Parents), 1)
	})

	t.Run("delete", func(t *testing.T) {
		_, err := h.DeleteParent(parentClaims("admin"), connect.NewRequest(&parentv1.DeleteParentRequest{Id: parentID}))
		require.NoError(t, err)
		_, err = h.GetParent(parentClaims("admin"), connect.NewRequest(&parentv1.GetParentRequest{Id: parentID}))
		assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
	})
}
