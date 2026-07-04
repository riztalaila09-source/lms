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

// When a student's class changes, their enrollments must follow: they gain
// access to courses for the new class and lose access to courses for the old one.
func TestCourseService_SyncStudentEnrollments(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	svc := service.NewCourseService(courseRepo, enrollRepo, userRepo)
	now := time.Now().UTC().Truncate(time.Second)

	teacher := &repository.User{ID: testutil.NewUserID(), Username: "syt", Email: "syt@test.com", PasswordHash: "x", Role: "teacher", FullName: "T", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))
	student := &repository.User{ID: testutil.NewUserID(), Username: "sys", Email: "sys@test.com", PasswordHash: "x", Role: "student", FullName: "S", IsActive: true, Kelas: "SYNC-A", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, student))

	clsA, clsB := testutil.NewUserID(), testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO classes (id, name) VALUES (?, 'SYNC-A'), (?, 'SYNC-B')`, clsA, clsB)
	require.NoError(t, err)

	courseA, err := svc.CreateCourse(ctx, "teacher", "SYNC-CA", "Course A", "", teacher.ID, "", []string{clsA})
	require.NoError(t, err)
	courseB, err := svc.CreateCourse(ctx, "teacher", "SYNC-CB", "Course B", "", teacher.ID, "", []string{clsB})
	require.NoError(t, err)

	isIn := func(courseID string) bool {
		ok, e := enrollRepo.IsEnrolled(ctx, courseID, student.ID)
		require.NoError(t, e)
		return ok
	}

	// Student is in SYNC-A → enrolled in course A only.
	assert.True(t, isIn(courseA.ID))
	assert.False(t, isIn(courseB.ID))

	// Class changes to SYNC-B → access flips.
	svc.SyncStudentEnrollments(ctx, student.ID, "SYNC-B")
	assert.False(t, isIn(courseA.ID), "loses access to old class course")
	assert.True(t, isIn(courseB.ID), "gains access to new class course")
}
