package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

func TestMaterialRepository_SearchMaterials(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	matRepo := repository.NewMaterialRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	teacher := &repository.User{ID: testutil.NewUserID(), Username: "srch_t", Email: "srch_t@t.com", PasswordHash: "x", Role: "teacher", FullName: "T", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))
	student := &repository.User{ID: testutil.NewUserID(), Username: "srch_s", Email: "srch_s@t.com", PasswordHash: "x", Role: "student", FullName: "S", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, student))

	mkCourse := func(code string) string {
		id := testutil.NewUserID()
		_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`, id, code, "Kursus "+code, teacher.ID)
		require.NoError(t, err)
		return id
	}
	enrolledCourse := mkCourse("ENR")
	otherCourse := mkCourse("OTH")
	require.NoError(t, enrollRepo.Enroll(ctx, enrolledCourse, student.ID, testutil.NewUserID()))

	mkMat := func(courseID, title string, published bool) {
		require.NoError(t, matRepo.Create(ctx, &repository.Material{
			ID: testutil.NewUserID(), CourseID: courseID, Title: title, ContentType: "text",
			IsPublished: published, CreatedByID: teacher.ID, CreatedAt: now, UpdatedAt: now,
		}))
	}
	mkMat(repository.GeneralCourseID, "Jaringan Umum", true)  // general, published
	mkMat(enrolledCourse, "Jaringan Terdaftar", true)         // enrolled, published
	mkMat(enrolledCourse, "Jaringan Draft", false)            // enrolled, draft
	mkMat(otherCourse, "Jaringan Rahasia", true)              // not enrolled

	t.Run("student sees general + enrolled published only", func(t *testing.T) {
		res, err := matRepo.SearchMaterials(ctx, "Jaringan", student.ID, true, 20)
		require.NoError(t, err)
		titles := map[string]bool{}
		for _, r := range res {
			titles[r.Title] = true
			assert.NotEmpty(t, r.CourseName, "course name is joined")
		}
		assert.True(t, titles["Jaringan Umum"], "general is visible")
		assert.True(t, titles["Jaringan Terdaftar"], "enrolled published is visible")
		assert.False(t, titles["Jaringan Draft"], "draft hidden from students")
		assert.False(t, titles["Jaringan Rahasia"], "non-enrolled course hidden")
	})

	t.Run("manager sees everything incl drafts", func(t *testing.T) {
		res, err := matRepo.SearchMaterials(ctx, "Jaringan", "", false, 20)
		require.NoError(t, err)
		titles := map[string]bool{}
		for _, r := range res {
			titles[r.Title] = true
		}
		assert.True(t, titles["Jaringan Draft"], "manager sees drafts")
		assert.True(t, titles["Jaringan Rahasia"], "manager sees all courses")
	})

	t.Run("query filters by title", func(t *testing.T) {
		res, err := matRepo.SearchMaterials(ctx, "Rahasia", "", false, 20)
		require.NoError(t, err)
		require.Len(t, res, 1)
		assert.Equal(t, "Jaringan Rahasia", res[0].Title)
	})
}
