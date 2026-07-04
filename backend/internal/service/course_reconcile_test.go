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

// Verifies class-based visibility: enrolling follows the course's assigned
// classes, and removing a class un-enrolls that class's students.
func TestCourseService_ReconcileEnrollmentsByClasses(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	svc := service.NewCourseService(courseRepo, enrollRepo, userRepo)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(suffix, role, kelas string) *repository.User {
		u := &repository.User{
			ID: testutil.NewUserID(), Username: "rc_" + suffix, Email: "rc_" + suffix + "@test.com",
			PasswordHash: "x", Role: role, FullName: "RC " + suffix, IsActive: true,
			Kelas: kelas, CreatedAt: now, UpdatedAt: now,
		}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mkUser("teacher", "teacher", "")
	a1 := mkUser("a1", "student", "RECON-A")
	a2 := mkUser("a2", "student", "RECON-A")
	b1 := mkUser("b1", "student", "RECON-B")

	// Two master classes with unique names.
	clsA, clsB := testutil.NewUserID(), testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO classes (id, name) VALUES (?, 'RECON-A'), (?, 'RECON-B')`, clsA, clsB)
	require.NoError(t, err)

	// ── Create course assigned to class A only ──
	course, err := svc.CreateCourse(ctx, "teacher", "RECON-1", "Recon Course", "", teacher.ID, "", []string{clsA})
	require.NoError(t, err)

	isEnrolled := func(studentID string) bool {
		ok, e := enrollRepo.IsEnrolled(ctx, course.ID, studentID)
		require.NoError(t, e)
		return ok
	}

	assert.True(t, isEnrolled(a1.ID), "A students see the course")
	assert.True(t, isEnrolled(a2.ID))
	assert.False(t, isEnrolled(b1.ID), "B student does NOT see a class-A course")

	// ── Reassign course to class B only ──
	_, err = svc.UpdateCourse(ctx, "teacher", course.ID, service.UpdateCourseInput{}, []string{clsB}, true)
	require.NoError(t, err)

	assert.False(t, isEnrolled(a1.ID), "A students lose access when class A is removed")
	assert.False(t, isEnrolled(a2.ID))
	assert.True(t, isEnrolled(b1.ID), "B student gains access when class B is added")
}
