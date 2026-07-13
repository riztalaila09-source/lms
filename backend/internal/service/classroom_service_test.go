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

func setupClassroom(t *testing.T) (string, string, *service.ClassroomService, *repository.User) {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC()
	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "cs_" + name, Email: name + "@cs.com", PasswordHash: "x",
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
	svc := service.NewClassroomService(repository.NewClassroomRepository(db))
	return courseID, student.ID, svc, student
}

func TestClassroomService_Gates(t *testing.T) {
	ctx := context.Background()
	courseID, studentID, svc, _ := setupClassroom(t)

	sched := &repository.Schedule{CourseID: courseID, DayOfWeek: 1, JamKeMulai: 1, JamKeAkhir: 2}

	t.Run("student cannot create schedule / add point", func(t *testing.T) {
		_, err := svc.CreateSchedule(ctx, "student", sched)
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
		_, _, err = svc.AddActivityPoint(ctx, "student", &repository.ActivityPoint{CourseID: courseID, StudentID: studentID, Tanggal: "2026-08-01", Points: 5})
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})

	t.Run("student can view schedules, lesson plans and leaderboard", func(t *testing.T) {
		_, err := svc.CreateSchedule(ctx, "teacher", &repository.Schedule{CourseID: courseID, DayOfWeek: 2, JamKeMulai: 1, JamKeAkhir: 2})
		require.NoError(t, err)
		list, err := svc.ListSchedules(ctx, courseID)
		require.NoError(t, err)
		assert.Len(t, list, 1)
		_, err = svc.ListLessonPlans(ctx, courseID) // no error for students
		require.NoError(t, err)
		_, err = svc.Leaderboard(ctx, courseID, "") // leaderboard terbuka untuk siswa
		require.NoError(t, err)
	})

	t.Run("validation: bad day / points rejected", func(t *testing.T) {
		_, err := svc.CreateSchedule(ctx, "teacher", &repository.Schedule{CourseID: courseID, DayOfWeek: 8, JamKeMulai: 1, JamKeAkhir: 2})
		assert.ErrorIs(t, err, service.ErrClassroomInvalid)
		_, _, err = svc.AddActivityPoint(ctx, "teacher", &repository.ActivityPoint{CourseID: courseID, StudentID: studentID, Tanggal: "2026-08-01", Points: 11})
		assert.ErrorIs(t, err, service.ErrClassroomInvalid)
		_, _, err = svc.AddActivityPoint(ctx, "teacher", &repository.ActivityPoint{CourseID: courseID, StudentID: studentID, Tanggal: "2026-08-01", Points: 0})
		assert.ErrorIs(t, err, service.ErrClassroomInvalid)
	})

	t.Run("teacher adds points cumulatively", func(t *testing.T) {
		_, _, err := svc.AddActivityPoint(ctx, "teacher", &repository.ActivityPoint{CourseID: courseID, StudentID: studentID, Tanggal: "2026-08-02", Points: 6})
		require.NoError(t, err)
		total, day, err := svc.AddActivityPoint(ctx, "teacher", &repository.ActivityPoint{CourseID: courseID, StudentID: studentID, Tanggal: "2026-08-02", Points: 4})
		require.NoError(t, err)
		assert.Equal(t, 10, total)
		assert.Equal(t, 10, day)
		lb, err := svc.Leaderboard(ctx, courseID, "")
		require.NoError(t, err)
		assert.Equal(t, studentID, lb[0].StudentID)
		assert.Equal(t, 10, lb[0].Points)
	})
}
