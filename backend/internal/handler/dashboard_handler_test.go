package handler_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	dashboardv1 "lms/backend/gen/dashboard/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

// fakeDashRepo implements repository.DashboardRepository for handler tests.
type fakeDashRepo struct {
	student *repository.StudentDashboard
	gotID   string
	board   []repository.RankEntry
}

func (f *fakeDashRepo) TeacherStats(context.Context) (*repository.TeacherDashboard, error) {
	return &repository.TeacherDashboard{}, nil
}
func (f *fakeDashRepo) StudentStats(_ context.Context, id string) (*repository.StudentDashboard, error) {
	f.gotID = id
	return f.student, nil
}
func (f *fakeDashRepo) Leaderboard(_ context.Context, _, _ string) ([]repository.RankEntry, error) {
	return f.board, nil
}

func TestDashboardHandler_GetStudentDashboard(t *testing.T) {
	repoFake := &fakeDashRepo{student: &repository.StudentDashboard{
		Kelas: "X-TKJ-1", Jurusan: "TKJ", RataRataNilai: 90, GradedCount: 2,
		PeringkatKelas: 1, TotalKelas: 3, PeringkatJurusan: 1, TotalJurusan: 4,
		JuaraKelas: []repository.RankEntry{
			{Peringkat: 1, Name: "Alice", Kelas: "X-TKJ-1", RataRata: 90},
			{Peringkat: 2, Name: "Bob", Kelas: "X-TKJ-1", RataRata: 80},
		},
		JuaraJurusan: []repository.RankEntry{
			{Peringkat: 1, Name: "Alice", Kelas: "X-TKJ-1", RataRata: 90},
		},
	}}
	h := handler.NewDashboardHandler(service.NewDashboardService(repoFake))

	t.Run("student ok — maps response", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), middleware.TestContextKey(),
			&service.Claims{UserID: "s1", Role: "student"})
		res, err := h.GetStudentDashboard(ctx, connect.NewRequest(&dashboardv1.GetStudentDashboardRequest{}))
		require.NoError(t, err)
		assert.Equal(t, "s1", repoFake.gotID)
		assert.Equal(t, "X-TKJ-1", res.Msg.Kelas)
		assert.Equal(t, "TKJ", res.Msg.Jurusan)
		assert.InDelta(t, 90.0, res.Msg.RataRataNilai, 0.01)
		assert.EqualValues(t, 2, res.Msg.GradedCount)
		assert.EqualValues(t, 1, res.Msg.PeringkatKelas)
		assert.EqualValues(t, 3, res.Msg.TotalKelas)
		assert.EqualValues(t, 1, res.Msg.PeringkatJurusan)
		assert.EqualValues(t, 4, res.Msg.TotalJurusan)
		require.Len(t, res.Msg.JuaraKelas, 2)
		assert.Equal(t, "Alice", res.Msg.JuaraKelas[0].Name)
		assert.EqualValues(t, 2, res.Msg.JuaraKelas[1].Peringkat)
		require.Len(t, res.Msg.JuaraJurusan, 1)
		assert.Equal(t, "Alice", res.Msg.JuaraJurusan[0].Name)
	})

	t.Run("no claims — unauthenticated", func(t *testing.T) {
		_, err := h.GetStudentDashboard(context.Background(), connect.NewRequest(&dashboardv1.GetStudentDashboardRequest{}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})

	t.Run("teacher — permission denied", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), middleware.TestContextKey(),
			&service.Claims{UserID: "t1", Role: "teacher"})
		_, err := h.GetStudentDashboard(ctx, connect.NewRequest(&dashboardv1.GetStudentDashboardRequest{}))
		require.Error(t, err)
		assert.Equal(t, connect.CodePermissionDenied, connect.CodeOf(err))
	})
}

func TestDashboardHandler_GetLeaderboard(t *testing.T) {
	repoFake := &fakeDashRepo{board: []repository.RankEntry{
		{Peringkat: 1, Name: "Alice", Kelas: "X-TKJ-1", RataRata: 90},
		{Peringkat: 2, Name: "Bob", Kelas: "X-TKJ-1", RataRata: 80},
	}}
	h := handler.NewDashboardHandler(service.NewDashboardService(repoFake))

	t.Run("ok — maps entries", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), middleware.TestContextKey(),
			&service.Claims{UserID: "s1", Role: "student"})
		res, err := h.GetLeaderboard(ctx, connect.NewRequest(&dashboardv1.GetLeaderboardRequest{Kelas: "X-TKJ-1"}))
		require.NoError(t, err)
		require.Len(t, res.Msg.Entries, 2)
		assert.Equal(t, "Alice", res.Msg.Entries[0].Name)
		assert.EqualValues(t, 2, res.Msg.Entries[1].Peringkat)
	})

	t.Run("both empty — invalid argument", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), middleware.TestContextKey(),
			&service.Claims{UserID: "s1", Role: "student"})
		_, err := h.GetLeaderboard(ctx, connect.NewRequest(&dashboardv1.GetLeaderboardRequest{}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("no claims — unauthenticated", func(t *testing.T) {
		_, err := h.GetLeaderboard(context.Background(), connect.NewRequest(&dashboardv1.GetLeaderboardRequest{Kelas: "X-1"}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})
}
