package handler_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	attendancev1 "lms/backend/gen/attendance/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func attCtx(userID, role string) context.Context {
	return context.WithValue(context.Background(), middleware.TestContextKey(), &service.Claims{UserID: userID, Role: role})
}

func TestAttendanceHandler_Scan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	attRepo := repository.NewAttendanceRepository(db)
	svc := service.NewAttendanceService(attRepo, repository.NewCourseRepository(db))
	h := handler.NewAttendanceHandler(svc)
	now := time.Now().UTC().Truncate(time.Second)

	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "h_" + name, Email: name + "@h.com",
			PasswordHash: "x", Role: role, FullName: name, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher")
	student := mk("Siswa", "student")

	_, tok, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
		Mapel: "Matematika", Kelas: "Lab 1", Tanggal: "2026-07-09", JamKe: 1, StartTime: "07:00", EndTime: "09:00",
	})
	require.NoError(t, err)

	t.Run("valid code → hadir", func(t *testing.T) {
		res, err := h.Scan(attCtx(student.ID, "student"), connect.NewRequest(&attendancev1.ScanRequest{Code: tok.Code}))
		require.NoError(t, err)
		assert.Equal(t, "hadir", res.Msg.Status)
		assert.False(t, res.Msg.Already)
		assert.Equal(t, "Matematika", res.Msg.Session.Mapel)
	})

	t.Run("no claims → unauthenticated", func(t *testing.T) {
		_, err := h.Scan(context.Background(), connect.NewRequest(&attendancev1.ScanRequest{Code: tok.Code}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})

	t.Run("invalid token → invalid argument", func(t *testing.T) {
		_, err := h.Scan(attCtx(student.ID, "student"), connect.NewRequest(&attendancev1.ScanRequest{Token: "nope"}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("expired token → failed precondition", func(t *testing.T) {
		sess2, _, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
			Kelas: "X", Tanggal: "2026-07-09", StartTime: "10:00", EndTime: "11:00",
		})
		require.NoError(t, err)
		require.NoError(t, attRepo.SetToken(ctx, sess2.ID, "EXPTOK", "EXPIRD", time.Now().Add(-time.Minute)))
		_, err = h.Scan(attCtx(student.ID, "student"), connect.NewRequest(&attendancev1.ScanRequest{Token: "EXPTOK"}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
	})
}
