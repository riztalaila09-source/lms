package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

// fakeDashRepo is a minimal DashboardRepository for testing service gating and
// delegation without a real database.
type fakeDashRepo struct {
	student    *repository.StudentDashboard
	gotID      string
	board      []repository.RankEntry
	gotScope   string
	gotScopeID string
}

func (f *fakeDashRepo) TeacherStats(context.Context) (*repository.TeacherDashboard, error) {
	return &repository.TeacherDashboard{}, nil
}
func (f *fakeDashRepo) StudentStats(_ context.Context, id string) (*repository.StudentDashboard, error) {
	f.gotID = id
	return f.student, nil
}
func (f *fakeDashRepo) Leaderboard(_ context.Context, scope, value string) ([]repository.RankEntry, error) {
	f.gotScope, f.gotScopeID = scope, value
	return f.board, nil
}

func TestDashboardService_GetStudentDashboard(t *testing.T) {
	ctx := context.Background()
	repoFake := &fakeDashRepo{student: &repository.StudentDashboard{
		Kelas: "X-TKJ-1", Jurusan: "TKJ", RataRataNilai: 88, PeringkatKelas: 2, TotalKelas: 5,
	}}
	svc := service.NewDashboardService(repoFake)

	t.Run("student sees own summary", func(t *testing.T) {
		got, err := svc.GetStudentDashboard(ctx, "stud-1", "student")
		require.NoError(t, err)
		assert.Equal(t, "stud-1", repoFake.gotID, "caller id passed through to repo")
		assert.Equal(t, "X-TKJ-1", got.Kelas)
		assert.InDelta(t, 88.0, got.RataRataNilai, 0.01)
		assert.Equal(t, 2, got.PeringkatKelas)
	})

	t.Run("teacher denied", func(t *testing.T) {
		_, err := svc.GetStudentDashboard(ctx, "t-1", "teacher")
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})

	t.Run("admin denied", func(t *testing.T) {
		_, err := svc.GetStudentDashboard(ctx, "a-1", "admin")
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}

func TestDashboardService_GetLeaderboard(t *testing.T) {
	ctx := context.Background()
	repoFake := &fakeDashRepo{board: []repository.RankEntry{{Peringkat: 1, Name: "Alice", RataRata: 90}}}
	svc := service.NewDashboardService(repoFake)

	t.Run("student may view any class board", func(t *testing.T) {
		got, err := svc.GetLeaderboard(ctx, "student", "X-TKJ-2", "")
		require.NoError(t, err)
		assert.Equal(t, "kelas", repoFake.gotScope)
		assert.Equal(t, "X-TKJ-2", repoFake.gotScopeID)
		require.Len(t, got, 1)
		assert.Equal(t, "Alice", got[0].Name)
	})

	t.Run("teacher may view a major board", func(t *testing.T) {
		_, err := svc.GetLeaderboard(ctx, "teacher", "", "RPL")
		require.NoError(t, err)
		assert.Equal(t, "jurusan", repoFake.gotScope)
		assert.Equal(t, "RPL", repoFake.gotScopeID)
	})

	t.Run("both empty → invalid argument", func(t *testing.T) {
		_, err := svc.GetLeaderboard(ctx, "student", "", "")
		assert.ErrorIs(t, err, service.ErrInvalidArgument)
	})

	t.Run("both set → invalid argument", func(t *testing.T) {
		_, err := svc.GetLeaderboard(ctx, "student", "X-1", "TKJ")
		assert.ErrorIs(t, err, service.ErrInvalidArgument)
	})

	t.Run("unauthenticated denied", func(t *testing.T) {
		_, err := svc.GetLeaderboard(ctx, "", "X-1", "")
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}
