package handler_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	schoolv1 "lms/backend/gen/school/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func schoolClaims(role string) context.Context {
	return context.WithValue(context.Background(), middleware.TestContextKey(), &service.Claims{UserID: "u1", Role: role})
}

func TestSchoolHandler_GetIsPublic(t *testing.T) {
	db := testutil.SetupTestDB(t)
	h := handler.NewSchoolHandler(service.NewSchoolService(repository.NewSchoolRepository(db)))

	// GetSchool works WITHOUT any auth claims (public landing page).
	res, err := h.GetSchool(context.Background(), connect.NewRequest(&schoolv1.GetSchoolRequest{}))
	require.NoError(t, err)
	assert.NotNil(t, res.Msg)

	// UpdateSchool still needs auth + manager rights.
	_, err = h.UpdateSchool(context.Background(), connect.NewRequest(&schoolv1.UpdateSchoolRequest{Name: proto("X")}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))

	name := "SMK Uji"
	_, err = h.UpdateSchool(schoolClaims("admin"), connect.NewRequest(&schoolv1.UpdateSchoolRequest{Name: &name}))
	require.NoError(t, err)
	got, _ := h.GetSchool(context.Background(), connect.NewRequest(&schoolv1.GetSchoolRequest{}))
	assert.Equal(t, "SMK Uji", got.Msg.Name)
}

func proto(s string) *string { return &s }
