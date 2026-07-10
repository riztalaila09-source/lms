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

// UpdateCourse applies Capaian & Tujuan Pembelajaran; non-managers are denied.
func TestCourseService_UpdateCourse_CapaianTujuan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	svc := service.NewCourseService(courseRepo, enrollRepo, userRepo)
	now := time.Now().UTC().Truncate(time.Second)

	teacher := &repository.User{ID: testutil.NewUserID(), Username: "cap_s", Email: "caps@t.com", PasswordHash: "x",
		Role: "teacher", FullName: "T", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))

	course, err := svc.CreateCourse(ctx, "teacher", "CAP-SVC", "Course", "", teacher.ID, "", nil)
	require.NoError(t, err)

	capaian := "Poin capaian 1\nPoin capaian 2"
	tujuan := "Poin tujuan 1"

	t.Run("manager updates", func(t *testing.T) {
		updated, err := svc.UpdateCourse(ctx, "teacher", course.ID, service.UpdateCourseInput{
			CapaianPembelajaran: &capaian,
			TujuanPembelajaran:  &tujuan,
		}, nil, false)
		require.NoError(t, err)
		assert.Equal(t, capaian, updated.CapaianPembelajaran)
		assert.Equal(t, tujuan, updated.TujuanPembelajaran)

		// Persisted.
		got, err := courseRepo.GetByID(ctx, course.ID)
		require.NoError(t, err)
		assert.Equal(t, capaian, got.CapaianPembelajaran)
		assert.Equal(t, tujuan, got.TujuanPembelajaran)
	})

	t.Run("student denied", func(t *testing.T) {
		_, err := svc.UpdateCourse(ctx, "student", course.ID, service.UpdateCourseInput{
			CapaianPembelajaran: &capaian,
		}, nil, false)
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}
