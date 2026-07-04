package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var (
	ErrCourseNotFound  = errors.New("course not found")
	ErrCourseDuplicate = errors.New("course code already exists")
	ErrAlreadyEnrolled = errors.New("student already enrolled")
	ErrNotEnrolled     = errors.New("student not enrolled")
)

type UpdateCourseInput struct {
	Code            *string
	Name            *string
	Description     *string
	TeacherID       *string
	IsActive        *bool
	BackgroundImage *string
}

type CourseService struct {
	courseRepo     repository.CourseRepository
	enrollmentRepo repository.EnrollmentRepository
	userRepo       repository.UserRepository
}

func NewCourseService(courseRepo repository.CourseRepository, enrollmentRepo repository.EnrollmentRepository, userRepo repository.UserRepository) *CourseService {
	return &CourseService{courseRepo: courseRepo, enrollmentRepo: enrollmentRepo, userRepo: userRepo}
}

// AutoEnrollStudentByKelas enrolls a new student into all active courses that
// have their kelas set to the student's kelas. Errors are silently ignored.
func (s *CourseService) AutoEnrollStudentByKelas(ctx context.Context, studentID, kelasName string) {
	if kelasName == "" {
		return
	}
	ids, err := s.courseRepo.FindCourseIDsByKelasName(ctx, kelasName)
	if err != nil {
		return
	}
	for _, courseID := range ids {
		_ = s.enrollmentRepo.Enroll(ctx, courseID, studentID, uuid.New().String())
	}
}

// SyncStudentEnrollments makes a single student's enrollments match their class:
// enroll into every course assigned to their new class, and un-enroll from
// courses whose classes no longer include them. Call this when a student's
// kelas changes so their course/assignment visibility stays correct.
func (s *CourseService) SyncStudentEnrollments(ctx context.Context, studentID, kelasName string) {
	desired := map[string]bool{}
	if kelasName != "" {
		ids, err := s.courseRepo.FindCourseIDsByKelasName(ctx, kelasName)
		if err == nil {
			for _, id := range ids {
				desired[id] = true
				_ = s.enrollmentRepo.Enroll(ctx, id, studentID, uuid.New().String())
			}
		}
	}
	// Remove from currently-enrolled courses that no longer match the class.
	current, _, err := s.courseRepo.List(ctx, repository.CourseListFilter{StudentID: studentID, Page: 1, PageSize: 100000})
	if err == nil {
		for _, c := range current {
			if !desired[c.ID] {
				_ = s.enrollmentRepo.Unenroll(ctx, c.ID, studentID)
			}
		}
	}
}

// reconcileEnrollmentsByClasses makes a course's enrollments exactly match the
// students in its assigned classes. Students whose class was removed are
// un-enrolled (losing visibility); students in newly-assigned classes are added.
// This is what enforces class-based visibility: a student only sees a course
// when their class is among the course's assigned classes.
func (s *CourseService) reconcileEnrollmentsByClasses(ctx context.Context, courseID string, kelasNames []string) {
	// Desired set: every student whose kelas is one of the assigned classes.
	desired := map[string]bool{}
	for _, name := range kelasNames {
		if name == "" {
			continue
		}
		students, _, err := s.userRepo.List(ctx, repository.ListFilter{RoleFilter: "student", Kelas: name, Page: 1, PageSize: 100000})
		if err != nil {
			continue
		}
		for _, st := range students {
			desired[st.ID] = true
		}
	}

	// Remove enrollments that are no longer covered by an assigned class.
	current, _, err := s.enrollmentRepo.ListStudents(ctx, courseID, 1, 100000)
	if err == nil {
		for _, e := range current {
			if !desired[e.StudentID] {
				_ = s.enrollmentRepo.Unenroll(ctx, courseID, e.StudentID)
			}
		}
	}

	// Add students from assigned classes (Enroll is a no-op if already enrolled).
	for id := range desired {
		_ = s.enrollmentRepo.Enroll(ctx, courseID, id, uuid.New().String())
	}
}

// isManager reports whether a role may create/manage shared data.
// The product is teacher-driven: teachers (and any legacy admin) have full control.
func isManager(role string) bool {
	return role == "admin" || role == "teacher"
}

func (s *CourseService) CreateCourse(ctx context.Context, callerRole, code, name, description, teacherID, backgroundImage string, classIDs []string) (*repository.Course, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}

	now := time.Now().UTC()
	c := &repository.Course{
		ID:              uuid.New().String(),
		Code:            code,
		Name:            name,
		Description:     description,
		TeacherID:       teacherID,
		IsActive:        true,
		BackgroundImage: backgroundImage,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.courseRepo.Create(ctx, c); err != nil {
		if errors.Is(err, repository.ErrCourseDuplicate) {
			return nil, ErrCourseDuplicate
		}
		return nil, fmt.Errorf("create course: %w", err)
	}
	if err := s.courseRepo.SetCourseClasses(ctx, c.ID, classIDs); err != nil {
		return nil, fmt.Errorf("set classes: %w", err)
	}
	created, err := s.courseRepo.GetByID(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	s.reconcileEnrollmentsByClasses(ctx, c.ID, created.Kelas)
	return s.courseRepo.GetByID(ctx, c.ID)
}

func (s *CourseService) GetCourse(ctx context.Context, callerID, callerRole, courseID string) (*repository.Course, error) {
	c, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil {
		if errors.Is(err, repository.ErrCourseNotFound) {
			return nil, ErrCourseNotFound
		}
		return nil, fmt.Errorf("get course: %w", err)
	}

	if isManager(callerRole) {
		return c, nil
	}
	if callerRole == "student" {
		// Materi Umum is open to all students; others require enrollment.
		if courseID == repository.GeneralCourseID {
			return c, nil
		}
		enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, courseID, callerID)
		if err != nil {
			return nil, fmt.Errorf("check enrollment: %w", err)
		}
		if enrolled {
			return c, nil
		}
	}
	return nil, ErrPermissionDenied
}

func (s *CourseService) UpdateCourse(ctx context.Context, callerRole, courseID string, input UpdateCourseInput, classIDs []string, setClasses bool) (*repository.Course, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}

	c, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil {
		if errors.Is(err, repository.ErrCourseNotFound) {
			return nil, ErrCourseNotFound
		}
		return nil, fmt.Errorf("get course: %w", err)
	}

	if input.Code != nil {
		c.Code = *input.Code
	}
	if input.Name != nil {
		c.Name = *input.Name
	}
	if input.Description != nil {
		c.Description = *input.Description
	}
	if input.TeacherID != nil {
		c.TeacherID = *input.TeacherID
	}
	if input.IsActive != nil {
		c.IsActive = *input.IsActive
	}
	if input.BackgroundImage != nil {
		c.BackgroundImage = *input.BackgroundImage
	}

	if err := s.courseRepo.Update(ctx, c); err != nil {
		if errors.Is(err, repository.ErrCourseDuplicate) {
			return nil, ErrCourseDuplicate
		}
		return nil, fmt.Errorf("update course: %w", err)
	}
	if setClasses {
		if err := s.courseRepo.SetCourseClasses(ctx, courseID, classIDs); err != nil {
			return nil, fmt.Errorf("set classes: %w", err)
		}
		updated, err := s.courseRepo.GetByID(ctx, courseID)
		if err != nil {
			return nil, err
		}
		s.reconcileEnrollmentsByClasses(ctx, courseID, updated.Kelas)
	}
	return s.courseRepo.GetByID(ctx, c.ID)
}

func (s *CourseService) DeleteCourse(ctx context.Context, callerRole, courseID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.courseRepo.Delete(ctx, courseID); err != nil {
		if errors.Is(err, repository.ErrCourseNotFound) {
			return ErrCourseNotFound
		}
		return fmt.Errorf("delete course: %w", err)
	}
	return nil
}

func (s *CourseService) ListCourses(ctx context.Context, callerID, callerRole string, page, pageSize int) ([]*repository.Course, int, error) {
	f := repository.CourseListFilter{Page: page, PageSize: pageSize}
	// Managers see every course; students only see ones they're enrolled in.
	if callerRole == "student" {
		f.StudentID = callerID
	}
	courses, total, err := s.courseRepo.List(ctx, f)
	if err != nil {
		return nil, 0, fmt.Errorf("list courses: %w", err)
	}
	return courses, total, nil
}

func (s *CourseService) EnrollStudents(ctx context.Context, callerRole, courseID string, studentIDs []string) (int, error) {
	if !isManager(callerRole) {
		return 0, ErrPermissionDenied
	}

	if _, err := s.courseRepo.GetByID(ctx, courseID); err != nil {
		if errors.Is(err, repository.ErrCourseNotFound) {
			return 0, ErrCourseNotFound
		}
		return 0, fmt.Errorf("get course: %w", err)
	}

	enrolled := 0
	for _, sid := range studentIDs {
		err := s.enrollmentRepo.Enroll(ctx, courseID, sid, uuid.New().String())
		if err != nil && !errors.Is(err, repository.ErrAlreadyEnrolled) {
			return enrolled, fmt.Errorf("enroll student %s: %w", sid, err)
		}
		if err == nil {
			enrolled++
		}
	}
	return enrolled, nil
}

func (s *CourseService) UnenrollStudent(ctx context.Context, callerRole, courseID, studentID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.enrollmentRepo.Unenroll(ctx, courseID, studentID); err != nil {
		if errors.Is(err, repository.ErrNotEnrolled) {
			return ErrNotEnrolled
		}
		return fmt.Errorf("unenroll student: %w", err)
	}
	return nil
}

func (s *CourseService) GetCourseStudents(ctx context.Context, callerID, callerRole, courseID string, page, pageSize int) ([]*repository.Enrollment, int, error) {
	if isManager(callerRole) {
		return s.enrollmentRepo.ListStudents(ctx, courseID, page, pageSize)
	}
	return nil, 0, ErrPermissionDenied
}
