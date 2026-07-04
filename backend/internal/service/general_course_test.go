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

// A non-enrolled student must be able to see/list general ("Materi Umum")
// materials and open the general course — no class/enrollment restriction.
func TestGeneralCourse_OpenToNonEnrolledStudents(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	materialRepo := repository.NewMaterialRepository(db)
	questionRepo := repository.NewQuestionRepository(db)
	categoryRepo := repository.NewCategoryRepository(db)
	courseSvc := service.NewCourseService(courseRepo, enrollRepo, userRepo)
	materialSvc := service.NewMaterialService(materialRepo, enrollRepo, questionRepo, categoryRepo)
	now := time.Now().UTC().Truncate(time.Second)

	var ownerID string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT teacher_id FROM courses WHERE id = ?`, repository.GeneralCourseID).Scan(&ownerID))

	// Published general material.
	matID := testutil.NewUserID()
	_, err := db.ExecContext(ctx,
		`INSERT INTO course_materials (id, course_id, title, content_type, is_published, created_by)
		 VALUES (?, ?, 'Umum 1', 'text', 1, ?)`, matID, repository.GeneralCourseID, ownerID)
	require.NoError(t, err)

	student := &repository.User{
		ID: testutil.NewUserID(), Username: "gs", Email: "gs@test.com",
		PasswordHash: "x", Role: "student", FullName: "Gen Student", IsActive: true,
		Kelas: "GEN-X", CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, userRepo.Create(ctx, student))

	// Not enrolled anywhere.
	enrolled, err := enrollRepo.IsEnrolled(ctx, repository.GeneralCourseID, student.ID)
	require.NoError(t, err)
	require.False(t, enrolled)

	t.Run("student can open the general course", func(t *testing.T) {
		c, err := courseSvc.GetCourse(ctx, student.ID, "student", repository.GeneralCourseID)
		require.NoError(t, err)
		assert.Equal(t, repository.GeneralCourseID, c.ID)
	})

	t.Run("student can list general materials", func(t *testing.T) {
		mats, _, err := materialSvc.ListMaterials(ctx, student.ID, "student", repository.GeneralCourseID, 1, 50)
		require.NoError(t, err)
		// The general course also carries seeded TKJ materials, so assert the
		// student's own material is present rather than an exact count.
		require.NotEmpty(t, mats)
		found := false
		for _, m := range mats {
			if m.ID == matID {
				found = true
			}
		}
		assert.True(t, found, "created general material should be listed")
	})

	t.Run("student cannot list a normal course they are not enrolled in", func(t *testing.T) {
		_, _, err := materialSvc.ListMaterials(ctx, student.ID, "student", "44444444-4444-4444-4444-444444444444", 1, 50)
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}
