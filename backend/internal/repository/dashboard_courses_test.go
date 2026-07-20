package repository_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

// "Total Mata Pelajaran" (TotalKelas) must NOT count the sentinel "Materi Umum"
// (general) course, otherwise a fresh install with no real subjects shows 1.
func TestDashboardRepository_TotalKelasExcludesGeneral(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	dashRepo := repository.NewDashboardRepository(db)

	scalar := func(q string) int {
		var n int
		require.NoError(t, db.QueryRowContext(ctx, q).Scan(&n))
		return n
	}
	rawCount := scalar(`SELECT COUNT(*) FROM courses`)
	generalCount := scalar(`SELECT COUNT(*) FROM courses WHERE id = 'general'`)
	require.Equal(t, 1, generalCount, "the sentinel general course should exist in the seeded test DB")

	stats, err := dashRepo.TeacherStats(ctx)
	require.NoError(t, err)

	assert.Equal(t, rawCount-1, stats.TotalKelas, "general course must be excluded from Total Mata Pelajaran")
}
