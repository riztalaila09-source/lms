package service

import (
	"context"
	"fmt"

	"lms/backend/internal/repository"
)

type DashboardService struct {
	repo repository.DashboardRepository
}

func NewDashboardService(repo repository.DashboardRepository) *DashboardService {
	return &DashboardService{repo: repo}
}

// GetTeacherDashboard returns aggregate stats. Teacher-driven product: only
// managers (teachers / legacy admin) may view the dashboard.
func (s *DashboardService) GetTeacherDashboard(ctx context.Context, callerRole string) (*repository.TeacherDashboard, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	d, err := s.repo.TeacherStats(ctx)
	if err != nil {
		return nil, fmt.Errorf("teacher stats: %w", err)
	}
	return d, nil
}

// GetStudentDashboard returns the calling student's home summary (class/major,
// average grade, and rank within class and major). Only students may view it.
func (s *DashboardService) GetStudentDashboard(ctx context.Context, callerID, callerRole string) (*repository.StudentDashboard, error) {
	if callerRole != "student" {
		return nil, ErrPermissionDenied
	}
	d, err := s.repo.StudentStats(ctx, callerID)
	if err != nil {
		return nil, fmt.Errorf("student stats: %w", err)
	}
	return d, nil
}

// GetLeaderboard returns the top-5 students of a single class or major. Any
// authenticated user may view any leaderboard (not sensitive within a school).
// Exactly one of kelas/jurusan must be provided.
func (s *DashboardService) GetLeaderboard(ctx context.Context, callerRole, kelas, jurusan string) ([]repository.RankEntry, error) {
	if callerRole == "" {
		return nil, ErrPermissionDenied
	}
	scope, value := "kelas", kelas
	switch {
	case kelas != "" && jurusan == "":
		scope, value = "kelas", kelas
	case jurusan != "" && kelas == "":
		scope, value = "jurusan", jurusan
	default:
		return nil, fmt.Errorf("%w: provide exactly one of kelas/jurusan", ErrInvalidArgument)
	}
	entries, err := s.repo.Leaderboard(ctx, scope, value)
	if err != nil {
		return nil, fmt.Errorf("leaderboard: %w", err)
	}
	return entries, nil
}
