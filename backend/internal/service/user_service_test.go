package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

// mockUserRepository implements repository.UserRepository for testing.
type mockUserRepository struct {
	mock.Mock
}

func (m *mockUserRepository) Create(ctx context.Context, u *repository.User) error {
	return m.Called(ctx, u).Error(0)
}

func (m *mockUserRepository) GetByID(ctx context.Context, id string) (*repository.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.User), args.Error(1)
}

func (m *mockUserRepository) GetByEmail(ctx context.Context, email string) (*repository.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.User), args.Error(1)
}

func (m *mockUserRepository) Update(ctx context.Context, u *repository.User) error {
	return m.Called(ctx, u).Error(0)
}

func (m *mockUserRepository) Delete(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockUserRepository) List(ctx context.Context, f repository.ListFilter) ([]*repository.User, int, error) {
	args := m.Called(ctx, f)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]*repository.User), args.Int(1), args.Error(2)
}

func newTestJWTService() *service.JWTService {
	return service.NewJWTService("test-secret-key-for-testing", 24)
}

func makeHash(password string) string {
	h, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	return string(h)
}

func makeTestUser(id, role string) *repository.User {
	return &repository.User{
		ID:           id,
		Username:     "user_" + id,
		Email:        "user_" + id + "@test.com",
		PasswordHash: makeHash("password123"),
		Role:         role,
		FullName:     "Test User",
		IsActive:     true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
}

func TestUserService_Login(t *testing.T) {
	ctx := context.Background()

	t.Run("success", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		u := makeTestUser("usr1", "student")
		repo.On("GetByEmail", ctx, u.Email).Return(u, nil)

		result, err := svc.Login(ctx, u.Email, "password123")
		require.NoError(t, err)
		assert.NotEmpty(t, result.Token)
		assert.Equal(t, u.ID, result.User.ID)
	})

	t.Run("wrong password", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		u := makeTestUser("usr2", "student")
		repo.On("GetByEmail", ctx, u.Email).Return(u, nil)

		_, err := svc.Login(ctx, u.Email, "wrongpassword")
		assert.ErrorIs(t, err, service.ErrInvalidCredentials)
	})

	t.Run("user not found", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		repo.On("GetByEmail", ctx, "nobody@test.com").Return(nil, repository.ErrNotFound)

		_, err := svc.Login(ctx, "nobody@test.com", "password123")
		assert.ErrorIs(t, err, service.ErrInvalidCredentials)
	})

	t.Run("inactive user is rejected", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		u := makeTestUser("usr3", "student")
		u.IsActive = false
		repo.On("GetByEmail", ctx, u.Email).Return(u, nil)

		_, err := svc.Login(ctx, u.Email, "password123")
		assert.ErrorIs(t, err, service.ErrInvalidCredentials)
	})
}

func TestUserService_CreateUser(t *testing.T) {
	ctx := context.Background()

	t.Run("admin can create user", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		repo.On("Create", ctx, mock.AnythingOfType("*repository.User")).Return(nil)

		u, err := svc.CreateUser(ctx, "admin", "newuser", "new@test.com", "pass123", "New User", "student")
		require.NoError(t, err)
		assert.Equal(t, "student", u.Role)
		assert.NotEmpty(t, u.ID)
	})

	t.Run("non-admin is denied", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		_, err := svc.CreateUser(ctx, "student", "newuser", "new@test.com", "pass123", "New User", "student")
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}

func TestUserService_GetUser(t *testing.T) {
	ctx := context.Background()

	t.Run("admin can get any user", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		target := makeTestUser("target", "student")
		repo.On("GetByID", ctx, "target").Return(target, nil)

		u, err := svc.GetUser(ctx, "admin-id", "admin", "target")
		require.NoError(t, err)
		assert.Equal(t, "target", u.ID)
	})

	t.Run("user can get own profile", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		me := makeTestUser("me", "student")
		repo.On("GetByID", ctx, "me").Return(me, nil)

		u, err := svc.GetUser(ctx, "me", "student", "me")
		require.NoError(t, err)
		assert.Equal(t, "me", u.ID)
	})

	t.Run("student cannot get other user", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		_, err := svc.GetUser(ctx, "student-id", "student", "other-id")
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}

func TestUserService_DeleteUser(t *testing.T) {
	ctx := context.Background()

	t.Run("admin can delete", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		repo.On("Delete", ctx, "target-id").Return(nil)

		err := svc.DeleteUser(ctx, "admin", "target-id")
		assert.NoError(t, err)
	})

	t.Run("non-admin is denied", func(t *testing.T) {
		repo := &mockUserRepository{}
		svc := service.NewUserService(repo, newTestJWTService())

		err := svc.DeleteUser(ctx, "teacher", "target-id")
		assert.ErrorIs(t, err, service.ErrPermissionDenied)
	})
}

func TestJWTService(t *testing.T) {
	jwtSvc := newTestJWTService()

	t.Run("generate and validate token", func(t *testing.T) {
		token, err := jwtSvc.GenerateToken("user-123", "admin")
		require.NoError(t, err)
		assert.NotEmpty(t, token)

		claims, err := jwtSvc.ValidateToken(token)
		require.NoError(t, err)
		assert.Equal(t, "user-123", claims.UserID)
		assert.Equal(t, "admin", claims.Role)
	})

	t.Run("invalid token returns error", func(t *testing.T) {
		_, err := jwtSvc.ValidateToken("not-a-valid-token")
		assert.Error(t, err)
	})
}
