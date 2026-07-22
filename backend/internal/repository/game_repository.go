package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrGameNotFound = errors.New("game session not found")

type GameSession struct {
	ID               string
	AssignmentID     string
	HostID           string
	PIN              string
	Status           string // 'lobby' | 'question' | 'reveal' | 'ended'
	CurrentIndex     int
	QuestionCount    int
	DurationSeconds  int
	CurrentStartedAt sql.NullTime
	CreatedAt        time.Time
}

type GamePlayer struct {
	ID        string
	SessionID string
	UserID    string
	Nickname  string
	Avatar    string
	Score     int
	Streak    int
	JoinedAt  time.Time
}

type GameAnswer struct {
	ID            string
	SessionID     string
	PlayerID      string
	QuestionIndex int
	OptionIndex   int
	IsCorrect     bool
	Points        int
	ResponseMs    int
}

type GameRepository interface {
	CreateSession(ctx context.Context, s *GameSession) error
	GetSession(ctx context.Context, id string) (*GameSession, error)
	GetLiveSessionByPIN(ctx context.Context, pin string) (*GameSession, error)
	PINInUse(ctx context.Context, pin string) (bool, error)
	UpdateSessionState(ctx context.Context, id, status string, currentIndex int, startedAt sql.NullTime) error

	AddPlayer(ctx context.Context, p *GamePlayer) error
	GetPlayerByUser(ctx context.Context, sessionID, userID string) (*GamePlayer, error)
	ListPlayers(ctx context.Context, sessionID string) ([]*GamePlayer, error) // score desc

	// RecordAnswer inserts the answer and, only when it is newly inserted (the
	// student had not answered this question yet), applies the score delta and
	// new streak to the player — atomically. Returns inserted=false on a repeat.
	RecordAnswer(ctx context.Context, a *GameAnswer, scoreDelta, newStreak int) (inserted bool, err error)
	CountAnswers(ctx context.Context, sessionID string, questionIndex int) (int, error)
	AnswerDistribution(ctx context.Context, sessionID string, questionIndex, numOptions int) ([]int, error)
	GetPlayerAnswer(ctx context.Context, sessionID, playerID string, questionIndex int) (*GameAnswer, error)
	CountCorrect(ctx context.Context, sessionID, playerID string) (int, error)
}

type sqliteGameRepository struct{ db *sql.DB }

func NewGameRepository(db *sql.DB) GameRepository { return &sqliteGameRepository{db: db} }

func (r *sqliteGameRepository) CreateSession(ctx context.Context, s *GameSession) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO game_sessions (id, assignment_id, host_id, pin, status, current_index, question_count, duration_seconds)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.AssignmentID, s.HostID, s.PIN, s.Status, s.CurrentIndex, s.QuestionCount, s.DurationSeconds)
	if err != nil {
		return fmt.Errorf("create game session: %w", err)
	}
	return nil
}

func scanGameSession(row interface{ Scan(...any) error }) (*GameSession, error) {
	s := &GameSession{}
	if err := row.Scan(&s.ID, &s.AssignmentID, &s.HostID, &s.PIN, &s.Status, &s.CurrentIndex,
		&s.QuestionCount, &s.DurationSeconds, &s.CurrentStartedAt, &s.CreatedAt); err != nil {
		return nil, err
	}
	return s, nil
}

const gameSessionCols = `id, assignment_id, host_id, pin, status, current_index, question_count, duration_seconds, current_started_at, created_at`

func (r *sqliteGameRepository) GetSession(ctx context.Context, id string) (*GameSession, error) {
	s, err := scanGameSession(r.db.QueryRowContext(ctx, `SELECT `+gameSessionCols+` FROM game_sessions WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGameNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get game session: %w", err)
	}
	return s, nil
}

func (r *sqliteGameRepository) GetLiveSessionByPIN(ctx context.Context, pin string) (*GameSession, error) {
	s, err := scanGameSession(r.db.QueryRowContext(ctx,
		`SELECT `+gameSessionCols+` FROM game_sessions WHERE pin = ? AND status <> 'ended' ORDER BY created_at DESC LIMIT 1`, pin))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGameNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get game by pin: %w", err)
	}
	return s, nil
}

func (r *sqliteGameRepository) PINInUse(ctx context.Context, pin string) (bool, error) {
	var n int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM game_sessions WHERE pin = ? AND status <> 'ended'`, pin).Scan(&n); err != nil {
		return false, fmt.Errorf("pin in use: %w", err)
	}
	return n > 0, nil
}

func (r *sqliteGameRepository) UpdateSessionState(ctx context.Context, id, status string, currentIndex int, startedAt sql.NullTime) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE game_sessions SET status = ?, current_index = ?, current_started_at = ? WHERE id = ?`,
		status, currentIndex, startedAt, id)
	if err != nil {
		return fmt.Errorf("update game state: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrGameNotFound
	}
	return nil
}

func (r *sqliteGameRepository) AddPlayer(ctx context.Context, p *GamePlayer) error {
	// Re-joining keeps the existing row (and its score); only refresh nickname.
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO game_players (id, session_id, user_id, nickname, avatar)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(session_id, user_id) DO UPDATE SET nickname = excluded.nickname, avatar = excluded.avatar`,
		p.ID, p.SessionID, p.UserID, p.Nickname, p.Avatar)
	if err != nil {
		return fmt.Errorf("add game player: %w", err)
	}
	return nil
}

func (r *sqliteGameRepository) GetPlayerByUser(ctx context.Context, sessionID, userID string) (*GamePlayer, error) {
	p := &GamePlayer{}
	err := r.db.QueryRowContext(ctx,
		`SELECT id, session_id, user_id, nickname, avatar, score, streak, joined_at FROM game_players WHERE session_id = ? AND user_id = ?`,
		sessionID, userID).Scan(&p.ID, &p.SessionID, &p.UserID, &p.Nickname, &p.Avatar, &p.Score, &p.Streak, &p.JoinedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGameNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get player: %w", err)
	}
	return p, nil
}

func (r *sqliteGameRepository) ListPlayers(ctx context.Context, sessionID string) ([]*GamePlayer, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, session_id, user_id, nickname, avatar, score, streak, joined_at FROM game_players WHERE session_id = ? ORDER BY score DESC, joined_at ASC`,
		sessionID)
	if err != nil {
		return nil, fmt.Errorf("list players: %w", err)
	}
	defer rows.Close()
	var out []*GamePlayer
	for rows.Next() {
		p := &GamePlayer{}
		if err := rows.Scan(&p.ID, &p.SessionID, &p.UserID, &p.Nickname, &p.Avatar, &p.Score, &p.Streak, &p.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *sqliteGameRepository) RecordAnswer(ctx context.Context, a *GameAnswer, scoreDelta, newStreak int) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	correct := 0
	if a.IsCorrect {
		correct = 1
	}
	res, err := tx.ExecContext(ctx, `
		INSERT INTO game_answers (id, session_id, player_id, question_index, option_index, is_correct, points, response_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id, player_id, question_index) DO NOTHING`,
		a.ID, a.SessionID, a.PlayerID, a.QuestionIndex, a.OptionIndex, correct, a.Points, a.ResponseMs)
	if err != nil {
		return false, fmt.Errorf("insert answer: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return false, nil // already answered — no scoring
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE game_players SET score = score + ?, streak = ? WHERE id = ?`, scoreDelta, newStreak, a.PlayerID); err != nil {
		return false, fmt.Errorf("update player score: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit answer: %w", err)
	}
	return true, nil
}

func (r *sqliteGameRepository) CountAnswers(ctx context.Context, sessionID string, questionIndex int) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM game_answers WHERE session_id = ? AND question_index = ?`, sessionID, questionIndex).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count answers: %w", err)
	}
	return n, nil
}

func (r *sqliteGameRepository) AnswerDistribution(ctx context.Context, sessionID string, questionIndex, numOptions int) ([]int, error) {
	dist := make([]int, numOptions)
	rows, err := r.db.QueryContext(ctx,
		`SELECT option_index, COUNT(*) FROM game_answers WHERE session_id = ? AND question_index = ? GROUP BY option_index`,
		sessionID, questionIndex)
	if err != nil {
		return nil, fmt.Errorf("answer distribution: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var opt, cnt int
		if err := rows.Scan(&opt, &cnt); err != nil {
			return nil, err
		}
		if opt >= 0 && opt < numOptions {
			dist[opt] = cnt
		}
	}
	return dist, rows.Err()
}

func (r *sqliteGameRepository) GetPlayerAnswer(ctx context.Context, sessionID, playerID string, questionIndex int) (*GameAnswer, error) {
	a := &GameAnswer{}
	var correct int
	err := r.db.QueryRowContext(ctx,
		`SELECT id, session_id, player_id, question_index, option_index, is_correct, points, response_ms
		 FROM game_answers WHERE session_id = ? AND player_id = ? AND question_index = ?`,
		sessionID, playerID, questionIndex).Scan(&a.ID, &a.SessionID, &a.PlayerID, &a.QuestionIndex, &a.OptionIndex, &correct, &a.Points, &a.ResponseMs)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil // not answered yet
	}
	if err != nil {
		return nil, fmt.Errorf("get player answer: %w", err)
	}
	a.IsCorrect = correct == 1
	return a, nil
}

func (r *sqliteGameRepository) CountCorrect(ctx context.Context, sessionID, playerID string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM game_answers WHERE session_id = ? AND player_id = ? AND is_correct = 1`, sessionID, playerID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count correct: %w", err)
	}
	return n, nil
}
