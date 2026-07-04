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
	ErrClassNotFound  = errors.New("class not found")
	ErrClassDuplicate = errors.New("class already exists")
)

type ClassService struct {
	repo repository.ClassRepository
}

func NewClassService(repo repository.ClassRepository) *ClassService {
	return &ClassService{repo: repo}
}

func (s *ClassService) CreateClass(ctx context.Context, callerRole, name string) (*repository.Class, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("nama kelas wajib diisi")
	}
	c := &repository.Class{ID: uuid.New().String(), Name: name, CreatedAt: time.Now().UTC()}
	if err := s.repo.Create(ctx, c); err != nil {
		if errors.Is(err, repository.ErrClassDuplicate) {
			return nil, ErrClassDuplicate
		}
		return nil, fmt.Errorf("create class: %w", err)
	}
	return c, nil
}

func (s *ClassService) UpdateClass(ctx context.Context, callerRole, id, name string) (*repository.Class, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("nama kelas wajib diisi")
	}
	c, err := s.repo.Rename(ctx, id, name)
	if err != nil {
		if errors.Is(err, repository.ErrClassNotFound) {
			return nil, ErrClassNotFound
		}
		if errors.Is(err, repository.ErrClassDuplicate) {
			return nil, ErrClassDuplicate
		}
		return nil, fmt.Errorf("rename class: %w", err)
	}
	return c, nil
}

func (s *ClassService) ListClasses(ctx context.Context, callerRole string) ([]*repository.Class, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.List(ctx)
}

func (s *ClassService) DeleteClass(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrClassNotFound) {
			return ErrClassNotFound
		}
		return fmt.Errorf("delete class: %w", err)
	}
	return nil
}
