package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

// ── mock CompletionRepository ──
type mockCompletionRepo struct{ mock.Mock }

func (m *mockCompletionRepo) Upsert(ctx context.Context, c *repository.Completion) error {
	return m.Called(ctx, c).Error(0)
}
func (m *mockCompletionRepo) GetByStudentMaterial(ctx context.Context, studentID, materialID string) (*repository.Completion, error) {
	args := m.Called(ctx, studentID, materialID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*repository.Completion), args.Error(1)
}
func (m *mockCompletionRepo) ListByCourse(ctx context.Context, courseID string) ([]*repository.StudentSummary, error) {
	args := m.Called(ctx, courseID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*repository.StudentSummary), args.Error(1)
}
func (m *mockCompletionRepo) DeleteByStudentCourse(ctx context.Context, courseID, studentID string) (int64, error) {
	args := m.Called(ctx, courseID, studentID)
	return args.Get(0).(int64), args.Error(1)
}

// ── mock EssayRepository ──
type mockEssayRepo struct{ mock.Mock }

func (m *mockEssayRepo) CreateQuestion(ctx context.Context, q *repository.EssayQuestion) error {
	return m.Called(ctx, q).Error(0)
}
func (m *mockEssayRepo) ListQuestions(ctx context.Context, materialID string) ([]*repository.EssayQuestion, error) {
	args := m.Called(ctx, materialID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*repository.EssayQuestion), args.Error(1)
}
func (m *mockEssayRepo) DeleteQuestion(ctx context.Context, id string) error {
	return m.Called(ctx, id).Error(0)
}
func (m *mockEssayRepo) CreateComment(ctx context.Context, c *repository.EssayComment) error {
	return m.Called(ctx, c).Error(0)
}
func (m *mockEssayRepo) ListComments(ctx context.Context, essayQuestionID string) ([]*repository.EssayComment, error) {
	args := m.Called(ctx, essayQuestionID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*repository.EssayComment), args.Error(1)
}
func (m *mockEssayRepo) DeleteCommentsByStudentCourse(ctx context.Context, courseID, authorID string) (int64, error) {
	args := m.Called(ctx, courseID, authorID)
	return args.Get(0).(int64), args.Error(1)
}

func TestCompletionService_ResetStudentProgress(t *testing.T) {
	ctx := context.Background()

	t.Run("student is denied and nothing is deleted", func(t *testing.T) {
		comp, essay := &mockCompletionRepo{}, &mockEssayRepo{}
		svc := service.NewCompletionService(comp, essay)

		err := svc.ResetStudentProgress(ctx, "student", "course1", "studentA")

		assert.ErrorIs(t, err, service.ErrPermissionDenied)
		comp.AssertNotCalled(t, "DeleteByStudentCourse", mock.Anything, mock.Anything, mock.Anything)
		essay.AssertNotCalled(t, "DeleteCommentsByStudentCourse", mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("missing ids returns error", func(t *testing.T) {
		comp, essay := &mockCompletionRepo{}, &mockEssayRepo{}
		svc := service.NewCompletionService(comp, essay)

		assert.Error(t, svc.ResetStudentProgress(ctx, "teacher", "", "studentA"))
		assert.Error(t, svc.ResetStudentProgress(ctx, "teacher", "course1", ""))
	})

	t.Run("teacher resets both completions and essay answers", func(t *testing.T) {
		comp, essay := &mockCompletionRepo{}, &mockEssayRepo{}
		comp.On("DeleteByStudentCourse", ctx, "course1", "studentA").Return(int64(2), nil)
		essay.On("DeleteCommentsByStudentCourse", ctx, "course1", "studentA").Return(int64(1), nil)
		svc := service.NewCompletionService(comp, essay)

		err := svc.ResetStudentProgress(ctx, "teacher", "course1", "studentA")

		require.NoError(t, err)
		comp.AssertExpectations(t)
		essay.AssertExpectations(t)
	})
}
