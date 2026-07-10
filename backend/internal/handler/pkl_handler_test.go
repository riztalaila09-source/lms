package handler_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pklv1 "lms/backend/gen/pkl/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func pklClaims(userID, role string) context.Context {
	return context.WithValue(context.Background(), middleware.TestContextKey(), &service.Claims{UserID: userID, Role: role})
}

func TestPklHandler_Apply(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewPklService(repository.NewPklRepository(db))
	h := handler.NewPklHandler(svc)
	now := time.Now().UTC().Truncate(time.Second)
	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "ph_" + name, Email: name + "@ph.com", PasswordHash: "x",
			Role: role, FullName: name, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher")
	alice := mk("Alice", "student")
	bob := mk("Bob", "student")

	p, err := svc.CreatePartner(ctx, teacher.ID, "teacher", service.PklPartnerInput{Name: "PT X", Kuota: 1})
	require.NoError(t, err)

	t.Run("student applies", func(t *testing.T) {
		_, err := h.Apply(pklClaims(alice.ID, "student"), connect.NewRequest(&pklv1.ApplyRequest{PartnerId: p.ID}))
		require.NoError(t, err)
	})

	t.Run("full → failed precondition", func(t *testing.T) {
		_, err := h.Apply(pklClaims(bob.ID, "student"), connect.NewRequest(&pklv1.ApplyRequest{PartnerId: p.ID}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
	})

	t.Run("no claims → unauthenticated", func(t *testing.T) {
		_, err := h.Apply(context.Background(), connect.NewRequest(&pklv1.ApplyRequest{PartnerId: p.ID}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})
}
