package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

// GameService runs the live Kahoot-style quiz game over an existing
// pilihan_ganda assignment. The host (teacher) drives the flow; students join
// with a PIN and answer the same question at the same time. Clients poll
// GetGameState. Scoring rewards speed and answer streaks.
type GameService struct {
	repo           repository.GameRepository
	questionRepo   repository.AssignmentQuestionRepository
	submissionRepo repository.SubmissionRepository
	assignmentRepo repository.AssignmentRepository
	userRepo       repository.UserRepository
}

func NewGameService(
	repo repository.GameRepository,
	questionRepo repository.AssignmentQuestionRepository,
	submissionRepo repository.SubmissionRepository,
	assignmentRepo repository.AssignmentRepository,
	userRepo repository.UserRepository,
) *GameService {
	return &GameService{repo: repo, questionRepo: questionRepo, submissionRepo: submissionRepo, assignmentRepo: assignmentRepo, userRepo: userRepo}
}

const (
	gameDefaultDuration = 20
	gameMinDuration     = 5
	gameMaxDuration     = 120
	gameBasePoints      = 1000 // max points for an instant correct answer
	gameStreakBonus     = 100  // per consecutive-correct step, capped
	gameMaxStreakBonus  = 5
)

func (s *GameService) hostAllowed(sess *repository.GameSession, callerID, role string) bool {
	return callerID == sess.HostID || role == "admin"
}

// CreateGame starts a live game (lobby) for a pilihan_ganda assignment.
func (s *GameService) CreateGame(ctx context.Context, hostID, role, assignmentID string, durationSeconds int) (*repository.GameSession, error) {
	if role != "teacher" && role != "admin" {
		return nil, ErrPermissionDenied
	}
	a, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get assignment: %w", err)
	}
	if a.Type != "pilihan_ganda" {
		return nil, fmt.Errorf("%w: game hanya untuk kuis pilihan ganda", ErrInvalidArgument)
	}
	qs, err := s.questionRepo.ListByAssignment(ctx, assignmentID)
	if err != nil {
		return nil, err
	}
	if len(qs) == 0 {
		return nil, fmt.Errorf("%w: kuis belum punya soal", ErrInvalidArgument)
	}
	dur := durationSeconds
	if dur <= 0 {
		dur = gameDefaultDuration
	}
	if dur < gameMinDuration {
		dur = gameMinDuration
	}
	if dur > gameMaxDuration {
		dur = gameMaxDuration
	}
	pin, err := s.uniquePIN(ctx)
	if err != nil {
		return nil, err
	}
	sess := &repository.GameSession{
		ID: uuid.New().String(), AssignmentID: assignmentID, HostID: hostID, PIN: pin,
		Status: "lobby", CurrentIndex: -1, QuestionCount: len(qs), DurationSeconds: dur,
	}
	if err := s.repo.CreateSession(ctx, sess); err != nil {
		return nil, err
	}
	return sess, nil
}

func (s *GameService) uniquePIN(ctx context.Context) (string, error) {
	for i := 0; i < 20; i++ {
		pin := fmt.Sprintf("%06d", rand.Intn(1000000))
		used, err := s.repo.PINInUse(ctx, pin)
		if err != nil {
			return "", err
		}
		if !used {
			return pin, nil
		}
	}
	return "", fmt.Errorf("gagal membuat PIN unik")
}

type JoinResult struct {
	Session         *repository.GameSession
	PlayerID        string
	AssignmentTitle string
	HostName        string
}

// JoinGame adds the caller as a player of the game with the given PIN.
func (s *GameService) JoinGame(ctx context.Context, userID, pin, nickname string) (*JoinResult, error) {
	sess, err := s.repo.GetLiveSessionByPIN(ctx, pin)
	if err != nil {
		if errors.Is(err, repository.ErrGameNotFound) {
			return nil, fmt.Errorf("%w: PIN tidak ditemukan", ErrNotFound)
		}
		return nil, err
	}
	if nickname == "" {
		nickname = "Pemain"
	}
	// Snapshot the player's LMS profile photo (shown in lobby / leaderboard).
	avatar := ""
	if u, err := s.userRepo.GetByID(ctx, userID); err == nil {
		avatar = u.PhotoURL
		if nickname == "Pemain" && u.FullName != "" {
			nickname = u.FullName
		}
	}
	player := &repository.GamePlayer{ID: uuid.New().String(), SessionID: sess.ID, UserID: userID, Nickname: nickname, Avatar: avatar}
	if err := s.repo.AddPlayer(ctx, player); err != nil {
		return nil, err
	}
	// Fetch the row back so a re-join returns the existing player id.
	saved, err := s.repo.GetPlayerByUser(ctx, sess.ID, userID)
	if err != nil {
		return nil, err
	}
	res := &JoinResult{Session: sess, PlayerID: saved.ID}
	if a, err := s.assignmentRepo.GetByID(ctx, sess.AssignmentID); err == nil {
		res.AssignmentTitle = a.Title
	}
	if u, err := s.userRepo.GetByID(ctx, sess.HostID); err == nil {
		res.HostName = u.FullName
	}
	return res, nil
}

func (s *GameService) StartQuestion(ctx context.Context, callerID, role, sessionID string, index int) error {
	sess, err := s.getSession(ctx, sessionID)
	if err != nil {
		return err
	}
	if !s.hostAllowed(sess, callerID, role) {
		return ErrPermissionDenied
	}
	if index < 0 || index >= sess.QuestionCount {
		return fmt.Errorf("%w: indeks soal di luar jangkauan", ErrInvalidArgument)
	}
	started := sql.NullTime{Time: time.Now().UTC(), Valid: true}
	return s.repo.UpdateSessionState(ctx, sess.ID, "question", index, started)
}

func (s *GameService) RevealQuestion(ctx context.Context, callerID, role, sessionID string) error {
	sess, err := s.getSession(ctx, sessionID)
	if err != nil {
		return err
	}
	if !s.hostAllowed(sess, callerID, role) {
		return ErrPermissionDenied
	}
	return s.repo.UpdateSessionState(ctx, sess.ID, "reveal", sess.CurrentIndex, sess.CurrentStartedAt)
}

// EndGame closes the session and records each player's grade into the
// assignment (score = 100 * correct / total) so it appears on the Nilai page.
func (s *GameService) EndGame(ctx context.Context, callerID, role, sessionID string) error {
	sess, err := s.getSession(ctx, sessionID)
	if err != nil {
		return err
	}
	if !s.hostAllowed(sess, callerID, role) {
		return ErrPermissionDenied
	}
	if err := s.repo.UpdateSessionState(ctx, sess.ID, "ended", sess.CurrentIndex, sql.NullTime{}); err != nil {
		return err
	}
	if sess.QuestionCount == 0 {
		return nil
	}
	players, err := s.repo.ListPlayers(ctx, sess.ID)
	if err != nil {
		return err
	}
	for _, p := range players {
		correct, err := s.repo.CountCorrect(ctx, sess.ID, p.ID)
		if err != nil {
			continue
		}
		score := (correct*100 + sess.QuestionCount/2) / sess.QuestionCount
		// Best-effort: a student not enrolled may fail; don't abort the whole end.
		_ = s.submissionRepo.CreateQuizSubmission(ctx, uuid.New().String(), sess.AssignmentID, p.UserID, score, 0)
	}
	return nil
}

// SubmitGameAnswer records a player's answer to the active question and awards
// speed + streak points. Returns accepted=false if the player already answered.
func (s *GameService) SubmitGameAnswer(ctx context.Context, userID, sessionID string, questionIndex, optionIndex int) (bool, error) {
	sess, err := s.getSession(ctx, sessionID)
	if err != nil {
		return false, err
	}
	if sess.Status != "question" || questionIndex != sess.CurrentIndex {
		return false, fmt.Errorf("%w: soal tidak aktif", ErrInvalidArgument)
	}
	player, err := s.repo.GetPlayerByUser(ctx, sess.ID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrGameNotFound) {
			return false, fmt.Errorf("%w: belum bergabung ke game", ErrPermissionDenied)
		}
		return false, err
	}
	qs, err := s.questionRepo.ListByAssignment(ctx, sess.AssignmentID)
	if err != nil {
		return false, err
	}
	if questionIndex >= len(qs) {
		return false, fmt.Errorf("%w: soal tidak ditemukan", ErrInvalidArgument)
	}
	q := qs[questionIndex]
	correct := optionIndex == q.CorrectIndex

	durMs := sess.DurationSeconds * 1000
	elapsedMs := 0
	if sess.CurrentStartedAt.Valid {
		elapsedMs = int(time.Now().UTC().Sub(sess.CurrentStartedAt.Time).Milliseconds())
	}
	if elapsedMs < 0 {
		elapsedMs = 0
	}
	if durMs > 0 && elapsedMs > durMs {
		elapsedMs = durMs
	}
	points, newStreak := 0, 0
	if correct {
		base := gameBasePoints
		if durMs > 0 {
			base = gameBasePoints - (gameBasePoints/2)*elapsedMs/durMs // 1000 → 500 across the window
		}
		bonusSteps := player.Streak
		if bonusSteps > gameMaxStreakBonus {
			bonusSteps = gameMaxStreakBonus
		}
		points = base + bonusSteps*gameStreakBonus
		newStreak = player.Streak + 1
	}
	ans := &repository.GameAnswer{
		ID: uuid.New().String(), SessionID: sess.ID, PlayerID: player.ID,
		QuestionIndex: questionIndex, OptionIndex: optionIndex, IsCorrect: correct,
		Points: points, ResponseMs: elapsedMs,
	}
	inserted, err := s.repo.RecordAnswer(ctx, ans, points, newStreak)
	if err != nil {
		return false, err
	}
	return inserted, nil
}

// GameStateResult is a role-aware snapshot the handler maps to the proto.
type GameStateResult struct {
	Session         *repository.GameSession
	IsHost          bool
	ServerTime      time.Time
	Players         []*repository.GamePlayer // sorted by score desc
	AssignmentTitle string
	HostName        string

	HasQuestion  bool
	Question     string
	Options      []string
	Image        string
	CorrectIndex int // -1 unless reveal/ended

	// player view
	MyAnswered    bool
	MyOptionIndex int
	MyIsCorrect   bool
	MyPoints      int
	MyStreak      int
	MyTotalScore  int
	MyRank        int

	// host view (reveal)
	AnswerDistribution []int
	AnsweredCount      int
}

func (s *GameService) GetGameState(ctx context.Context, callerID, role, sessionID string) (*GameStateResult, error) {
	sess, err := s.getSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	players, err := s.repo.ListPlayers(ctx, sess.ID)
	if err != nil {
		return nil, err
	}
	res := &GameStateResult{
		Session: sess, IsHost: s.hostAllowed(sess, callerID, role), ServerTime: time.Now().UTC(),
		Players: players, CorrectIndex: -1, MyOptionIndex: -1,
	}
	if a, err := s.assignmentRepo.GetByID(ctx, sess.AssignmentID); err == nil {
		res.AssignmentTitle = a.Title
	}
	if u, err := s.userRepo.GetByID(ctx, sess.HostID); err == nil {
		res.HostName = u.FullName
	}

	revealing := sess.Status == "reveal" || sess.Status == "ended"
	if (sess.Status == "question" || revealing) && sess.CurrentIndex >= 0 {
		qs, err := s.questionRepo.ListByAssignment(ctx, sess.AssignmentID)
		if err != nil {
			return nil, err
		}
		if sess.CurrentIndex < len(qs) {
			q := qs[sess.CurrentIndex]
			res.HasQuestion = true
			res.Question = q.Question
			res.Options = q.Options
			res.Image = q.Image
			if revealing {
				res.CorrectIndex = q.CorrectIndex
			}
			if res.IsHost && revealing {
				res.AnswerDistribution, _ = s.repo.AnswerDistribution(ctx, sess.ID, sess.CurrentIndex, len(q.Options))
				res.AnsweredCount, _ = s.repo.CountAnswers(ctx, sess.ID, sess.CurrentIndex)
			}
		}
	}

	// Player self view (rank + own answer for the active question).
	if !res.IsHost && sess.CurrentIndex >= 0 && (sess.Status == "question" || revealing) {
		if me, err := s.repo.GetPlayerByUser(ctx, sess.ID, callerID); err == nil {
			res.MyTotalScore = me.Score
			res.MyStreak = me.Streak
			for i, p := range players {
				if p.ID == me.ID {
					res.MyRank = i + 1
					break
				}
			}
			if a, err := s.repo.GetPlayerAnswer(ctx, sess.ID, me.ID, sess.CurrentIndex); err == nil && a != nil {
				res.MyAnswered = true
				res.MyOptionIndex = a.OptionIndex
				if revealing {
					res.MyIsCorrect = a.IsCorrect
					res.MyPoints = a.Points
				}
			}
		}
	}
	return res, nil
}

func (s *GameService) getSession(ctx context.Context, id string) (*repository.GameSession, error) {
	sess, err := s.repo.GetSession(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrGameNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return sess, nil
}
