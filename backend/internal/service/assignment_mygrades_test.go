package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

// A student's self-view averages graded scores per subject (as a percentage)
// and across subjects, and only includes courses they're enrolled in.
func TestAssignmentService_ListMyGrades(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	assignRepo := repository.NewAssignmentRepository(db)
	subRepo := repository.NewSubmissionRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	qRepo := repository.NewAssignmentQuestionRepository(db)
	gRepo := repository.NewAssignmentGroupRepository(db)
	svc := service.NewAssignmentService(assignRepo, subRepo, enrollRepo, courseRepo, qRepo, gRepo)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(s, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "mg_" + s, Email: s + "@mg.com", PasswordHash: "x", Role: role, FullName: "U " + s, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mkUser("t", "teacher")
	student := mkUser("s", "student")

	mkCourse := func(code, name string) string {
		id := testutil.NewUserID()
		_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`, id, code, name, teacher.ID)
		require.NoError(t, err)
		return id
	}
	mat := mkCourse("MAT", "Matematika")
	ipa := mkCourse("IPA", "IPA")
	other := mkCourse("OTH", "Bahasa") // student NOT enrolled here

	require.NoError(t, enrollRepo.Enroll(ctx, mat, student.ID, testutil.NewUserID()))
	require.NoError(t, enrollRepo.Enroll(ctx, ipa, student.ID, testutil.NewUserID()))

	mkAssignment := func(courseID, title string, max int) *repository.Assignment {
		a, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: title, MaxScore: max})
		require.NoError(t, err)
		return a
	}
	gradeSubmit := func(a *repository.Assignment, score int) {
		sub, err := svc.SubmitAssignment(ctx, student.ID, "student", a.ID, "jawaban", "")
		require.NoError(t, err)
		_, err = svc.GradeSubmission(ctx, teacher.ID, "teacher", sub.ID, score, "ok")
		require.NoError(t, err)
	}

	// Matematika: two graded (80, 100) → avg 90.
	gradeSubmit(mkAssignment(mat, "Mat Tugas 1", 100), 80)
	gradeSubmit(mkAssignment(mat, "Mat Tugas 2", 100), 100)
	// IPA: one graded (70) of two assignments → avg 70, 1/2 graded.
	gradeSubmit(mkAssignment(ipa, "IPA Tugas 1", 100), 70)
	mkAssignment(ipa, "IPA Tugas 2", 100) // ungraded
	// Course the student is not enrolled in — must be excluded.
	mkAssignment(other, "Bahasa Tugas 1", 100)

	res, err := svc.ListMyGrades(ctx, student.ID)
	require.NoError(t, err)
	require.True(t, res.HasGrade)

	byName := map[string]service.MySubjectGrade{}
	for _, s := range res.Subjects {
		byName[s.CourseName] = s
	}
	require.Contains(t, byName, "Matematika")
	require.Contains(t, byName, "IPA")
	assert.NotContains(t, byName, "Bahasa", "unenrolled course excluded")

	assert.InDelta(t, 90.0, byName["Matematika"].Average, 0.01)
	assert.Equal(t, 2, byName["Matematika"].GradedCount)
	assert.Equal(t, 2, byName["Matematika"].AssignmentCount)

	assert.InDelta(t, 70.0, byName["IPA"].Average, 0.01)
	assert.Equal(t, 1, byName["IPA"].GradedCount)
	assert.Equal(t, 2, byName["IPA"].AssignmentCount)

	// Overall = mean of subject averages = (90 + 70) / 2 = 80.
	assert.InDelta(t, 80.0, res.OverallAverage, 0.01)
}
