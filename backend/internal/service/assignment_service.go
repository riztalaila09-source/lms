package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var (
	ErrAssignmentNotFound = errors.New("assignment not found")
	ErrSubmissionNotFound = errors.New("submission not found")
)

type AssignmentService struct {
	assignmentRepo repository.AssignmentRepository
	submissionRepo repository.SubmissionRepository
	enrollmentRepo repository.EnrollmentRepository
	courseRepo     repository.CourseRepository
	questionRepo   repository.AssignmentQuestionRepository
}

func NewAssignmentService(
	assignmentRepo repository.AssignmentRepository,
	submissionRepo repository.SubmissionRepository,
	enrollmentRepo repository.EnrollmentRepository,
	courseRepo repository.CourseRepository,
	questionRepo repository.AssignmentQuestionRepository,
) *AssignmentService {
	return &AssignmentService{
		assignmentRepo: assignmentRepo,
		submissionRepo: submissionRepo,
		enrollmentRepo: enrollmentRepo,
		courseRepo:     courseRepo,
		questionRepo:   questionRepo,
	}
}

type CreateAssignmentInput struct {
	CourseID    string
	Title       string
	Description string
	Deadline    *time.Time
	MaxScore    int
	Type        string
}

type UpdateAssignmentInput struct {
	Title       *string
	Description *string
	Deadline    *time.Time
	MaxScore    *int
	IsActive    *bool
}

func (s *AssignmentService) canManage(_ context.Context, _, callerRole, _ string) (bool, error) {
	// Teacher-driven product: any teacher (or legacy admin) has full control.
	return isManager(callerRole), nil
}

func (s *AssignmentService) CreateAssignment(ctx context.Context, callerID, callerRole string, in CreateAssignmentInput) (*repository.Assignment, error) {
	ok, err := s.canManage(ctx, callerID, callerRole, in.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrPermissionDenied
	}
	if in.MaxScore <= 0 {
		in.MaxScore = 100
	}
	now := time.Now().UTC()
	a := &repository.Assignment{
		ID:          uuid.New().String(),
		CourseID:    in.CourseID,
		Title:       in.Title,
		Description: in.Description,
		MaxScore:    in.MaxScore,
		IsActive:    true,
		CreatedByID: callerID,
		Type:        in.Type,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if in.Deadline != nil {
		a.Deadline = sql.NullTime{Time: *in.Deadline, Valid: true}
	}
	if err := s.assignmentRepo.Create(ctx, a); err != nil {
		return nil, fmt.Errorf("create assignment: %w", err)
	}
	return s.assignmentRepo.GetByID(ctx, a.ID)
}

func (s *AssignmentService) GetAssignment(ctx context.Context, callerID, callerRole, id string) (*repository.Assignment, error) {
	a, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	ok, err := s.canManage(ctx, callerID, callerRole, a.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, a.CourseID, callerID)
		if err != nil {
			return nil, fmt.Errorf("check enrollment: %w", err)
		}
		if !enrolled {
			return nil, ErrPermissionDenied
		}
	}
	return a, nil
}

func (s *AssignmentService) UpdateAssignment(ctx context.Context, callerID, callerRole, id string, in UpdateAssignmentInput) (*repository.Assignment, error) {
	a, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	ok, err := s.canManage(ctx, callerID, callerRole, a.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrPermissionDenied
	}
	if in.Title != nil {
		a.Title = *in.Title
	}
	if in.Description != nil {
		a.Description = *in.Description
	}
	if in.Deadline != nil {
		a.Deadline = sql.NullTime{Time: *in.Deadline, Valid: true}
	}
	if in.MaxScore != nil {
		a.MaxScore = *in.MaxScore
	}
	if in.IsActive != nil {
		a.IsActive = *in.IsActive
	}
	if err := s.assignmentRepo.Update(ctx, a); err != nil {
		return nil, fmt.Errorf("update assignment: %w", err)
	}
	return s.assignmentRepo.GetByID(ctx, id)
}

func (s *AssignmentService) DeleteAssignment(ctx context.Context, callerID, callerRole, id string) error {
	a, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return ErrAssignmentNotFound
		}
		return fmt.Errorf("get assignment: %w", err)
	}
	ok, err := s.canManage(ctx, callerID, callerRole, a.CourseID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrPermissionDenied
	}
	return s.assignmentRepo.Delete(ctx, id)
}

func (s *AssignmentService) ListAssignments(ctx context.Context, callerID, callerRole, courseID string, page, pageSize int) ([]*repository.Assignment, int, error) {
	f := repository.AssignmentListFilter{CourseID: courseID, Page: page, PageSize: pageSize}
	// Managers see all assignments; students only those in courses they're enrolled in.
	if callerRole == "student" {
		f.StudentID = callerID
	}
	return s.assignmentRepo.List(ctx, f)
}

func (s *AssignmentService) SubmitAssignment(ctx context.Context, callerID, callerRole, assignmentID, content, fileURL string) (*repository.Submission, error) {
	if callerRole != "student" {
		return nil, ErrPermissionDenied
	}
	a, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, a.CourseID, callerID)
	if err != nil {
		return nil, fmt.Errorf("check enrollment: %w", err)
	}
	if !enrolled {
		return nil, ErrPermissionDenied
	}
	blocked, err := s.assignmentRepo.IsBlocked(ctx, assignmentID, callerID)
	if err != nil {
		return nil, fmt.Errorf("check blocked: %w", err)
	}
	if blocked {
		return nil, fmt.Errorf("Anda diblokir untuk mengumpulkan tugas ini")
	}
	if !a.IsActive {
		return nil, fmt.Errorf("tugas tidak aktif")
	}
	if a.Deadline.Valid && time.Now().After(a.Deadline.Time) {
		return nil, fmt.Errorf("deadline sudah lewat")
	}
	// Submit-once: a student may only submit a given assignment a single time.
	if existing, _ := s.submissionRepo.Get(ctx, assignmentID, callerID); existing != nil {
		return nil, fmt.Errorf("tugas sudah dikumpulkan dan tidak bisa dikirim lagi")
	}
	sub := &repository.Submission{
		ID:           uuid.New().String(),
		AssignmentID: assignmentID,
		StudentID:    callerID,
		Content:      content,
		FileURL:      fileURL,
	}
	if err := s.submissionRepo.Upsert(ctx, sub); err != nil {
		return nil, fmt.Errorf("submit: %w", err)
	}
	return s.submissionRepo.Get(ctx, assignmentID, callerID)
}

// ListSubmissions returns every enrolled student with their submission status
// (submitted students first, then those who have not submitted yet).
func (s *AssignmentService) ListSubmissions(ctx context.Context, callerID, callerRole, assignmentID string) ([]*repository.Submission, error) {
	a, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	ok, err := s.canManage(ctx, callerID, callerRole, a.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrPermissionDenied
	}

	subs, err := s.submissionRepo.ListByAssignment(ctx, assignmentID)
	if err != nil {
		return nil, err
	}
	submittedBy := make(map[string]bool, len(subs))
	for _, sub := range subs {
		submittedBy[sub.StudentID] = true
	}

	// Append enrolled students who have NOT submitted.
	students, _, err := s.enrollmentRepo.ListStudents(ctx, a.CourseID, 1, 1000)
	if err != nil {
		return nil, err
	}
	for _, e := range students {
		if submittedBy[e.StudentID] {
			continue
		}
		subs = append(subs, &repository.Submission{
			AssignmentID: assignmentID,
			StudentID:    e.StudentID,
			StudentName:  e.StudentName,
			StudentKelas: e.StudentKelas,
			Submitted:    false,
		})
	}
	return subs, nil
}

func (s *AssignmentService) GradeSubmission(ctx context.Context, callerID, callerRole, submissionID string, score int, feedback string) (*repository.Submission, error) {
	sub, err := s.submissionRepo.GetByID(ctx, submissionID)
	if err != nil {
		if errors.Is(err, repository.ErrSubmissionNotFound) {
			return nil, ErrSubmissionNotFound
		}
		return nil, fmt.Errorf("get submission: %w", err)
	}
	a, err := s.assignmentRepo.GetByID(ctx, sub.AssignmentID)
	if err != nil {
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	ok, err := s.canManage(ctx, callerID, callerRole, a.CourseID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrPermissionDenied
	}
	if score < 0 {
		score = 0
	}
	if score > a.MaxScore {
		score = a.MaxScore
	}
	if err := s.submissionRepo.Grade(ctx, submissionID, score, feedback, time.Now().UTC()); err != nil {
		return nil, fmt.Errorf("grade: %w", err)
	}
	return s.submissionRepo.GetByID(ctx, submissionID)
}

// ── Blokir siswa per-tugas ──

func (s *AssignmentService) BlockStudent(ctx context.Context, callerID, callerRole, assignmentID, studentID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	return s.assignmentRepo.Block(ctx, uuid.New().String(), assignmentID, studentID)
}

func (s *AssignmentService) UnblockStudent(ctx context.Context, callerID, callerRole, assignmentID, studentID string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	return s.assignmentRepo.Unblock(ctx, assignmentID, studentID)
}

func (s *AssignmentService) ListBlockedStudents(ctx context.Context, callerRole, assignmentID string) ([]string, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.assignmentRepo.ListBlockedStudentIDs(ctx, assignmentID)
}

// ── Soal pilihan ganda (kuis) ──

// canStudentAttempt validates a student may still work on an assignment.
func (s *AssignmentService) canStudentAttempt(ctx context.Context, a *repository.Assignment, studentID string) error {
	enrolled, err := s.enrollmentRepo.IsEnrolled(ctx, a.CourseID, studentID)
	if err != nil {
		return fmt.Errorf("check enrollment: %w", err)
	}
	if !enrolled {
		return ErrPermissionDenied
	}
	blocked, err := s.assignmentRepo.IsBlocked(ctx, a.ID, studentID)
	if err != nil {
		return fmt.Errorf("check blocked: %w", err)
	}
	if blocked {
		return fmt.Errorf("Anda diblokir untuk mengerjakan tugas ini")
	}
	if !a.IsActive {
		return fmt.Errorf("tugas tidak aktif")
	}
	if a.Deadline.Valid && time.Now().After(a.Deadline.Time) {
		return fmt.Errorf("deadline sudah lewat")
	}
	if existing, _ := s.submissionRepo.Get(ctx, a.ID, studentID); existing != nil {
		return fmt.Errorf("tugas sudah dikumpulkan dan tidak bisa dikerjakan lagi")
	}
	return nil
}

func (s *AssignmentService) SetAssignmentQuestions(ctx context.Context, callerRole, assignmentID string, qs []*repository.AssignmentQuestion) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if _, err := s.assignmentRepo.GetByID(ctx, assignmentID); err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return ErrAssignmentNotFound
		}
		return fmt.Errorf("get assignment: %w", err)
	}
	return s.questionRepo.SetForAssignment(ctx, assignmentID, qs)
}

func (s *AssignmentService) ListAssignmentQuestions(ctx context.Context, callerID, callerRole, assignmentID string) ([]*repository.AssignmentQuestion, error) {
	a, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	if !isManager(callerRole) {
		if err := s.canStudentAttempt(ctx, a, callerID); err != nil {
			return nil, err
		}
	}
	qs, err := s.questionRepo.ListByAssignment(ctx, assignmentID)
	if err != nil {
		return nil, err
	}
	if !isManager(callerRole) {
		for _, q := range qs {
			q.CorrectIndex = -1 // never expose the answer key to students
		}
	}
	return qs, nil
}

// SubmitQuiz grades an MCQ attempt. Wrong answers exceeding 5% of the total are
// rejected (accepted=false) so the student must retry; otherwise the score and
// time taken are stored (one accepted submission per student).
func (s *AssignmentService) SubmitQuiz(ctx context.Context, callerID, callerRole, assignmentID string, answers map[string]int, timeTaken int) (accepted bool, correct, total, score int, err error) {
	if callerRole != "student" {
		return false, 0, 0, 0, ErrPermissionDenied
	}
	a, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return false, 0, 0, 0, ErrAssignmentNotFound
		}
		return false, 0, 0, 0, fmt.Errorf("get assignment: %w", err)
	}
	if err := s.canStudentAttempt(ctx, a, callerID); err != nil {
		return false, 0, 0, 0, err
	}
	qs, err := s.questionRepo.ListByAssignment(ctx, assignmentID)
	if err != nil {
		return false, 0, 0, 0, err
	}
	total = len(qs)
	if total == 0 {
		return false, 0, 0, 0, fmt.Errorf("tugas ini belum punya soal")
	}
	for _, q := range qs {
		if ans, ok := answers[q.ID]; ok && ans == q.CorrectIndex {
			correct++
		}
	}
	wrong := total - correct
	// Reset bila salah melebihi 5% dari jumlah soal.
	if wrong*100 > total*5 {
		return false, correct, total, 0, nil
	}
	score = (correct*a.MaxScore + total/2) / total
	if err := s.submissionRepo.CreateQuizSubmission(ctx, uuid.New().String(), assignmentID, callerID, score, timeTaken); err != nil {
		return false, correct, total, 0, err
	}
	return true, correct, total, score, nil
}

// GradeGrid is the assembled data for the Nilai page.
type GradeGrid struct {
	Columns []GradeColumn
	Rows    []GradeStudentRow
}

type GradeColumn struct {
	AssignmentID    string
	AssignmentTitle string
	MaxScore        int
}

type GradeStudentRow struct {
	StudentID   string
	StudentName string
	Kelas       string
	Jurusan     string
	Cells       map[string]int // assignmentID -> score (only graded ones present)
	Average     float64
}

func (s *AssignmentService) ListGrades(ctx context.Context, callerID, callerRole, courseID, kelas, search string) (*GradeGrid, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}

	f := repository.AssignmentListFilter{CourseID: courseID, Page: 1, PageSize: 1000}
	assignments, _, err := s.assignmentRepo.List(ctx, f)
	if err != nil {
		return nil, err
	}

	grid := &GradeGrid{}
	ids := make([]string, 0, len(assignments))
	// Collect distinct courses to gather their students.
	courseSet := map[string]bool{}
	for _, a := range assignments {
		grid.Columns = append(grid.Columns, GradeColumn{
			AssignmentID: a.ID, AssignmentTitle: a.Title, MaxScore: a.MaxScore,
		})
		ids = append(ids, a.ID)
		courseSet[a.CourseID] = true
	}

	subs, err := s.submissionRepo.ListByAssignmentIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	// scoresByStudent[studentID][assignmentID] = score
	scoresByStudent := map[string]map[string]int{}
	for _, sub := range subs {
		if !sub.Score.Valid {
			continue
		}
		if scoresByStudent[sub.StudentID] == nil {
			scoresByStudent[sub.StudentID] = map[string]int{}
		}
		scoresByStudent[sub.StudentID][sub.AssignmentID] = int(sub.Score.Int64)
	}

	// Build student rows from enrollments across the involved courses.
	seen := map[string]bool{}
	for cid := range courseSet {
		students, _, err := s.enrollmentRepo.ListStudents(ctx, cid, 1, 1000)
		if err != nil {
			return nil, err
		}
		for _, e := range students {
			if seen[e.StudentID] {
				continue
			}
			if kelas != "" && e.StudentKelas != kelas {
				continue
			}
			if search != "" && !containsFold(e.StudentName, search) {
				continue
			}
			seen[e.StudentID] = true
			cells := scoresByStudent[e.StudentID]
			if cells == nil {
				cells = map[string]int{}
			}
			sum, n := 0, 0
			for _, v := range cells {
				sum += v
				n++
			}
			avg := 0.0
			if n > 0 {
				avg = float64(sum) / float64(n)
			}
			grid.Rows = append(grid.Rows, GradeStudentRow{
				StudentID:   e.StudentID,
				StudentName: e.StudentName,
				Kelas:       e.StudentKelas,
				Jurusan:     e.StudentJurusan,
				Cells:       cells,
				Average:     avg,
			})
		}
	}
	return grid, nil
}

// ── Student self-view: own grades grouped by subject (mata pelajaran) ──
type MySubjectGrade struct {
	CourseID        string
	CourseName      string
	GradedCount     int
	AssignmentCount int
	Average         float64 // 0-100
	HasGrade        bool
}

type MyGrades struct {
	Subjects       []MySubjectGrade
	OverallAverage float64
	HasGrade       bool
}

// ListMyGrades returns the calling student's average per enrolled subject and
// an overall average. Scores are normalised to a 0-100 percentage so subjects
// with different max scores stay comparable.
func (s *AssignmentService) ListMyGrades(ctx context.Context, studentID string) (*MyGrades, error) {
	assignments, _, err := s.assignmentRepo.List(ctx, repository.AssignmentListFilter{Page: 1, PageSize: 2000})
	if err != nil {
		return nil, err
	}

	enrolled := map[string]bool{}
	isEnrolled := func(cid string) bool {
		if v, ok := enrolled[cid]; ok {
			return v
		}
		ok2, _ := s.enrollmentRepo.IsEnrolled(ctx, cid, studentID)
		enrolled[cid] = ok2
		return ok2
	}

	type agg struct {
		name    string
		ids     []string
		maxByID map[string]int
	}
	order := []string{}
	byCourse := map[string]*agg{}
	allIDs := []string{}
	for _, a := range assignments {
		if !isEnrolled(a.CourseID) {
			continue
		}
		g := byCourse[a.CourseID]
		if g == nil {
			g = &agg{name: a.CourseName, maxByID: map[string]int{}}
			byCourse[a.CourseID] = g
			order = append(order, a.CourseID)
		}
		mx := a.MaxScore
		if mx <= 0 {
			mx = 100
		}
		g.ids = append(g.ids, a.ID)
		g.maxByID[a.ID] = mx
		allIDs = append(allIDs, a.ID)
	}

	subs, err := s.submissionRepo.ListByAssignmentIDs(ctx, allIDs)
	if err != nil {
		return nil, err
	}
	scoreByID := map[string]int{}
	for _, sub := range subs {
		if sub.StudentID != studentID || !sub.Score.Valid {
			continue
		}
		scoreByID[sub.AssignmentID] = int(sub.Score.Int64)
	}

	result := &MyGrades{}
	var sumAvg float64
	gradedSubjects := 0
	for _, cid := range order {
		g := byCourse[cid]
		var sumPct float64
		graded := 0
		for _, aid := range g.ids {
			if sc, ok := scoreByID[aid]; ok {
				sumPct += float64(sc) / float64(g.maxByID[aid]) * 100
				graded++
			}
		}
		sg := MySubjectGrade{
			CourseID: cid, CourseName: g.name,
			GradedCount: graded, AssignmentCount: len(g.ids),
		}
		if graded > 0 {
			sg.Average = sumPct / float64(graded)
			sg.HasGrade = true
			sumAvg += sg.Average
			gradedSubjects++
		}
		result.Subjects = append(result.Subjects, sg)
	}
	if gradedSubjects > 0 {
		result.OverallAverage = sumAvg / float64(gradedSubjects)
		result.HasGrade = true
	}
	return result, nil
}

func containsFold(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexFold(s, sub) >= 0)
}

func indexFold(s, sub string) int {
	ls, lsub := toLower(s), toLower(sub)
	for i := 0; i+len(lsub) <= len(ls); i++ {
		if ls[i:i+len(lsub)] == lsub {
			return i
		}
	}
	return -1
}

func toLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}
