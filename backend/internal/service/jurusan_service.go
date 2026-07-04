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
	ErrJurusanNotFound  = errors.New("jurusan not found")
	ErrJurusanDuplicate = errors.New("jurusan already exists")
)

type JurusanService struct {
	repo repository.JurusanRepository
}

func NewJurusanService(repo repository.JurusanRepository) *JurusanService {
	return &JurusanService{repo: repo}
}

func (s *JurusanService) CreateJurusan(ctx context.Context, callerRole, name string) (*repository.Jurusan, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("nama jurusan wajib diisi")
	}
	j := &repository.Jurusan{ID: uuid.New().String(), Name: name, CreatedAt: time.Now().UTC()}
	if err := s.repo.Create(ctx, j); err != nil {
		if errors.Is(err, repository.ErrJurusanDuplicate) {
			return nil, ErrJurusanDuplicate
		}
		return nil, fmt.Errorf("create jurusan: %w", err)
	}
	return j, nil
}

func (s *JurusanService) UpdateJurusan(ctx context.Context, callerRole, id, name string) (*repository.Jurusan, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("nama jurusan wajib diisi")
	}
	j, err := s.repo.Rename(ctx, id, name)
	if err != nil {
		if errors.Is(err, repository.ErrJurusanNotFound) {
			return nil, ErrJurusanNotFound
		}
		if errors.Is(err, repository.ErrJurusanDuplicate) {
			return nil, ErrJurusanDuplicate
		}
		return nil, fmt.Errorf("rename jurusan: %w", err)
	}
	return j, nil
}

func (s *JurusanService) ListJurusans(ctx context.Context, callerRole string) ([]*repository.Jurusan, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.List(ctx)
}

func (s *JurusanService) DeleteJurusan(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrJurusanNotFound) {
			return ErrJurusanNotFound
		}
		return fmt.Errorf("delete jurusan: %w", err)
	}
	return nil
}
