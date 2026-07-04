package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var ErrCompletionNotFound = errors.New("completion not found")

type CompletionService struct {
	repo      repository.CompletionRepository
	essayRepo repository.EssayRepository
}

func NewCompletionService(repo repository.CompletionRepository, essayRepo repository.EssayRepository) *CompletionService {
	return &CompletionService{repo: repo, essayRepo: essayRepo}
}

func (s *CompletionService) MarkComplete(ctx context.Context, callerID, materialID string, readPercent int, quizPassed bool) (*repository.Completion, error) {
	c := &repository.Completion{
		ID:          uuid.New().String(),
		MaterialID:  materialID,
		StudentID:   callerID,
		ReadPercent: readPercent,
		QuizPassed:  quizPassed,
		CompletedAt: time.Now().UTC(),
	}
	if err := s.repo.Upsert(ctx, c); err != nil {
		return nil, fmt.Errorf("mark complete: %w", err)
	}
	// re-fetch to get student name/kelas
	full, err := s.repo.GetByStudentMaterial(ctx, callerID, materialID)
	if err != nil {
		return c, nil // non-fatal — return minimal data
	}
	return full, nil
}

func (s *CompletionService) GetMyCompletion(ctx context.Context, callerID, materialID string) (*repository.Completion, error) {
	c, err := s.repo.GetByStudentMaterial(ctx, callerID, materialID)
	if err != nil {
		if errors.Is(err, repository.ErrCompletionNotFound) {
			return nil, ErrCompletionNotFound
		}
		return nil, fmt.Errorf("get my completion: %w", err)
	}
	return c, nil
}

func (s *CompletionService) ListCompletions(ctx context.Context, callerRole, courseID string) ([]*repository.StudentSummary, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListByCourse(ctx, courseID)
}

// ResetStudentProgress clears a student's completion records and essay answers
// for every material in a course, forcing them to redo the work. Managers only.
func (s *CompletionService) ResetStudentProgress(ctx context.Context, callerRole, courseID, studentID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if courseID == "" || studentID == "" {
		return fmt.Errorf("course_id and student_id are required")
	}
	if _, err := s.repo.DeleteByStudentCourse(ctx, courseID, studentID); err != nil {
		return fmt.Errorf("reset completions: %w", err)
	}
	if _, err := s.essayRepo.DeleteCommentsByStudentCourse(ctx, courseID, studentID); err != nil {
		return fmt.Errorf("reset essay answers: %w", err)
	}
	return nil
}
