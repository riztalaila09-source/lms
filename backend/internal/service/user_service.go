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
	ErrInvalidArgument    = errors.New("invalid argument")
)

// Granular access-right keys that can be granted to teachers. Admins are
// super-users and implicitly hold every permission.
const (
	PermKelolaSiswa   = "kelola_siswa"
	PermKelolaGuru    = "kelola_guru"
	PermKelolaOrtu    = "kelola_ortu"
	PermKelolaSekolah = "kelola_sekolah"
	PermKelolaNilai   = "kelola_nilai"
	PermKelolaAbsensi = "kelola_absensi"
	PermKelolaMateri  = "kelola_materi"
	PermKelolaTugas   = "kelola_tugas"
	PermKelolaPkl     = "kelola_pkl"
	PermKelolaLog     = "kelola_log"
)

// AllPermissions is the full grantable set (order shown in the UI).
var AllPermissions = []string{
	PermKelolaSiswa, PermKelolaGuru, PermKelolaOrtu, PermKelolaSekolah,
	PermKelolaNilai, PermKelolaAbsensi, PermKelolaMateri, PermKelolaTugas,
	PermKelolaPkl, PermKelolaLog,
}

// DefaultTeacherPermissions is granted to newly created teachers.
var DefaultTeacherPermissions = []string{
	PermKelolaMateri, PermKelolaTugas, PermKelolaNilai, PermKelolaAbsensi,
}

func isValidPermission(p string) bool {
	for _, k := range AllPermissions {
		if k == p {
			return true
		}
	}
	return false
}

// HasPermission reports whether a caller may perform an action guarded by key.
// Admins always pass; teachers pass when the key is in their permission list.
func HasPermission(role string, perms []string, key string) bool {
	if role == "admin" {
		return true
	}
	if role != "teacher" {
		return false
	}
	for _, p := range perms {
		if p == key {
			return true
		}
	}
	return false
}

// sanitizePermissions keeps only valid, de-duplicated keys.
func sanitizePermissions(perms []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(perms))
	for _, p := range perms {
		if isValidPermission(p) && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

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
	Password    *string
	Mapel       *string
	Gender      *string
	Phone       *string
	Permissions *[]string // nil = leave unchanged
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

	token, err := s.jwtSvc.GenerateToken(user.ID, user.Role, user.Permissions)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	// Best-effort login tracking — never block login on a logging failure.
	if s.activityRepo != nil {
		_ = s.activityRepo.Record(ctx, uuid.New().String(), user.ID, "login")
	}

	return &LoginResult{Token: token, User: user}, nil
}

func (s *UserService) CreateUser(ctx context.Context, callerRole string, callerPerms []string, username, email, password, fullName, role, kelas, jurusan, mapel, gender, phone string, permissions []string) (*repository.User, error) {
	// Gate by the account type being created. Only admins create admins.
	switch role {
	case "admin":
		if callerRole != "admin" {
			return nil, ErrPermissionDenied
		}
	case "teacher":
		if !HasPermission(callerRole, callerPerms, PermKelolaGuru) {
			return nil, ErrPermissionDenied
		}
	case "student":
		if !HasPermission(callerRole, callerPerms, PermKelolaSiswa) {
			return nil, ErrPermissionDenied
		}
	default:
		return nil, fmt.Errorf("invalid role: %s", role)
	}

	// Access rights only apply to teachers. Only an admin may hand-pick them;
	// otherwise a new teacher gets the default teaching set.
	var perms []string
	if role == "teacher" {
		if callerRole == "admin" && permissions != nil {
			perms = sanitizePermissions(permissions)
		} else {
			perms = append([]string{}, DefaultTeacherPermissions...)
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Jurusan is derived from the combined class name (e.g. "X-TKJ-1" → "TKJ").
	if role == "student" {
		if d := repository.JurusanFromKelas(kelas); d != "" {
			jurusan = d
		}
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
		Mapel:         mapel,
		Gender:        gender,
		Phone:         phone,
		Permissions:   perms,
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

func (s *UserService) UpdateUser(ctx context.Context, callerRole string, callerPerms []string, targetID string, input UpdateUserInput) (*repository.User, error) {
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

	// Gate by the edited account's type. Only admins touch admin accounts.
	switch u.Role {
	case "admin":
		if callerRole != "admin" {
			return nil, ErrPermissionDenied
		}
	case "teacher":
		if !HasPermission(callerRole, callerPerms, PermKelolaGuru) {
			return nil, ErrPermissionDenied
		}
	default: // student
		if !HasPermission(callerRole, callerPerms, PermKelolaSiswa) {
			return nil, ErrPermissionDenied
		}
	}
	// Assigning access rights (Hak Akses) is an admin-only action.
	if input.Permissions != nil && callerRole != "admin" {
		return nil, ErrPermissionDenied
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
	if input.Mapel != nil {
		u.Mapel = *input.Mapel
	}
	if input.Gender != nil {
		u.Gender = *input.Gender
	}
	if input.Phone != nil {
		u.Phone = *input.Phone
	}
	// Access rights apply to teachers only; sanitized to valid keys.
	if input.Permissions != nil {
		if u.Role == "teacher" {
			u.Permissions = sanitizePermissions(*input.Permissions)
		} else {
			u.Permissions = nil
		}
	}
	// Keep jurusan in sync with the combined class name for students.
	if u.Role == "student" {
		if d := repository.JurusanFromKelas(u.Kelas); d != "" {
			u.Jurusan = d
		}
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

// ListActivityLogs returns aggregated login stats (requires kelola_log).
func (s *UserService) ListActivityLogs(ctx context.Context, callerRole string, callerPerms []string, userID string, page, pageSize int) ([]*repository.ActivityLogEntry, int, error) {
	if !HasPermission(callerRole, callerPerms, PermKelolaLog) {
		return nil, 0, ErrPermissionDenied
	}
	if s.activityRepo == nil {
		return nil, 0, nil
	}
	return s.activityRepo.Aggregate(ctx, userID, page, pageSize)
}

// ResetActivityLogs menghapus SELURUH log aktivitas (requires kelola_log).
func (s *UserService) ResetActivityLogs(ctx context.Context, callerRole string, callerPerms []string) error {
	if !HasPermission(callerRole, callerPerms, PermKelolaLog) {
		return ErrPermissionDenied
	}
	if s.activityRepo == nil {
		return nil
	}
	return s.activityRepo.ResetAll(ctx)
}

func (s *UserService) DeleteUser(ctx context.Context, callerRole string, callerPerms []string, targetID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	u, err := s.repo.GetByID(ctx, targetID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("get user: %w", err)
	}
	// Gate by the deleted account's type; only admins remove admins.
	switch u.Role {
	case "admin":
		if callerRole != "admin" {
			return ErrPermissionDenied
		}
	case "teacher":
		if !HasPermission(callerRole, callerPerms, PermKelolaGuru) {
			return ErrPermissionDenied
		}
	default: // student
		if !HasPermission(callerRole, callerPerms, PermKelolaSiswa) {
			return ErrPermissionDenied
		}
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
func (s *UserService) MutateClass(ctx context.Context, callerRole string, callerPerms []string, toKelas, fromKelas string, studentIDs []string) (int, error) {
	if !HasPermission(callerRole, callerPerms, PermKelolaSiswa) {
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
