package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var (
	ErrSemesterNotFound  = errors.New("semester not found")
	ErrSemesterDuplicate = errors.New("semester already exists")
)

type SchoolService struct {
	repo repository.SchoolRepository
}

func NewSchoolService(repo repository.SchoolRepository) *SchoolService {
	return &SchoolService{repo: repo}
}

func (s *SchoolService) GetSchool(ctx context.Context) (*repository.School, error) {
	return s.repo.GetSchool(ctx)
}

func (s *SchoolService) UpdateSchool(ctx context.Context, callerRole, name, address string) (*repository.School, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.UpdateSchool(ctx, strings.TrimSpace(name), strings.TrimSpace(address))
}

func (s *SchoolService) ListSemesters(ctx context.Context) ([]*repository.Semester, error) {
	return s.repo.ListSemesters(ctx)
}

func (s *SchoolService) CreateSemester(ctx context.Context, callerRole, semester, tahunAjaran string) (*repository.Semester, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	semester = strings.ToLower(strings.TrimSpace(semester))
	tahunAjaran = strings.TrimSpace(tahunAjaran)
	if semester != "ganjil" && semester != "genap" {
		return nil, fmt.Errorf("semester harus 'ganjil' atau 'genap'")
	}
	if tahunAjaran == "" {
		return nil, fmt.Errorf("tahun ajaran wajib diisi")
	}
	// The first semester created becomes the active one.
	existing, _ := s.repo.ListSemesters(ctx)
	sem := &repository.Semester{
		ID: uuid.New().String(), Semester: semester, TahunAjaran: tahunAjaran,
		IsActive: len(existing) == 0, CreatedAt: time.Now().UTC(),
	}
	if err := s.repo.CreateSemester(ctx, sem); err != nil {
		if errors.Is(err, repository.ErrSemesterDuplicate) {
			return nil, ErrSemesterDuplicate
		}
		return nil, fmt.Errorf("create semester: %w", err)
	}
	return sem, nil
}

func (s *SchoolService) SetActiveSemester(ctx context.Context, callerRole, id string) (*repository.Semester, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	sem, err := s.repo.SetActiveSemester(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrSemesterNotFound) {
			return nil, ErrSemesterNotFound
		}
		return nil, fmt.Errorf("set active semester: %w", err)
	}
	return sem, nil
}

func (s *SchoolService) DeleteSemester(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.DeleteSemester(ctx, id); err != nil {
		if errors.Is(err, repository.ErrSemesterNotFound) {
			return ErrSemesterNotFound
		}
		return fmt.Errorf("delete semester: %w", err)
	}
	return nil
}
