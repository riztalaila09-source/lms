package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var ErrParentNotFound = errors.New("parent not found")

type ParentService struct {
	repo     repository.ParentRepository
	userRepo repository.UserRepository
}

func NewParentService(repo repository.ParentRepository, userRepo repository.UserRepository) *ParentService {
	return &ParentService{repo: repo, userRepo: userRepo}
}

// ParentInput carries the household fields plus the final set of children.
type ParentInput struct {
	NamaAyah     string
	NamaIbu      string
	NamaWali     string
	HubunganWali string
	Phone        string
	Pekerjaan    string
	Alamat       string
	StudentIDs   []string
}

func (in ParentInput) hasName() bool {
	return strings.TrimSpace(in.NamaAyah) != "" ||
		strings.TrimSpace(in.NamaIbu) != "" ||
		strings.TrimSpace(in.NamaWali) != ""
}

// validateStudents makes sure every id refers to an existing student.
func (s *ParentService) validateStudents(ctx context.Context, ids []string) error {
	for _, id := range ids {
		u, err := s.userRepo.GetByID(ctx, id)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return fmt.Errorf("%w: siswa tidak ditemukan", ErrInvalidArgument)
			}
			return fmt.Errorf("get student: %w", err)
		}
		if u.Role != "student" {
			return fmt.Errorf("%w: hanya siswa yang bisa ditautkan sebagai anak", ErrInvalidArgument)
		}
	}
	return nil
}

func (s *ParentService) CreateParent(ctx context.Context, callerRole string, in ParentInput) (*repository.Parent, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if !in.hasName() {
		return nil, fmt.Errorf("%w: isi minimal nama ayah, ibu, atau wali", ErrInvalidArgument)
	}
	if err := s.validateStudents(ctx, in.StudentIDs); err != nil {
		return nil, err
	}

	p := &repository.Parent{
		ID:           uuid.New().String(),
		NamaAyah:     in.NamaAyah,
		NamaIbu:      in.NamaIbu,
		NamaWali:     in.NamaWali,
		HubunganWali: in.HubunganWali,
		Phone:        in.Phone,
		Pekerjaan:    in.Pekerjaan,
		Alamat:       in.Alamat,
	}
	if err := s.repo.Create(ctx, p); err != nil {
		return nil, fmt.Errorf("create parent: %w", err)
	}
	if err := s.repo.SetChildren(ctx, p.ID, in.StudentIDs); err != nil {
		return nil, fmt.Errorf("set children: %w", err)
	}
	return s.repo.GetByID(ctx, p.ID)
}

func (s *ParentService) UpdateParent(ctx context.Context, callerRole, id string, in ParentInput) (*repository.Parent, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if !in.hasName() {
		return nil, fmt.Errorf("%w: isi minimal nama ayah, ibu, atau wali", ErrInvalidArgument)
	}
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrParentNotFound) {
			return nil, ErrParentNotFound
		}
		return nil, fmt.Errorf("get parent: %w", err)
	}
	if err := s.validateStudents(ctx, in.StudentIDs); err != nil {
		return nil, err
	}

	p.NamaAyah = in.NamaAyah
	p.NamaIbu = in.NamaIbu
	p.NamaWali = in.NamaWali
	p.HubunganWali = in.HubunganWali
	p.Phone = in.Phone
	p.Pekerjaan = in.Pekerjaan
	p.Alamat = in.Alamat
	if err := s.repo.Update(ctx, p); err != nil {
		return nil, fmt.Errorf("update parent: %w", err)
	}
	if err := s.repo.SetChildren(ctx, id, in.StudentIDs); err != nil {
		return nil, fmt.Errorf("set children: %w", err)
	}
	return s.repo.GetByID(ctx, id)
}

func (s *ParentService) GetParent(ctx context.Context, callerRole, id string) (*repository.Parent, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrParentNotFound) {
			return nil, ErrParentNotFound
		}
		return nil, fmt.Errorf("get parent: %w", err)
	}
	return p, nil
}

func (s *ParentService) ListParents(ctx context.Context, callerRole, search string, page, pageSize int) ([]*repository.Parent, int, error) {
	if !isManager(callerRole) {
		return nil, 0, ErrPermissionDenied
	}
	return s.repo.List(ctx, search, page, pageSize)
}

func (s *ParentService) DeleteParent(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrParentNotFound) {
			return ErrParentNotFound
		}
		return fmt.Errorf("delete parent: %w", err)
	}
	return nil
}
