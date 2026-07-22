-- +goose Up
-- Live multiplayer quiz game (Kahoot-style) played over an existing
-- pilihan_ganda assignment. Sessions are host-driven; students join by PIN.
CREATE TABLE game_sessions (
    id                 TEXT PRIMARY KEY,
    assignment_id      TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    host_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pin                TEXT NOT NULL,                 -- 6-digit join code
    status             TEXT NOT NULL DEFAULT 'lobby', -- 'lobby'|'question'|'reveal'|'ended'
    current_index      INTEGER NOT NULL DEFAULT -1,
    question_count     INTEGER NOT NULL DEFAULT 0,
    duration_seconds   INTEGER NOT NULL DEFAULT 20,
    current_started_at DATETIME,                      -- when the active question started
    created_at         DATETIME NOT NULL DEFAULT (datetime('now'))
);
-- Only one live (non-ended) game may hold a given PIN at a time.
CREATE UNIQUE INDEX idx_game_sessions_pin_live ON game_sessions(pin) WHERE status <> 'ended';

CREATE TABLE game_players (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname   TEXT NOT NULL DEFAULT '',
    score      INTEGER NOT NULL DEFAULT 0,
    streak     INTEGER NOT NULL DEFAULT 0,
    joined_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, user_id)
);
CREATE INDEX idx_game_players_session ON game_players(session_id);

CREATE TABLE game_answers (
    id             TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_id      TEXT NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
    question_index INTEGER NOT NULL,
    option_index   INTEGER NOT NULL,
    is_correct     INTEGER NOT NULL DEFAULT 0,
    points         INTEGER NOT NULL DEFAULT 0,
    response_ms    INTEGER NOT NULL DEFAULT 0,
    answered_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, player_id, question_index)
);

-- +goose Down
DROP TABLE IF EXISTS game_answers;
DROP TABLE IF EXISTS game_players;
DROP TABLE IF EXISTS game_sessions;
