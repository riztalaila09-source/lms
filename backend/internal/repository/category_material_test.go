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

func TestCategoryRepository_CRUD(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	repo := repository.NewCategoryRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	cat := &repository.Category{ID: testutil.NewUserID(), Code: "01", Name: "Informatika", CreatedAt: now}
	require.NoError(t, repo.Create(ctx, cat))

	t.Run("duplicate code rejected", func(t *testing.T) {
		dup := &repository.Category{ID: testutil.NewUserID(), Code: "01", Name: "Lain", CreatedAt: now}
		assert.ErrorIs(t, repo.Create(ctx, dup), repository.ErrCategoryDuplicate)
	})

	t.Run("list contains it", func(t *testing.T) {
		list, err := repo.List(ctx)
		require.NoError(t, err)
		found := false
		for _, c := range list {
			if c.ID == cat.ID && c.Code == "01" && c.Name == "Informatika" {
				found = true
			}
		}
		assert.True(t, found)
	})

	t.Run("delete removes it", func(t *testing.T) {
		require.NoError(t, repo.Delete(ctx, cat.ID))
		assert.ErrorIs(t, repo.Delete(ctx, cat.ID), repository.ErrCategoryNotFound)
	})
}

// A material must carry its category code/name and the names of its creator and
// last editor (different users).
func TestMaterialRepository_CategoryAndCreatorEditorNames(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	catRepo := repository.NewCategoryRepository(db)
	matRepo := repository.NewMaterialRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(suffix string) *repository.User {
		u := &repository.User{
			ID: testutil.NewUserID(), Username: "cm_" + suffix, Email: "cm_" + suffix + "@test.com",
			PasswordHash: "x", Role: "teacher", FullName: "Guru " + suffix, IsActive: true,
			CreatedAt: now, UpdatedAt: now,
		}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	creator := mkUser("creator")
	editor := mkUser("editor")

	cat := &repository.Category{ID: testutil.NewUserID(), Code: "01", Name: "Informatika", CreatedAt: now}
	require.NoError(t, catRepo.Create(ctx, cat))

	m := &repository.Material{
		ID: testutil.NewUserID(), CourseID: repository.GeneralCourseID, Title: "Materi A",
		ContentType: "text", CategoryID: cat.ID, CreatedByID: creator.ID,
		CoverImage: "data:image/png;base64,AAA", CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, matRepo.Create(ctx, m))

	got, err := matRepo.GetByID(ctx, m.ID)
	require.NoError(t, err)
	assert.Equal(t, "01", got.CategoryCode)
	assert.Equal(t, "Informatika", got.CategoryName)
	assert.Equal(t, "Guru creator", got.CreatedByName)
	assert.Equal(t, "Guru creator", got.UpdatedByName, "editor defaults to creator before any edit")
	// Cover is exposed as a cacheable URL, not the heavy base64 (kept in DB).
	assert.Equal(t, "/covers/"+m.ID, got.CoverImage, "cover served as URL")

	// Editor updates the material.
	got.Title = "Materi A (edit)"
	got.UpdatedByID = editor.ID
	got.CoverImage = "data:image/png;base64,BBB"
	require.NoError(t, matRepo.Update(ctx, got))

	after, err := matRepo.GetByID(ctx, m.ID)
	require.NoError(t, err)
	assert.Equal(t, "Guru creator", after.CreatedByName, "creator unchanged")
	assert.Equal(t, "Guru editor", after.UpdatedByName, "editor recorded")
	assert.Equal(t, "/covers/"+m.ID, after.CoverImage, "cover still served as URL")

	// A material without a cover exposes an empty string (no URL).
	m2 := &repository.Material{
		ID: testutil.NewUserID(), CourseID: repository.GeneralCourseID, Title: "No Cover",
		ContentType: "text", CreatedByID: creator.ID, CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, matRepo.Create(ctx, m2))
	got2, err := matRepo.GetByID(ctx, m2.ID)
	require.NoError(t, err)
	assert.Equal(t, "", got2.CoverImage)
}

// Regression: GetByID returns the cover as a "/covers/<id>" URL. Editing a
// material (which loads via GetByID and saves the struct back) must NOT
// overwrite the stored data URL with that lean URL form — otherwise the image
// bytes are destroyed on any edit and the /covers endpoint 404s (blank card).
func TestMaterialRepository_UpdateKeepsCoverOnUrlRoundTrip(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	matRepo := repository.NewMaterialRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	u := &repository.User{
		ID: testutil.NewUserID(), Username: "cover_rt", Email: "cover_rt@test.com",
		PasswordHash: "x", Role: "teacher", FullName: "RT", IsActive: true,
		CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, userRepo.Create(ctx, u))

	rawCover := "data:image/png;base64,AAABBBCCC"
	m := &repository.Material{
		ID: testutil.NewUserID(), CourseID: repository.GeneralCourseID, Title: "WithCover",
		ContentType: "text", CreatedByID: u.ID,
		CoverImage: rawCover, CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, matRepo.Create(ctx, m))

	// Simulate an edit: load (cover comes back as the URL form) and save back.
	got, err := matRepo.GetByID(ctx, m.ID)
	require.NoError(t, err)
	require.Equal(t, "/covers/"+m.ID, got.CoverImage)
	got.Title = "WithCover (edited)"
	require.NoError(t, matRepo.Update(ctx, got))

	// The raw column must still hold the original data URL, not the "/covers/..".
	var stored string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT cover_image FROM course_materials WHERE id = ?`, m.ID).Scan(&stored))
	assert.Equal(t, rawCover, stored, "edit must not clobber the stored cover image")

	// A genuine new upload (data: URL) still replaces it; clearing ("") removes it.
	got.CoverImage = "data:image/png;base64,ZZZ"
	require.NoError(t, matRepo.Update(ctx, got))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT cover_image FROM course_materials WHERE id = ?`, m.ID).Scan(&stored))
	assert.Equal(t, "data:image/png;base64,ZZZ", stored)

	got.CoverImage = ""
	require.NoError(t, matRepo.Update(ctx, got))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT cover_image FROM course_materials WHERE id = ?`, m.ID).Scan(&stored))
	assert.Equal(t, "", stored, "empty cover clears the image")
}
