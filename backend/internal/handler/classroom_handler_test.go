package handler_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	classroomv1 "lms/backend/gen/classroom/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func classroomCtx(userID, role string) context.Context {
	return context.WithValue(context.Background(), middleware.TestContextKey(), &service.Claims{UserID: userID, Role: role})
}

func TestClassroomHandler_Activities(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	h := handler.NewClassroomHandler(service.NewClassroomService(repository.NewClassroomRepository(db)))
	now := time.Now().UTC()

	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "ch_" + name, Email: name + "@ch.com", PasswordHash: "x",
			Role: role, FullName: name, Kelas: "X-TKJ-1", IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher")
	student := mk("Ana", "student")
	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`, courseID, "C1", "Mapel", teacher.ID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO course_enrollments (id, course_id, student_id) VALUES (?, ?, ?)`, testutil.NewUserID(), courseID, student.ID)
	require.NoError(t, err)

	const tgl = "2026-08-10"

	t.Run("no claims → unauthenticated", func(t *testing.T) {
		_, err := h.ListLeaderboard(context.Background(), connect.NewRequest(&classroomv1.ListLeaderboardRequest{CourseId: courseID, Tanggal: tgl}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})

	t.Run("student denied AddActivityPoint but can view leaderboard", func(t *testing.T) {
		_, err := h.AddActivityPoint(classroomCtx(student.ID, "student"), connect.NewRequest(&classroomv1.AddActivityPointRequest{
			CourseId: courseID, StudentId: student.ID, Tanggal: tgl, Points: 5,
		}))
		require.Error(t, err)
		assert.Equal(t, connect.CodePermissionDenied, connect.CodeOf(err))

		_, err = h.ListLeaderboard(classroomCtx(student.ID, "student"), connect.NewRequest(&classroomv1.ListLeaderboardRequest{CourseId: courseID, Tanggal: ""}))
		require.NoError(t, err) // siswa boleh melihat papan peringkat
	})

	t.Run("teacher adds points cumulatively & leaderboard reflects total", func(t *testing.T) {
		for _, p := range []int32{7, 3} {
			_, err := h.AddActivityPoint(classroomCtx(teacher.ID, "teacher"), connect.NewRequest(&classroomv1.AddActivityPointRequest{
				CourseId: courseID, StudentId: student.ID, Tanggal: tgl, Points: p,
			}))
			require.NoError(t, err)
		}
		res, err := h.ListLeaderboard(classroomCtx(teacher.ID, "teacher"), connect.NewRequest(&classroomv1.ListLeaderboardRequest{CourseId: courseID, Tanggal: ""}))
		require.NoError(t, err)
		require.Len(t, res.Msg.Entries, 1)
		assert.Equal(t, "Ana", res.Msg.Entries[0].StudentName)
		assert.Equal(t, int32(10), res.Msg.Entries[0].Points)
		assert.Equal(t, int32(2), res.Msg.Entries[0].EntryCount)
	})

	t.Run("invalid points → invalid argument", func(t *testing.T) {
		_, err := h.AddActivityPoint(classroomCtx(teacher.ID, "teacher"), connect.NewRequest(&classroomv1.AddActivityPointRequest{
			CourseId: courseID, StudentId: student.ID, Tanggal: tgl, Points: 99,
		}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	})
}
