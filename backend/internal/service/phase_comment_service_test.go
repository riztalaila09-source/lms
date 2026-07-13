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

// Exercises the real phase-comment path: any role may post, content/block must
// be non-empty, the material must exist, and the author name/role is joined back.
func TestEssayService_PhaseComments(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	matRepo := repository.NewMaterialRepository(db)
	essayRepo := repository.NewEssayRepository(db)
	svc := service.NewEssayService(essayRepo, matRepo)
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

	const block = "blk-tanyajawab"

	t.Run("student comments, teacher replies (threaded); author is joined", func(t *testing.T) {
		c1, err := svc.AddPhaseComment(ctx, student.ID, "student", matID, block, "", "pertanyaan?")
		require.NoError(t, err)
		assert.Equal(t, "Siswa Satu", c1.AuthorName)
		assert.Equal(t, "student", c1.AuthorRole)
		assert.Empty(t, c1.ParentID)

		reply, err := svc.AddPhaseComment(ctx, teacher.ID, "teacher", matID, block, c1.ID, "jawaban guru")
		require.NoError(t, err)
		assert.Equal(t, c1.ID, reply.ParentID)

		list, err := svc.ListPhaseComments(ctx, matID, block)
		require.NoError(t, err)
		require.Len(t, list, 2)
		assert.Equal(t, "pertanyaan?", list[0].Content)
		assert.Equal(t, "teacher", list[1].AuthorRole)
		assert.Equal(t, c1.ID, list[1].ParentID)
	})

	t.Run("empty content or block is rejected", func(t *testing.T) {
		_, err := svc.AddPhaseComment(ctx, student.ID, "student", matID, block, "", "   ")
		assert.ErrorIs(t, err, service.ErrEmptyComment)
		_, err = svc.AddPhaseComment(ctx, student.ID, "student", matID, "", "", "isi")
		assert.ErrorIs(t, err, service.ErrEmptyComment)
	})

	t.Run("missing material is rejected", func(t *testing.T) {
		_, err := svc.AddPhaseComment(ctx, student.ID, "student", "no-such-material", block, "", "isi")
		assert.ErrorIs(t, err, service.ErrMaterialNotFound)
	})
}
