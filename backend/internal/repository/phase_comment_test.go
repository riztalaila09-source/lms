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

// Verifies phase comments are scoped by (material_id, block_id), joined with the
// author's name/role, ordered by time, and removed when the material is deleted.
func TestPhaseComments_ScopedByBlockAndCascade(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	essayRepo := repository.NewEssayRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	mkUser := func(suffix, role, name string) *repository.User {
		u := &repository.User{
			ID: testutil.NewUserID(), Username: "u_" + suffix, Email: suffix + "@test.com",
			PasswordHash: "x", Role: role, FullName: name, IsActive: true,
			CreatedAt: now, UpdatedAt: now,
		}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mkUser("teacher", "teacher", "Pak Guru")
	student := mkUser("student", "student", "Siswa Satu")

	// One course + one material.
	courseID, matID := testutil.NewUserID(), testutil.NewUserID()
	_, err := db.ExecContext(ctx,
		`INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`,
		courseID, "C1", "Course 1", teacher.ID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO course_materials (id, course_id, title, content_type, is_published, created_by)
		 VALUES (?, ?, ?, 'text', 1, ?)`,
		matID, courseID, "Mat", teacher.ID)
	require.NoError(t, err)

	blockA, blockB := "blk-tanyajawab", "blk-diskusi"

	mk := func(author, block, content string, dt time.Time) {
		require.NoError(t, essayRepo.CreatePhaseComment(ctx, &repository.PhaseComment{
			ID: testutil.NewUserID(), MaterialID: matID, BlockID: block,
			AuthorID: author, Content: content, CreatedAt: dt,
		}))
	}
	mk(student.ID, blockA, "pertanyaan siswa", now)
	mk(teacher.ID, blockA, "jawaban guru", now.Add(time.Minute))
	mk(student.ID, blockB, "komentar blok lain", now)

	// Block A holds two comments, ordered by time, with author name/role joined.
	a, err := essayRepo.ListPhaseComments(ctx, matID, blockA)
	require.NoError(t, err)
	require.Len(t, a, 2)
	assert.Equal(t, "pertanyaan siswa", a[0].Content)
	assert.Equal(t, "Siswa Satu", a[0].AuthorName)
	assert.Equal(t, "student", a[0].AuthorRole)
	assert.Equal(t, "jawaban guru", a[1].Content)
	assert.Equal(t, "teacher", a[1].AuthorRole)

	// Block B is isolated.
	b, err := essayRepo.ListPhaseComments(ctx, matID, blockB)
	require.NoError(t, err)
	require.Len(t, b, 1)

	// Deleting the material cascades to its phase comments.
	_, err = db.ExecContext(ctx, `DELETE FROM course_materials WHERE id = ?`, matID)
	require.NoError(t, err)
	after, err := essayRepo.ListPhaseComments(ctx, matID, blockA)
	require.NoError(t, err)
	assert.Empty(t, after)
}
