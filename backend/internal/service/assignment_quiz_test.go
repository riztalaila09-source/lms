package service_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

// MCQ grading: wrong answers EXCEEDING 5% of the total are rejected (must retry),
// otherwise the attempt is accepted, scored, and stored once.
func TestAssignmentService_SubmitQuiz(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	assignRepo := repository.NewAssignmentRepository(db)
	subRepo := repository.NewSubmissionRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	qRepo := repository.NewAssignmentQuestionRepository(db)
	svc := service.NewAssignmentService(assignRepo, subRepo, enrollRepo, courseRepo, qRepo)
	now := time.Now().UTC().Truncate(time.Second)

	mkStudent := func(s string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "q_" + s, Email: s + "@q.com", PasswordHash: "x", Role: "student", FullName: "S " + s, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := &repository.User{ID: testutil.NewUserID(), Username: "qt", Email: "qt@q.com", PasswordHash: "x", Role: "teacher", FullName: "T", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))

	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, 'QZ', 'Q', ?)`, courseID, teacher.ID)
	require.NoError(t, err)

	a, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Kuis", MaxScore: 100, Type: "pilihan_ganda"})
	require.NoError(t, err)

	// 20 questions; correct answer is always option index 0.
	qs := make([]*repository.AssignmentQuestion, 20)
	for i := range qs {
		qs[i] = &repository.AssignmentQuestion{Question: fmt.Sprintf("Q%d", i), Options: []string{"benar", "salah", "salah2", "salah3"}, CorrectIndex: 0}
	}
	require.NoError(t, svc.SetAssignmentQuestions(ctx, "teacher", a.ID, qs))

	stored, err := qRepo.ListByAssignment(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, stored, 20)

	// helper: build answers with `wrong` of them deliberately wrong.
	answersWith := func(wrong int) map[string]int {
		m := map[string]int{}
		for i, q := range stored {
			if i < wrong {
				m[q.ID] = 1 // wrong
			} else {
				m[q.ID] = 0 // correct
			}
		}
		return m
	}

	t.Run("all correct is accepted with full score", func(t *testing.T) {
		s := mkStudent("perfect")
		require.NoError(t, enrollRepo.Enroll(ctx, courseID, s.ID, testutil.NewUserID()))
		accepted, correct, total, score, err := svc.SubmitQuiz(ctx, s.ID, "student", a.ID, answersWith(0), 90)
		require.NoError(t, err)
		assert.True(t, accepted)
		assert.Equal(t, 20, correct)
		assert.Equal(t, 20, total)
		assert.Equal(t, 100, score)
		// submit-once: a second attempt is rejected
		_, _, _, _, err = svc.SubmitQuiz(ctx, s.ID, "student", a.ID, answersWith(0), 10)
		assert.Error(t, err)
	})

	t.Run("exactly 5% wrong (1/20) is still accepted", func(t *testing.T) {
		s := mkStudent("one")
		require.NoError(t, enrollRepo.Enroll(ctx, courseID, s.ID, testutil.NewUserID()))
		accepted, correct, _, score, err := svc.SubmitQuiz(ctx, s.ID, "student", a.ID, answersWith(1), 120)
		require.NoError(t, err)
		assert.True(t, accepted)
		assert.Equal(t, 19, correct)
		assert.Equal(t, 95, score)
	})

	t.Run("more than 5% wrong (2/20) resets — not stored", func(t *testing.T) {
		s := mkStudent("two")
		require.NoError(t, enrollRepo.Enroll(ctx, courseID, s.ID, testutil.NewUserID()))
		accepted, correct, total, score, err := svc.SubmitQuiz(ctx, s.ID, "student", a.ID, answersWith(2), 60)
		require.NoError(t, err)
		assert.False(t, accepted, "must retry")
		assert.Equal(t, 18, correct)
		assert.Equal(t, 20, total)
		assert.Equal(t, 0, score)
		// nothing stored → can retry and pass
		accepted, _, _, _, err = svc.SubmitQuiz(ctx, s.ID, "student", a.ID, answersWith(0), 75)
		require.NoError(t, err)
		assert.True(t, accepted)
	})

	t.Run("students get questions without the answer key", func(t *testing.T) {
		s := mkStudent("peek")
		require.NoError(t, enrollRepo.Enroll(ctx, courseID, s.ID, testutil.NewUserID()))
		got, err := svc.ListAssignmentQuestions(ctx, s.ID, "student", a.ID)
		require.NoError(t, err)
		require.NotEmpty(t, got)
		for _, q := range got {
			assert.Equal(t, -1, q.CorrectIndex, "correct index hidden from students")
		}
	})
}
