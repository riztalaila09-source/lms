package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var (
	ErrClassroomNotFound = errors.New("classroom record not found")
	ErrClassroomInvalid  = errors.New("classroom input invalid")
)

type ClassroomService struct {
	repo repository.ClassroomRepository
}

func NewClassroomService(repo repository.ClassroomRepository) *ClassroomService {
	return &ClassroomService{repo: repo}
}

// ── Jadwal ──

func (s *ClassroomService) ListSchedules(ctx context.Context, courseID string) ([]*repository.Schedule, error) {
	return s.repo.ListSchedules(ctx, courseID)
}

func validSchedule(day, mulai, akhir int) bool {
	return day >= 1 && day <= 7 && mulai >= 1 && akhir >= mulai
}

func (s *ClassroomService) CreateSchedule(ctx context.Context, callerRole string, in *repository.Schedule) (*repository.Schedule, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if !validSchedule(in.DayOfWeek, in.JamKeMulai, in.JamKeAkhir) {
		return nil, ErrClassroomInvalid
	}
	in.ID = uuid.New().String()
	if err := s.repo.CreateSchedule(ctx, in); err != nil {
		return nil, fmt.Errorf("create schedule: %w", err)
	}
	return in, nil
}

func (s *ClassroomService) UpdateSchedule(ctx context.Context, callerRole string, in *repository.Schedule) (*repository.Schedule, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if !validSchedule(in.DayOfWeek, in.JamKeMulai, in.JamKeAkhir) {
		return nil, ErrClassroomInvalid
	}
	if err := s.repo.UpdateSchedule(ctx, in); err != nil {
		if errors.Is(err, repository.ErrClassroomNotFound) {
			return nil, ErrClassroomNotFound
		}
		return nil, fmt.Errorf("update schedule: %w", err)
	}
	return in, nil
}

func (s *ClassroomService) DeleteSchedule(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.DeleteSchedule(ctx, id); err != nil {
		if errors.Is(err, repository.ErrClassroomNotFound) {
			return ErrClassroomNotFound
		}
		return fmt.Errorf("delete schedule: %w", err)
	}
	return nil
}

// ── Kalender / rencana ──

func (s *ClassroomService) ListLessonPlans(ctx context.Context, courseID string) ([]*repository.LessonPlan, error) {
	return s.repo.ListLessonPlans(ctx, courseID)
}

func (s *ClassroomService) CreateLessonPlan(ctx context.Context, callerRole string, in *repository.LessonPlan) (*repository.LessonPlan, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if strings.TrimSpace(in.Tanggal) == "" || strings.TrimSpace(in.Title) == "" {
		return nil, ErrClassroomInvalid
	}
	in.ID = uuid.New().String()
	if err := s.repo.CreateLessonPlan(ctx, in); err != nil {
		return nil, fmt.Errorf("create lesson plan: %w", err)
	}
	return in, nil
}

func (s *ClassroomService) UpdateLessonPlan(ctx context.Context, callerRole string, in *repository.LessonPlan) (*repository.LessonPlan, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if strings.TrimSpace(in.Tanggal) == "" || strings.TrimSpace(in.Title) == "" {
		return nil, ErrClassroomInvalid
	}
	if err := s.repo.UpdateLessonPlan(ctx, in); err != nil {
		if errors.Is(err, repository.ErrClassroomNotFound) {
			return nil, ErrClassroomNotFound
		}
		return nil, fmt.Errorf("update lesson plan: %w", err)
	}
	return in, nil
}

func (s *ClassroomService) DeleteLessonPlan(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.DeleteLessonPlan(ctx, id); err != nil {
		if errors.Is(err, repository.ErrClassroomNotFound) {
			return ErrClassroomNotFound
		}
		return fmt.Errorf("delete lesson plan: %w", err)
	}
	return nil
}

// ── Keaktifan siswa (poin kumulatif) ──

// AddActivityPoint menambah satu poin (1..10) ke siswa. Guru saja; boleh berkali-kali.
// Mengembalikan (total keseluruhan, total pada tanggal tsb).
func (s *ClassroomService) AddActivityPoint(ctx context.Context, callerRole string, in *repository.ActivityPoint) (int, int, error) {
	if !isManager(callerRole) {
		return 0, 0, ErrPermissionDenied
	}
	if strings.TrimSpace(in.Tanggal) == "" || strings.TrimSpace(in.StudentID) == "" {
		return 0, 0, ErrClassroomInvalid
	}
	if in.Points < 1 || in.Points > 10 {
		return 0, 0, ErrClassroomInvalid
	}
	in.ID = uuid.New().String()
	if err := s.repo.AddActivityPoint(ctx, in); err != nil {
		return 0, 0, fmt.Errorf("add activity point: %w", err)
	}
	total, day, err := s.repo.StudentPointTotals(ctx, in.CourseID, in.StudentID, in.Tanggal)
	if err != nil {
		return 0, 0, nil
	}
	return total, day, nil
}

// Leaderboard: papan peringkat poin (semua user terautentikasi boleh lihat).
// tanggal "" = akumulasi total; tanggal terisi = poin hari itu.
func (s *ClassroomService) Leaderboard(ctx context.Context, courseID, tanggal string) ([]*repository.LeaderboardEntry, error) {
	return s.repo.Leaderboard(ctx, courseID, tanggal)
}
