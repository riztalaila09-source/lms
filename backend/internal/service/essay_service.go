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
	ErrEssayNotFound = errors.New("essay question not found")
	ErrEmptyComment  = errors.New("comment content is empty")
)

type EssayService struct {
	repo         repository.EssayRepository
	materialRepo repository.MaterialRepository
}

func NewEssayService(repo repository.EssayRepository, materialRepo repository.MaterialRepository) *EssayService {
	return &EssayService{repo: repo, materialRepo: materialRepo}
}

func (s *EssayService) CreateQuestion(ctx context.Context, callerRole, materialID, question string, orderIndex int) (*repository.EssayQuestion, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if _, err := s.materialRepo.GetByID(ctx, materialID); err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return nil, ErrMaterialNotFound
		}
		return nil, fmt.Errorf("get material: %w", err)
	}
	q := &repository.EssayQuestion{
		ID:         uuid.New().String(),
		MaterialID: materialID,
		Question:   question,
		OrderIndex: orderIndex,
		CreatedAt:  time.Now().UTC(),
	}
	if err := s.repo.CreateQuestion(ctx, q); err != nil {
		return nil, fmt.Errorf("create essay question: %w", err)
	}
	return q, nil
}

func (s *EssayService) ListQuestions(ctx context.Context, materialID string) ([]*repository.EssayQuestion, error) {
	qs, err := s.repo.ListQuestions(ctx, materialID)
	if err != nil {
		return nil, fmt.Errorf("list essay questions: %w", err)
	}
	return qs, nil
}

func (s *EssayService) DeleteQuestion(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.DeleteQuestion(ctx, id); err != nil {
		if errors.Is(err, repository.ErrEssayNotFound) {
			return ErrEssayNotFound
		}
		return fmt.Errorf("delete essay question: %w", err)
	}
	return nil
}

func (s *EssayService) AddComment(ctx context.Context, callerID, callerRole, essayQuestionID, content string) (*repository.EssayComment, error) {
	c := &repository.EssayComment{
		ID:              uuid.New().String(),
		EssayQuestionID: essayQuestionID,
		AuthorID:        callerID,
		AuthorRole:      callerRole,
		Content:         content,
		CreatedAt:       time.Now().UTC(),
	}
	if err := s.repo.CreateComment(ctx, c); err != nil {
		return nil, fmt.Errorf("add essay comment: %w", err)
	}
	// re-fetch to get author name
	comments, err := s.repo.ListComments(ctx, essayQuestionID)
	if err == nil {
		for _, existing := range comments {
			if existing.ID == c.ID {
				return existing, nil
			}
		}
	}
	return c, nil
}

func (s *EssayService) ListComments(ctx context.Context, essayQuestionID string) ([]*repository.EssayComment, error) {
	cs, err := s.repo.ListComments(ctx, essayQuestionID)
	if err != nil {
		return nil, fmt.Errorf("list essay comments: %w", err)
	}
	return cs, nil
}

// ── Diskusi per-fase ──

// AddPhaseComment posts a discussion comment on a "Fase Pembelajaran" block.
// Any authenticated user (student or teacher) may post; content must be non-empty.
func (s *EssayService) AddPhaseComment(ctx context.Context, callerID, callerRole, materialID, blockID, parentID, content string) (*repository.PhaseComment, error) {
	if strings.TrimSpace(content) == "" {
		return nil, ErrEmptyComment
	}
	if strings.TrimSpace(blockID) == "" {
		return nil, ErrEmptyComment
	}
	if _, err := s.materialRepo.GetByID(ctx, materialID); err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return nil, ErrMaterialNotFound
		}
		return nil, fmt.Errorf("get material: %w", err)
	}
	c := &repository.PhaseComment{
		ID:         uuid.New().String(),
		MaterialID: materialID,
		BlockID:    blockID,
		AuthorID:   callerID,
		AuthorRole: callerRole,
		Content:    content,
		CreatedAt:  time.Now().UTC(),
		ParentID:   parentID,
	}
	if err := s.repo.CreatePhaseComment(ctx, c); err != nil {
		return nil, fmt.Errorf("add phase comment: %w", err)
	}
	// re-fetch to populate author name/role from the users join
	comments, err := s.repo.ListPhaseComments(ctx, materialID, blockID)
	if err == nil {
		for _, existing := range comments {
			if existing.ID == c.ID {
				return existing, nil
			}
		}
	}
	return c, nil
}

func (s *EssayService) ListPhaseComments(ctx context.Context, materialID, blockID string) ([]*repository.PhaseComment, error) {
	cs, err := s.repo.ListPhaseComments(ctx, materialID, blockID)
	if err != nil {
		return nil, fmt.Errorf("list phase comments: %w", err)
	}
	return cs, nil
}
