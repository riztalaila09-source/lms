package handler_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	materialv1 "lms/backend/gen/material/v1"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func phaseClaims(userID, role string) context.Context {
	return context.WithValue(context.Background(), middleware.TestContextKey(), &service.Claims{UserID: userID, Role: role})
}

func TestMaterialHandler_PhaseComments(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	essaySvc := service.NewEssayService(repository.NewEssayRepository(db), repository.NewMaterialRepository(db))
	// materialSvc/completionSvc unused by the phase-comment RPCs under test.
	h := handler.NewMaterialHandler(nil, nil, essaySvc)
	now := time.Now().UTC().Truncate(time.Second)

	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "pc_" + name, Email: name + "@pc.com", PasswordHash: "x",
			Role: role, FullName: name, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher")
	student := mk("Siswa", "student")

	courseID, matID := testutil.NewUserID(), testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`,
		courseID, "C1", "Course 1", teacher.ID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO course_materials (id, course_id, title, content_type, is_published, created_by)
		 VALUES (?, ?, ?, 'text', 1, ?)`, matID, courseID, "Mat", teacher.ID)
	require.NoError(t, err)

	const block = "blk-diskusi"

	t.Run("add uses author from claims", func(t *testing.T) {
		res, err := h.AddPhaseComment(phaseClaims(student.ID, "student"),
			connect.NewRequest(&materialv1.AddPhaseCommentRequest{MaterialId: matID, BlockId: block, Content: "halo"}))
		require.NoError(t, err)
		assert.Equal(t, student.ID, res.Msg.AuthorId)
		assert.Equal(t, "Siswa", res.Msg.AuthorName)
		assert.Equal(t, "student", res.Msg.AuthorRole)
	})

	t.Run("no claims → unauthenticated", func(t *testing.T) {
		_, err := h.AddPhaseComment(context.Background(),
			connect.NewRequest(&materialv1.AddPhaseCommentRequest{MaterialId: matID, BlockId: block, Content: "x"}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
	})

	t.Run("empty content → invalid argument", func(t *testing.T) {
		_, err := h.AddPhaseComment(phaseClaims(student.ID, "student"),
			connect.NewRequest(&materialv1.AddPhaseCommentRequest{MaterialId: matID, BlockId: block, Content: "  "}))
		require.Error(t, err)
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("teacher reply is threaded under the student comment", func(t *testing.T) {
		before, err := h.ListPhaseComments(phaseClaims(student.ID, "student"),
			connect.NewRequest(&materialv1.ListPhaseCommentsRequest{MaterialId: matID, BlockId: block}))
		require.NoError(t, err)
		require.NotEmpty(t, before.Msg.Comments)
		parentID := before.Msg.Comments[0].Id // the student's "halo" comment

		_, err = h.AddPhaseComment(phaseClaims(teacher.ID, "teacher"),
			connect.NewRequest(&materialv1.AddPhaseCommentRequest{MaterialId: matID, BlockId: block, Content: "balasan", ParentId: parentID}))
		require.NoError(t, err)

		res, err := h.ListPhaseComments(phaseClaims(student.ID, "student"),
			connect.NewRequest(&materialv1.ListPhaseCommentsRequest{MaterialId: matID, BlockId: block}))
		require.NoError(t, err)
		require.Len(t, res.Msg.Comments, 2)
		assert.Equal(t, "halo", res.Msg.Comments[0].Content)
		assert.Empty(t, res.Msg.Comments[0].ParentId)
		assert.Equal(t, "balasan", res.Msg.Comments[1].Content)
		assert.Equal(t, parentID, res.Msg.Comments[1].ParentId)
	})
}
