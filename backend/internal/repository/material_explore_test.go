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

func TestMaterialRepository_ListExplore(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	matRepo := repository.NewMaterialRepository(db)
	catRepo := repository.NewCategoryRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	teacher := &repository.User{ID: testutil.NewUserID(), Username: "ex_t", Email: "ex_t@t.com", PasswordHash: "x", Role: "teacher", FullName: "T", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))
	student := &repository.User{ID: testutil.NewUserID(), Username: "ex_s", Email: "ex_s@t.com", PasswordHash: "x", Role: "student", FullName: "S", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, student))

	cat := &repository.Category{ID: testutil.NewUserID(), Code: "01", Name: "Informatika", CreatedAt: now}
	require.NoError(t, catRepo.Create(ctx, cat))

	mkCourse := func(code string) string {
		id := testutil.NewUserID()
		_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`, id, code, "K"+code, teacher.ID)
		require.NoError(t, err)
		return id
	}
	enrolled := mkCourse("ENR")
	other := mkCourse("OTH")
	require.NoError(t, enrollRepo.Enroll(ctx, enrolled, student.ID, testutil.NewUserID()))

	mk := func(courseID, title, catID string, published bool) {
		require.NoError(t, matRepo.Create(ctx, &repository.Material{
			ID: testutil.NewUserID(), CourseID: courseID, Title: title, ContentType: "text",
			CategoryID: catID, IsPublished: published, CreatedByID: teacher.ID, CreatedAt: now, UpdatedAt: now,
		}))
	}
	mk(repository.GeneralCourseID, "Umum Publik", "", true)      // general, no category
	mk(enrolled, "Mapel Berkategori", cat.ID, true)             // enrolled + categorized → included
	mk(enrolled, "Mapel Tanpa Kategori", "", true)              // enrolled, no category → excluded
	mk(enrolled, "Mapel Draft Kategori", cat.ID, false)         // enrolled, categorized, draft → excluded for student
	mk(other, "Rahasia Berkategori", cat.ID, true)              // not enrolled → excluded for student

	t.Run("student: general + enrolled categorized (published)", func(t *testing.T) {
		res, err := matRepo.ListExplore(ctx, student.ID, 300)
		require.NoError(t, err)
		titles := map[string]bool{}
		for _, m := range res {
			titles[m.Title] = true
		}
		assert.True(t, titles["Umum Publik"], "general shown")
		assert.True(t, titles["Mapel Berkategori"], "enrolled categorized shown")
		assert.False(t, titles["Mapel Tanpa Kategori"], "enrolled uncategorized hidden")
		assert.False(t, titles["Mapel Draft Kategori"], "draft hidden from student")
		assert.False(t, titles["Rahasia Berkategori"], "non-enrolled hidden")
	})

	t.Run("manager: all general + all categorized incl drafts", func(t *testing.T) {
		res, err := matRepo.ListExplore(ctx, "", 300)
		require.NoError(t, err)
		titles := map[string]bool{}
		for _, m := range res {
			titles[m.Title] = true
		}
		assert.True(t, titles["Rahasia Berkategori"], "manager sees all categorized")
		assert.True(t, titles["Mapel Draft Kategori"], "manager sees drafts")
		assert.False(t, titles["Mapel Tanpa Kategori"], "non-general uncategorized still excluded")
	})
}
