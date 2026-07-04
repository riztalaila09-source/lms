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

// A student may submit an assignment only once, and a blocked student cannot
// submit at all.
func TestAssignmentService_SubmitOnceAndBlock(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	assignRepo := repository.NewAssignmentRepository(db)
	subRepo := repository.NewSubmissionRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	qRepo := repository.NewAssignmentQuestionRepository(db)
	svc := service.NewAssignmentService(assignRepo, subRepo, enrollRepo, courseRepo, qRepo)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(s, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "a_" + s, Email: s + "@t.com", PasswordHash: "x", Role: role, FullName: "U " + s, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mkUser("t", "teacher")
	s1 := mkUser("s1", "student")
	s2 := mkUser("s2", "student")

	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, 'AS1', 'Course', ?)`, courseID, teacher.ID)
	require.NoError(t, err)
	require.NoError(t, enrollRepo.Enroll(ctx, courseID, s1.ID, testutil.NewUserID()))
	require.NoError(t, enrollRepo.Enroll(ctx, courseID, s2.ID, testutil.NewUserID()))

	a, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Tugas 1", MaxScore: 100})
	require.NoError(t, err)

	t.Run("first submit succeeds, second is rejected", func(t *testing.T) {
		_, err := svc.SubmitAssignment(ctx, s1.ID, "student", a.ID, "jawaban", "")
		require.NoError(t, err)
		_, err = svc.SubmitAssignment(ctx, s1.ID, "student", a.ID, "lagi", "")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "sudah dikumpulkan")
	})

	t.Run("blocked student cannot submit", func(t *testing.T) {
		require.NoError(t, svc.BlockStudent(ctx, teacher.ID, "teacher", a.ID, s2.ID))
		_, err := svc.SubmitAssignment(ctx, s2.ID, "student", a.ID, "jawaban", "")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "diblokir")

		// unblock → can submit
		require.NoError(t, svc.UnblockStudent(ctx, teacher.ID, "teacher", a.ID, s2.ID))
		_, err = svc.SubmitAssignment(ctx, s2.ID, "student", a.ID, "jawaban", "")
		require.NoError(t, err)
	})

	t.Run("block list reflects state", func(t *testing.T) {
		require.NoError(t, svc.BlockStudent(ctx, teacher.ID, "teacher", a.ID, s1.ID))
		ids, err := svc.ListBlockedStudents(ctx, "teacher", a.ID)
		require.NoError(t, err)
		assert.Contains(t, ids, s1.ID)
	})

	t.Run("students only block via manager role", func(t *testing.T) {
		assert.ErrorIs(t, svc.BlockStudent(ctx, s1.ID, "student", a.ID, s2.ID), service.ErrPermissionDenied)
	})
}
