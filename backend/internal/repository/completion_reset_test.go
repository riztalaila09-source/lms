package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

// Seeds two courses, one material each, plus completions and one essay question
// with answers from two students, then verifies the reset queries only remove
// the targeted student's rows for the targeted course.
func TestCompletionAndEssayReset_ScopedToStudentAndCourse(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	compRepo := repository.NewCompletionRepository(db)
	essayRepo := repository.NewEssayRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(suffix, role string) *repository.User {
		u := &repository.User{
			ID: testutil.NewUserID(), Username: "u_" + suffix, Email: suffix + "@test.com",
			PasswordHash: "x", Role: role, FullName: "U " + suffix, IsActive: true,
			CreatedAt: now, UpdatedAt: now,
		}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mkUser("teacher", "teacher")
	studentA := mkUser("a", "student")
	studentB := mkUser("b", "student")

	// Two courses, one published material each.
	course1, course2 := testutil.NewUserID(), testutil.NewUserID()
	mat1, mat2 := testutil.NewUserID(), testutil.NewUserID()
	for _, c := range []struct{ id, code string }{{course1, "C1"}, {course2, "C2"}} {
		_, err := db.ExecContext(ctx,
			`INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`,
			c.id, c.code, "Course "+c.code, teacher.ID)
		require.NoError(t, err)
	}
	for _, m := range []struct{ id, course string }{{mat1, course1}, {mat2, course2}} {
		_, err := db.ExecContext(ctx,
			`INSERT INTO course_materials (id, course_id, title, content_type, is_published, created_by)
			 VALUES (?, ?, ?, 'text', 1, ?)`,
			m.id, m.course, "Mat", teacher.ID)
		require.NoError(t, err)
	}

	// Completions: A finished mat1 (course1) and mat2 (course2); B finished mat1.
	mkComp := func(student, material string) {
		require.NoError(t, compRepo.Upsert(ctx, &repository.Completion{
			ID: testutil.NewUserID(), MaterialID: material, StudentID: student,
			ReadPercent: 100, QuizPassed: true, CompletedAt: now,
		}))
	}
	mkComp(studentA.ID, mat1)
	mkComp(studentA.ID, mat2)
	mkComp(studentB.ID, mat1)

	// Essay question on mat1 with an answer from each student.
	eq := &repository.EssayQuestion{ID: testutil.NewUserID(), MaterialID: mat1, Question: "Why?", CreatedAt: now}
	require.NoError(t, essayRepo.CreateQuestion(ctx, eq))
	for _, s := range []string{studentA.ID, studentB.ID} {
		require.NoError(t, essayRepo.CreateComment(ctx, &repository.EssayComment{
			ID: testutil.NewUserID(), EssayQuestionID: eq.ID, AuthorID: s, Content: "ans", CreatedAt: now,
		}))
	}

	// ── Reset student A in course1 ──
	deleted, err := compRepo.DeleteByStudentCourse(ctx, course1, studentA.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted, "only A's course1 completion deleted")

	delC, err := essayRepo.DeleteCommentsByStudentCourse(ctx, course1, studentA.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), delC, "only A's course1 essay answer deleted")

	// A's course1 completion gone; A's course2 and B's course1 untouched.
	_, err = compRepo.GetByStudentMaterial(ctx, studentA.ID, mat1)
	assert.ErrorIs(t, err, repository.ErrCompletionNotFound)
	_, err = compRepo.GetByStudentMaterial(ctx, studentA.ID, mat2)
	assert.NoError(t, err, "course2 completion must remain")
	_, err = compRepo.GetByStudentMaterial(ctx, studentB.ID, mat1)
	assert.NoError(t, err, "other student's completion must remain")

	// Only B's essay answer remains on the question.
	comments, err := essayRepo.ListComments(ctx, eq.ID)
	require.NoError(t, err)
	require.Len(t, comments, 1)
	assert.Equal(t, studentB.ID, comments[0].AuthorID)
}
