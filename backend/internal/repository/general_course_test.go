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

// The "Materi Umum" (general) course has no enrollments, yet its completion
// summary must count EVERY student. Verify a non-enrolled student still shows up.
func TestCompletionRepository_GeneralCourseCountsAllStudents(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	compRepo := repository.NewCompletionRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	// The general course is created by migration 00016 (owner = demo teacher).
	var ownerID string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT teacher_id FROM courses WHERE id = ?`, repository.GeneralCourseID).Scan(&ownerID))

	// A published material under the general course.
	matID := testutil.NewUserID()
	_, err := db.ExecContext(ctx,
		`INSERT INTO course_materials (id, course_id, title, content_type, is_published, created_by)
		 VALUES (?, ?, 'Umum 1', 'text', 1, ?)`, matID, repository.GeneralCourseID, ownerID)
	require.NoError(t, err)

	// A brand-new student who is NOT enrolled in anything.
	student := &repository.User{
		ID: testutil.NewUserID(), Username: "gen_stu", Email: "gen_stu@test.com",
		PasswordHash: "x", Role: "student", FullName: "Gen Student", IsActive: true,
		Kelas: "GEN-X", CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, userRepo.Create(ctx, student))

	// They complete the general material.
	require.NoError(t, compRepo.Upsert(ctx, &repository.Completion{
		ID: testutil.NewUserID(), MaterialID: matID, StudentID: student.ID,
		ReadPercent: 100, QuizPassed: true, CompletedAt: now,
	}))

	summaries, err := compRepo.ListByCourse(ctx, repository.GeneralCourseID)
	require.NoError(t, err)

	var found *repository.StudentSummary
	for _, s := range summaries {
		if s.StudentID == student.ID {
			found = s
		}
	}
	require.NotNil(t, found, "non-enrolled student must appear in general course summary")
	assert.Equal(t, 1, found.CompletedCount)
	assert.GreaterOrEqual(t, found.TotalMaterials, 1)
	// Demo seed students are also counted (proves it's all students, not enrollments).
	assert.Greater(t, len(summaries), 1)
}
