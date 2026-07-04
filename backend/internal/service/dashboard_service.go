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
