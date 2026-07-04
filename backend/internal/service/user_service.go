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
	Username *string
	Kelas    *string
	Jurusan  *string
	Password *string
}

type UpdateProfileInput struct {
	FullName *string
	Username *string
	Email    *string
	PhotoURL *string
	Story    *string
}

type UserService struct {
	repo         repository.UserRepository
	jwtSvc       *JWTService
	activityRepo repository.ActivityRepository
}

func NewUserService(repo repository.UserRepository, jwtSvc *JWTService, activityRepo repository.ActivityRepository) *UserService {
	return &UserService{repo: repo, jwtSvc: jwtSvc, activityRepo: activityRepo}
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

	// Best-effort login tracking — never block login on a logging failure.
	if s.activityRepo != nil {
		_ = s.activityRepo.Record(ctx, uuid.New().String(), user.ID, "login")
	}

	return &LoginResult{Token: token, User: user}, nil
}

func (s *UserService) CreateUser(ctx context.Context, callerRole, username, email, password, fullName, role, kelas, jurusan string) (*repository.User, error) {
	// Managers (teacher / legacy admin) may add students or other teachers, not admins.
	switch callerRole {
	case "admin":
	case "teacher":
		if role != "student" && role != "teacher" {
			return nil, ErrPermissionDenied
		}
	default:
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
		ID:            uuid.New().String(),
		Username:      username,
		Email:         email,
		PasswordHash:  string(hash),
		PasswordPlain: password,
		Role:          role,
		FullName:      fullName,
		IsActive:      true,
		Kelas:         kelas,
		Jurusan:       jurusan,
		CreatedAt:     now,
		UpdatedAt:     now,
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
	if !isManager(callerRole) {
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
	if input.Username != nil {
		u.Username = *input.Username
	}
	if input.Kelas != nil {
		u.Kelas = *input.Kelas
	}
	if input.Jurusan != nil {
		u.Jurusan = *input.Jurusan
	}
	if input.Password != nil && *input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*input.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		u.PasswordHash = string(hash)
		u.PasswordPlain = *input.Password
	}

	if err := s.repo.Update(ctx, u); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return nil, ErrDuplicate
		}
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

// UpdateProfile lets a user update their own account (no admin required).
func (s *UserService) UpdateProfile(ctx context.Context, callerID string, input UpdateProfileInput) (*repository.User, error) {
	u, err := s.repo.GetByID(ctx, callerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user: %w", err)
	}
	if input.FullName != nil {
		u.FullName = *input.FullName
	}
	if input.Username != nil {
		u.Username = *input.Username
	}
	if input.Email != nil {
		u.Email = *input.Email
	}
	if input.PhotoURL != nil {
		u.PhotoURL = *input.PhotoURL
	}
	if input.Story != nil {
		u.Story = *input.Story
	}
	if err := s.repo.Update(ctx, u); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return nil, ErrDuplicate
		}
		return nil, fmt.Errorf("update profile: %w", err)
	}
	return u, nil
}

// ListStories returns users' testimonials for the home page (any logged-in user).
func (s *UserService) ListStories(ctx context.Context) ([]*repository.StoryEntry, error) {
	return s.repo.ListStories(ctx, 50)
}

// ListActivityLogs returns aggregated login stats (admin/teacher only).
func (s *UserService) ListActivityLogs(ctx context.Context, callerRole, userID string, page, pageSize int) ([]*repository.ActivityLogEntry, int, error) {
	if callerRole != "admin" && callerRole != "teacher" {
		return nil, 0, ErrPermissionDenied
	}
	if s.activityRepo == nil {
		return nil, 0, nil
	}
	return s.activityRepo.Aggregate(ctx, userID, page, pageSize)
}

func (s *UserService) DeleteUser(ctx context.Context, callerRole, targetID string) error {
	if !isManager(callerRole) {
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
	if !isManager(callerRole) {
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
	u.PasswordPlain = newPassword
	if err := s.repo.Update(ctx, u); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

// MutateClass moves students between classes (manager only). Provide either a
// set of studentIDs (specific students) or fromKelas (everyone in that class).
// toKelas must be non-empty. Returns the number of students moved.
func (s *UserService) MutateClass(ctx context.Context, callerRole, toKelas, fromKelas string, studentIDs []string) (int, error) {
	if !isManager(callerRole) {
		return 0, ErrPermissionDenied
	}
	if toKelas == "" {
		return 0, fmt.Errorf("kelas tujuan wajib diisi")
	}
	if len(studentIDs) > 0 {
		n, err := s.repo.MoveStudentsByIDs(ctx, studentIDs, toKelas)
		return int(n), err
	}
	if fromKelas == "" {
		return 0, fmt.Errorf("pilih kelas asal atau siswa yang dimutasi")
	}
	if fromKelas == toKelas {
		return 0, fmt.Errorf("kelas asal dan tujuan sama")
	}
	n, err := s.repo.MoveStudentsByClass(ctx, fromKelas, toKelas)
	return int(n), err
}

func isValidRole(role string) bool {
	switch role {
	case "admin", "teacher", "student":
		return true
	}
	return false
}
