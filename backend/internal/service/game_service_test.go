package service_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

// Full happy path of a live game plus scoring, correct-answer secrecy, streak
// bonus, idempotent answers, host-only control, and grade recording on end.
func TestGameService_LiveFlow(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	assignRepo := repository.NewAssignmentRepository(db)
	subRepo := repository.NewSubmissionRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	qRepo := repository.NewAssignmentQuestionRepository(db)
	gRepo := repository.NewAssignmentGroupRepository(db)
	gameRepo := repository.NewGameRepository(db)
	assignSvc := service.NewAssignmentService(assignRepo, subRepo, enrollRepo, courseRepo, qRepo, gRepo)
	gameSvc := service.NewGameService(gameRepo, qRepo, subRepo, assignRepo, userRepo)
	now := time.Now().UTC().Truncate(time.Second)

	mkStudent := func(s string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "g_" + s, Email: s + "@g.com", PasswordHash: "x", Role: "student", FullName: "S " + s, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := &repository.User{ID: testutil.NewUserID(), Username: "gt", Email: "gt@g.com", PasswordHash: "x", Role: "teacher", FullName: "Teacher", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))

	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, 'GM', 'G', ?)`, courseID, teacher.ID)
	require.NoError(t, err)

	a, err := assignSvc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Game Kuis", MaxScore: 100, Type: "pilihan_ganda"})
	require.NoError(t, err)
	// q0 correct=0, q1 correct=1
	require.NoError(t, qRepo.SetForAssignment(ctx, a.ID, []*repository.AssignmentQuestion{
		{Question: "Q0", Options: []string{"A", "B", "C", "D"}, CorrectIndex: 0},
		{Question: "Q1", Options: []string{"A", "B", "C", "D"}, CorrectIndex: 1},
	}))

	alice := mkStudent("alice")
	alice.PhotoURL = "https://lms.example/alice.png"
	require.NoError(t, userRepo.Update(ctx, alice)) // avatar snapshot source
	bob := mkStudent("bob")
	require.NoError(t, enrollRepo.Enroll(ctx, courseID, alice.ID, testutil.NewUserID()))
	require.NoError(t, enrollRepo.Enroll(ctx, courseID, bob.ID, testutil.NewUserID()))

	// ── Only teacher/admin can host ──
	_, err = gameSvc.CreateGame(ctx, alice.ID, "student", a.ID, 20)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	sess, err := gameSvc.CreateGame(ctx, teacher.ID, "teacher", a.ID, 20)
	require.NoError(t, err)
	assert.Len(t, sess.PIN, 6)
	assert.Equal(t, 2, sess.QuestionCount)

	// ── Join by PIN (wrong PIN rejected) ──
	_, err = gameSvc.JoinGame(ctx, alice.ID, "000000", "Alice")
	assert.ErrorIs(t, err, service.ErrNotFound)
	ja, err := gameSvc.JoinGame(ctx, alice.ID, sess.PIN, "Alice")
	require.NoError(t, err)
	assert.Equal(t, "Game Kuis", ja.AssignmentTitle)
	assert.Equal(t, "Teacher", ja.HostName)
	_, err = gameSvc.JoinGame(ctx, bob.ID, sess.PIN, "Bob")
	require.NoError(t, err)

	// ── Non-host cannot control ──
	assert.ErrorIs(t, gameSvc.StartQuestion(ctx, alice.ID, "student", sess.ID, 0), service.ErrPermissionDenied)

	// ── Question 0 ──
	require.NoError(t, gameSvc.StartQuestion(ctx, teacher.ID, "teacher", sess.ID, 0))
	// player sees the question but NOT the correct answer while active
	ps, err := gameSvc.GetGameState(ctx, alice.ID, "student", sess.ID)
	require.NoError(t, err)
	assert.True(t, ps.HasQuestion)
	assert.Equal(t, -1, ps.CorrectIndex, "correct answer hidden during question")

	accepted, err := gameSvc.SubmitGameAnswer(ctx, alice.ID, sess.ID, 0, 0) // correct
	require.NoError(t, err)
	assert.True(t, accepted)
	// answering twice is idempotent (no double score)
	accepted, err = gameSvc.SubmitGameAnswer(ctx, alice.ID, sess.ID, 0, 0)
	require.NoError(t, err)
	assert.False(t, accepted)

	accepted, err = gameSvc.SubmitGameAnswer(ctx, bob.ID, sess.ID, 0, 2) // wrong
	require.NoError(t, err)
	assert.True(t, accepted)

	aliceQ0, err := gameRepo.GetPlayerAnswer(ctx, sess.ID, ja.PlayerID, 0)
	require.NoError(t, err)
	require.NotNil(t, aliceQ0)
	assert.True(t, aliceQ0.IsCorrect)
	assert.Greater(t, aliceQ0.Points, 0)

	require.NoError(t, gameSvc.RevealQuestion(ctx, teacher.ID, "teacher", sess.ID))
	// host sees correct index + distribution now
	hs, err := gameSvc.GetGameState(ctx, teacher.ID, "teacher", sess.ID)
	require.NoError(t, err)
	assert.True(t, hs.IsHost)
	assert.Equal(t, 0, hs.CorrectIndex)
	assert.Equal(t, 2, hs.AnsweredCount)
	// leaderboard: Alice (correct) ahead of Bob (wrong)
	require.GreaterOrEqual(t, len(hs.Players), 2)
	assert.Equal(t, ja.PlayerID, hs.Players[0].ID)
	assert.Equal(t, "https://lms.example/alice.png", hs.Players[0].Avatar, "avatar snapshot from LMS photo")

	// ── Question 1 (streak bonus for Alice) ──
	require.NoError(t, gameSvc.StartQuestion(ctx, teacher.ID, "teacher", sess.ID, 1))
	_, err = gameSvc.SubmitGameAnswer(ctx, alice.ID, sess.ID, 1, 1) // correct, streak=1
	require.NoError(t, err)
	_, err = gameSvc.SubmitGameAnswer(ctx, bob.ID, sess.ID, 1, 1) // correct
	require.NoError(t, err)
	aliceQ1, err := gameRepo.GetPlayerAnswer(ctx, sess.ID, ja.PlayerID, 1)
	require.NoError(t, err)
	assert.Greater(t, aliceQ1.Points, aliceQ0.Points, "streak bonus makes the 2nd correct worth more")

	require.NoError(t, gameSvc.RevealQuestion(ctx, teacher.ID, "teacher", sess.ID))

	// ── End game records grades (score = 100*correct/total) ──
	require.NoError(t, gameSvc.EndGame(ctx, teacher.ID, "teacher", sess.ID))
	assert.Equal(t, 100, quizScore(t, db, a.ID, alice.ID), "Alice 2/2 correct")
	assert.Equal(t, 50, quizScore(t, db, a.ID, bob.ID), "Bob 1/2 correct")

	// A joined game that has ended can no longer be found by PIN.
	_, err = gameSvc.JoinGame(ctx, mkStudent("late").ID, sess.PIN, "Late")
	assert.ErrorIs(t, err, service.ErrNotFound)
}

func quizScore(t *testing.T, db *sql.DB, assignmentID, studentID string) int {
	t.Helper()
	var score int
	err := db.QueryRowContext(context.Background(),
		`SELECT score FROM assignment_submissions WHERE assignment_id = ? AND student_id = ? ORDER BY submitted_at DESC LIMIT 1`,
		assignmentID, studentID).Scan(&score)
	require.NoError(t, err)
	return score
}
