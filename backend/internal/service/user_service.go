package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"lms/backend/internal/repository"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrPermissionDenied   = errors.New("permission denied")
	ErrNotFound           = errors.New("user not found")
	ErrDuplicate          = errors.New("user already exists")
)

type LoginResult struct {
	Token string
	User  *repository.User
}

type UpdateUserInput struct {
	FullName *string
	Email    *string
	Role     *string
	IsActive *bool
}

type UserService struct {
	repo    repository.UserRepository
	jwtSvc  *JWTService
}

func NewUserService(repo repository.UserRepository, jwtSvc *JWTService) *UserService {
	return &UserService{repo: repo, jwtSvc: jwtSvc}
}

func (s *UserService) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	if !user.IsActive {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := s.jwtSvc.GenerateToken(user.ID, user.Role)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &LoginResult{Token: token, User: user}, nil
}

func (s *UserService) CreateUser(ctx context.Context, callerRole, username, email, password, fullName, role string) (*repository.User, error) {
	if callerRole != "admin" {
		return nil, ErrPermissionDenied
	}

	if !isValidRole(role) {
		return nil, fmt.Errorf("invalid role: %s", role)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	now := time.Now().UTC()
	u := &repository.User{
		ID:           uuid.New().String(),
		Username:     username,
		Email:        email,
		PasswordHash: string(hash),
		Role:         role,
		FullName:     fullName,
		IsActive:     true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.repo.Create(ctx, u); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return nil, ErrDuplicate
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (s *UserService) GetUser(ctx context.Context, callerID, callerRole, targetID string) (*repository.User, error) {
	if callerRole != "admin" && callerID != targetID {
		return nil, ErrPermissionDenied
	}

	u, err := s.repo.GetByID(ctx, targetID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

func (s *UserService) UpdateUser(ctx context.Context, callerRole, targetID string, input UpdateUserInput) (*repository.User, error) {
	if callerRole != "admin" {
		return nil, ErrPermissionDenied
	}

	u, err := s.repo.GetByID(ctx, targetID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	if input.FullName != nil {
		u.FullName = *input.FullName
	}
	if input.Email != nil {
		u.Email = *input.Email
	}
	if input.Role != nil {
		if !isValidRole(*input.Role) {
			return nil, fmt.Errorf("invalid role: %s", *input.Role)
		}
		u.Role = *input.Role
	}
	if input.IsActive != nil {
		u.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, u); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return nil, ErrDuplicate
		}
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

func (s *UserService) DeleteUser(ctx context.Context, callerRole, targetID string) error {
	if callerRole != "admin" {
		return ErrPermissionDenied
	}

	if err := s.repo.Delete(ctx, targetID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete user: %w", err)
	}
	return nil
}

func (s *UserService) ListUsers(ctx context.Context, callerRole string, f repository.ListFilter) ([]*repository.User, int, error) {
	if callerRole != "admin" {
		return nil, 0, ErrPermissionDenied
	}

	users, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	return users, total, nil
}

func (s *UserService) GetProfile(ctx context.Context, callerID string) (*repository.User, error) {
	u, err := s.repo.GetByID(ctx, callerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get profile: %w", err)
	}
	return u, nil
}

func (s *UserService) ChangePassword(ctx context.Context, callerID, currentPassword, newPassword string) error {
	u, err := s.repo.GetByID(ctx, callerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(currentPassword)); err != nil {
		return ErrInvalidCredentials
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	u.PasswordHash = string(hash)
	if err := s.repo.Update(ctx, u); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

func isValidRole(role string) bool {
	switch role {
	case "admin", "teacher", "student":
		return true
	}
	return false
}
