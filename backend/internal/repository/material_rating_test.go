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

func TestMaterialRepository_RateMaterial(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	matRepo := repository.NewMaterialRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(s, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "rt_" + s, Email: s + "@rt.com", PasswordHash: "x", Role: role, FullName: "U " + s, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mkUser("t", "teacher")
	s1 := mkUser("s1", "student")
	s2 := mkUser("s2", "student")

	mat := &repository.Material{ID: testutil.NewUserID(), CourseID: repository.GeneralCourseID, Title: "Rated", ContentType: "text", IsPublished: true, CreatedByID: teacher.ID, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, matRepo.Create(ctx, mat))

	// First rating.
	avg, count, err := matRepo.RateMaterial(ctx, mat.ID, s1.ID, 4)
	require.NoError(t, err)
	assert.InDelta(t, 4.0, avg, 0.01)
	assert.Equal(t, 1, count)

	// Second student.
	avg, count, err = matRepo.RateMaterial(ctx, mat.ID, s2.ID, 5)
	require.NoError(t, err)
	assert.InDelta(t, 4.5, avg, 0.01)
	assert.Equal(t, 2, count)

	// Re-rating by s1 updates (not adds) — avg becomes (2+5)/2 = 3.5, count stays 2.
	avg, count, err = matRepo.RateMaterial(ctx, mat.ID, s1.ID, 2)
	require.NoError(t, err)
	assert.InDelta(t, 3.5, avg, 0.01)
	assert.Equal(t, 2, count)

	// Aggregate surfaces through the material select (GetByID).
	got, err := matRepo.GetByID(ctx, mat.ID)
	require.NoError(t, err)
	assert.InDelta(t, 3.5, got.AvgRating, 0.01)
	assert.Equal(t, 2, got.RatingCount)
}
