package handler_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	userv1 "lms/backend/gen/user/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

// mockUserService wraps service.UserService methods for testing without needing a real DB.
type mockUserService struct {
	mock.Mock
}

// We can't mock service.UserService directly (it's a struct, not interface).
// Instead, test the handler through the real service with a mocked repository.
// For handler tests, we test that handlers correctly call the service and map responses.

func makeAuthContext(userID, role string) context.Context {
	claims := &service.Claims{UserID: userID, Role: role}
	return context.WithValue(context.Background(), middleware.TestContextKey(), claims)
}

func makeRepoUser(id, role string) *repository.User {
	return &repository.User{
		ID:        id,
		Username:  "user_" + id,
		Email:     "user_" + id + "@test.com",
		Role:      role,
		FullName:  "Test User",
		IsActive:  true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// mockRepo is a testify mock for UserRepository
type mockRepo struct {
	mock.Mock
}

func (m *mockRepo) Create(ctx context.Context, u *repository.User) error {
	return m.Called(ctx, u).Error(0)
}
func (m *mockRepo) GetByID(ctx context.Context, id string) (*repository.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.User), args.Error(1)
}
func (m *mockRepo) GetByEmail(ctx context.Context, email string) (*repository.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.User), args.Error(1)
}
func (m *mockRepo) Update(ctx context.Context, u *repository.User) error {
	return m.Called(ctx, u).Error(0)
}
func (m *mockRepo) Delete(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}
func (m *mockRepo) List(ctx context.Context, f repository.ListFilter) ([]*repository.User, int, error) {
	args := m.Called(ctx, f)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]*repository.User), args.Int(1), args.Error(2)
}

func (m *mockRepo) MoveStudentsByClass(ctx context.Context, fromKelas, toKelas string) (int64, error) {
	args := m.Called(ctx, fromKelas, toKelas)
	return int64(args.Int(0)), args.Error(1)
}

func (m *mockRepo) MoveStudentsByIDs(ctx context.Context, ids []string, toKelas string) (int64, error) {
	args := m.Called(ctx, ids, toKelas)
	return int64(args.Int(0)), args.Error(1)
}

func (m *mockRepo) ListStories(ctx context.Context, limit int) ([]*repository.StoryEntry, error) {
	args := m.Called(ctx, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*repository.StoryEntry), args.Error(1)
}

func newTestHandler(repo repository.UserRepository) *handler.UserHandler {
	jwtSvc := service.NewJWTService("test-secret", 24)
	userSvc := service.NewUserService(repo, jwtSvc, nil)
	// courseSvc is only used by CreateUser auto-enroll (student + kelas); these
	// handler tests never trigger that path, so nil repos are safe here.
	courseSvc := service.NewCourseService(nil, nil, repo)
	return handler.NewUserHandler(userSvc, courseSvc)
}

func TestUserHandler_GetProfile(t *testing.T) {
	repo := &mockRepo{}
	h := newTestHandler(repo)
	ctx := makeAuthContext("user-1", "student")

	u := makeRepoUser("user-1", "student")
	repo.On("GetByID", mock.Anything, "user-1").Return(u, nil)

	resp, err := h.GetProfile(ctx, connect.NewRequest(&userv1.GetProfileRequest{}))
	require.NoError(t, err)
	assert.Equal(t, "user-1", resp.Msg.Id)
	assert.Equal(t, userv1.Role_ROLE_STUDENT, resp.Msg.Role)
}

func TestUserHandler_GetUser_AdminCanGetAny(t *testing.T) {
	repo := &mockRepo{}
	h := newTestHandler(repo)
	ctx := makeAuthContext("admin-1", "admin")

	target := makeRepoUser("target-id", "teacher")
	repo.On("GetByID", mock.Anything, "target-id").Return(target, nil)

	resp, err := h.GetUser(ctx, connect.NewRequest(&userv1.GetUserRequest{Id: "target-id"}))
	require.NoError(t, err)
	assert.Equal(t, "target-id", resp.Msg.Id)
}

func TestUserHandler_GetUser_StudentCannotGetOther(t *testing.T) {
	repo := &mockRepo{}
	h := newTestHandler(repo)
	ctx := makeAuthContext("student-1", "student")

	_, err := h.GetUser(ctx, connect.NewRequest(&userv1.GetUserRequest{Id: "other-id"}))
	require.Error(t, err)

	var connectErr *connect.Error
	assert.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodePermissionDenied, connectErr.Code())
}

func TestUserHandler_DeleteUser_StudentDenied(t *testing.T) {
	repo := &mockRepo{}
	h := newTestHandler(repo)
	ctx := makeAuthContext("student-1", "student")

	_, err := h.DeleteUser(ctx, connect.NewRequest(&userv1.DeleteUserRequest{Id: "some-id"}))
	require.Error(t, err)

	var connectErr *connect.Error
	assert.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodePermissionDenied, connectErr.Code())
}

func TestUserHandler_ListUsers_AdminOnly(t *testing.T) {
	repo := &mockRepo{}
	h := newTestHandler(repo)

	t.Run("admin gets list", func(t *testing.T) {
		ctx := makeAuthContext("admin-1", "admin")
		users := []*repository.User{makeRepoUser("u1", "student"), makeRepoUser("u2", "teacher")}
		repo.On("List", mock.Anything, mock.AnythingOfType("repository.ListFilter")).Return(users, 2, nil)

		resp, err := h.ListUsers(ctx, connect.NewRequest(&userv1.ListUsersRequest{}))
		require.NoError(t, err)
		assert.Len(t, resp.Msg.Users, 2)
	})

	t.Run("student is denied", func(t *testing.T) {
		ctx := makeAuthContext("student-1", "student")
		_, err := h.ListUsers(ctx, connect.NewRequest(&userv1.ListUsersRequest{}))
		require.Error(t, err)
		var connectErr *connect.Error
		assert.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodePermissionDenied, connectErr.Code())
	})
}
