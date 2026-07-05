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
	ErrMaterialNotFound = errors.New("material not found")
)

type UpdateMaterialInput struct {
	Title       *string
	Description *string
	ContentType *string
	ContentURL  *string
	ContentText *string
	OrderIndex  *int
	IsPublished *bool
	CategoryID  *string
	CoverImage  *string
}

type MaterialService struct {
	materialRepo   repository.MaterialRepository
	enrollmentRepo repository.EnrollmentRepository
	questionRepo   repository.QuestionRepository
	categoryRepo   repository.CategoryRepository
}

func NewMaterialService(materialRepo repository.MaterialRepository, enrollmentRepo repository.EnrollmentRepository, questionRepo repository.QuestionRepository, categoryRepo repository.CategoryRepository) *MaterialService {
	return &MaterialService{materialRepo: materialRepo, enrollmentRepo: enrollmentRepo, questionRepo: questionRepo, categoryRepo: categoryRepo}
}

// canManageCourse reports whether the caller may edit course content.
// Teacher-driven product: any teacher (or legacy admin) has full control.
func (s *MaterialService) canManageCourse(_ context.Context, _, callerRole, _ string) (bool, error) {
	return isManager(callerRole), nil
}

func (s *MaterialService) CreateQuestion(ctx context.Context, callerID, callerRole, materialID, question string, options []string, correctIndex int, image string) (*repository.Question, error) {
	m, err := s.materialRepo.GetByID(ctx, materialID)
	if err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return nil, ErrMaterialNotFound
		}
		return nil, fmt.Errorf("get material: %w", err)
	}
	ok, err := s.canManageCourse(ctx, callerID, callerRole, m.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrPermissionDenied
	}

	existing, _ := s.questionRepo.ListByMaterial(ctx, materialID)
	q := &repository.Question{
		ID:           uuid.New().String(),
		MaterialID:   materialID,
		Question:     question,
		Options:      options,
		CorrectIndex: correctIndex,
		OrderIndex:   len(existing),
		Image:        image,
	}
	if err := s.questionRepo.Create(ctx, q); err != nil {
		return nil, fmt.Errorf("create question: %w", err)
	}
	return q, nil
}

func (s *MaterialService) ListQuestions(ctx context.Context, callerID, callerRole, materialID string) ([]*repository.Question, error) {
	m, err := s.materialRepo.GetByID(ctx, materialID)
	if err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return nil, ErrMaterialNotFound
		}
		return nil, fmt.Errorf("get material: %w", err)
	}
	// Managers always; students only if enrolled.
	ok, err := s.canManageCourse(ctx, callerID, callerRole, m.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		if callerRole != "student" {
			return nil, ErrPermissionDenied
		}
		// Materi Umum is open to all students; others require enrollment.
		if m.CourseID != repository.GeneralCourseID {
			enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, m.CourseID, callerID)
			if err != nil {
				return nil, fmt.Errorf("check enrollment: %w", err)
			}
			if !enrolled {
				return nil, ErrPermissionDenied
			}
		}
	}
	return s.questionRepo.ListByMaterial(ctx, materialID)
}

func (s *MaterialService) DeleteQuestion(ctx context.Context, callerID, callerRole, questionID string) error {
	materialID, err := s.questionRepo.GetMaterialID(ctx, questionID)
	if err != nil {
		if errors.Is(err, repository.ErrQuestionNotFound) {
			return ErrMaterialNotFound
		}
		return fmt.Errorf("get question: %w", err)
	}
	m, err := s.materialRepo.GetByID(ctx, materialID)
	if err != nil {
		return fmt.Errorf("get material: %w", err)
	}
	ok, err := s.canManageCourse(ctx, callerID, callerRole, m.CourseID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrPermissionDenied
	}
	return s.questionRepo.Delete(ctx, questionID)
}

func (s *MaterialService) CreateMaterial(ctx context.Context, callerID, callerRole, courseID, title, description, contentType, contentURL, contentText string, orderIndex int, categoryID, coverImage string) (*repository.Material, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}

	now := time.Now().UTC()
	m := &repository.Material{
		ID:          uuid.New().String(),
		CourseID:    courseID,
		Title:       title,
		Description: description,
		ContentType: contentType,
		ContentURL:  contentURL,
		ContentText: contentText,
		OrderIndex:  orderIndex,
		IsPublished: false,
		CreatedByID: callerID,
		CategoryID:  categoryID,
		CoverImage:  coverImage,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.materialRepo.Create(ctx, m); err != nil {
		return nil, fmt.Errorf("create material: %w", err)
	}
	// re-fetch so the response carries the joined category/creator names
	if created, err := s.materialRepo.GetByID(ctx, m.ID); err == nil {
		return created, nil
	}
	return m, nil
}

func (s *MaterialService) GetMaterial(ctx context.Context, callerID, callerRole, materialID string) (*repository.Material, error) {
	m, err := s.materialRepo.GetByID(ctx, materialID)
	if err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return nil, ErrMaterialNotFound
		}
		return nil, fmt.Errorf("get material: %w", err)
	}

	if isManager(callerRole) {
		return m, nil
	}
	if callerRole == "student" {
		// Materi Umum is open to all students; others require enrollment.
		if m.CourseID == repository.GeneralCourseID {
			if m.IsPublished {
				return m, nil
			}
			return nil, ErrPermissionDenied
		}
		enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, m.CourseID, callerID)
		if err != nil {
			return nil, fmt.Errorf("check enrollment: %w", err)
		}
		if enrolled && m.IsPublished {
			return m, nil
		}
	}
	return nil, ErrPermissionDenied
}

func (s *MaterialService) UpdateMaterial(ctx context.Context, callerID, callerRole, materialID string, input UpdateMaterialInput) (*repository.Material, error) {
	m, err := s.materialRepo.GetByID(ctx, materialID)
	if err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return nil, ErrMaterialNotFound
		}
		return nil, fmt.Errorf("get material: %w", err)
	}

	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}

	if input.Title != nil {
		m.Title = *input.Title
	}
	if input.Description != nil {
		m.Description = *input.Description
	}
	if input.ContentType != nil {
		m.ContentType = *input.ContentType
	}
	if input.ContentURL != nil {
		m.ContentURL = *input.ContentURL
	}
	if input.ContentText != nil {
		m.ContentText = *input.ContentText
	}
	if input.OrderIndex != nil {
		m.OrderIndex = *input.OrderIndex
	}
	if input.IsPublished != nil {
		m.IsPublished = *input.IsPublished
	}
	if input.CategoryID != nil {
		m.CategoryID = *input.CategoryID
	}
	if input.CoverImage != nil {
		m.CoverImage = *input.CoverImage
	}
	m.UpdatedByID = callerID // record who last edited

	if err := s.materialRepo.Update(ctx, m); err != nil {
		return nil, fmt.Errorf("update material: %w", err)
	}
	// re-fetch so the response carries the joined category/editor names
	updated, err := s.materialRepo.GetByID(ctx, m.ID)
	if err != nil {
		return m, nil
	}
	return updated, nil
}

// ── Kategori materi ──

func (s *MaterialService) CreateCategory(ctx context.Context, callerRole, code, name string) (*repository.Category, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	c := &repository.Category{
		ID:        uuid.New().String(),
		Code:      code,
		Name:      name,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.categoryRepo.Create(ctx, c); err != nil {
		if errors.Is(err, repository.ErrCategoryDuplicate) {
			return nil, ErrDuplicate
		}
		return nil, fmt.Errorf("create category: %w", err)
	}
	return c, nil
}

func (s *MaterialService) ListCategories(ctx context.Context) ([]*repository.Category, error) {
	return s.categoryRepo.List(ctx)
}

func (s *MaterialService) DeleteCategory(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.categoryRepo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrCategoryNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete category: %w", err)
	}
	return nil
}

func (s *MaterialService) DeleteMaterial(ctx context.Context, callerID, callerRole, materialID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if _, err := s.materialRepo.GetByID(ctx, materialID); err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return ErrMaterialNotFound
		}
		return fmt.Errorf("get material: %w", err)
	}
	return s.materialRepo.Delete(ctx, materialID)
}

func (s *MaterialService) ListMaterials(ctx context.Context, callerID, callerRole, courseID string, page, pageSize int) ([]*repository.Material, int, error) {
	onlyPublished := false

	if callerRole == "student" {
		// Materi Umum is open to all students; others require enrollment.
		if courseID != repository.GeneralCourseID {
			enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, courseID, callerID)
			if err != nil {
				return nil, 0, fmt.Errorf("check enrollment: %w", err)
			}
			if !enrolled {
				return nil, 0, ErrPermissionDenied
			}
		}
		onlyPublished = true
	} else if !isManager(callerRole) {
		return nil, 0, ErrPermissionDenied
	}

	return s.materialRepo.List(ctx, repository.MaterialListFilter{
		CourseID:      courseID,
		OnlyPublished: onlyPublished,
		Page:          page,
		PageSize:      pageSize,
	})
}

// SearchMaterials matches materials by title/description across the caller's
// accessible courses (students: Materi Umum + enrolled; managers: all).
func (s *MaterialService) SearchMaterials(ctx context.Context, callerID, callerRole, query string) ([]*repository.MaterialSearchResult, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil, nil
	}
	switch {
	case callerRole == "student":
		return s.materialRepo.SearchMaterials(ctx, q, callerID, true, 20)
	case isManager(callerRole):
		return s.materialRepo.SearchMaterials(ctx, q, "", false, 20)
	default:
		return nil, ErrPermissionDenied
	}
}

// ExploreMaterials returns Materi Umum + categorised materials from the caller's
// accessible courses, for the student "Jelajahi Materi Umum" browser.
func (s *MaterialService) ExploreMaterials(ctx context.Context, callerID, callerRole string) ([]*repository.Material, error) {
	switch {
	case callerRole == "student":
		return s.materialRepo.ListExplore(ctx, callerID, 300)
	case isManager(callerRole):
		return s.materialRepo.ListExplore(ctx, "", 300)
	default:
		return nil, ErrPermissionDenied
	}
}

// RateMaterial lets a student give a 1–5 star rating to an accessible material.
// Returns the new average, total ratings, and the caller's rating.
func (s *MaterialService) RateMaterial(ctx context.Context, callerID, callerRole, materialID string, stars int) (float64, int, int, error) {
	if callerRole != "student" {
		return 0, 0, 0, ErrPermissionDenied
	}
	if stars < 1 || stars > 5 {
		return 0, 0, 0, fmt.Errorf("stars must be between 1 and 5")
	}
	m, err := s.materialRepo.GetByID(ctx, materialID)
	if err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			return 0, 0, 0, ErrMaterialNotFound
		}
		return 0, 0, 0, fmt.Errorf("get material: %w", err)
	}
	// Materi Umum is open to all students; other courses need enrollment.
	if m.CourseID != repository.GeneralCourseID {
		enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, m.CourseID, callerID)
		if err != nil {
			return 0, 0, 0, fmt.Errorf("check enrollment: %w", err)
		}
		if !enrolled {
			return 0, 0, 0, ErrPermissionDenied
		}
	}
	avg, count, err := s.materialRepo.RateMaterial(ctx, materialID, callerID, stars)
	if err != nil {
		return 0, 0, 0, err
	}
	return avg, count, stars, nil
}
