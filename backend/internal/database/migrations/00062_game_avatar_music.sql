-- +goose Up
-- Snapshot of each player's LMS profile photo at join time (shown in the game
-- lobby / leaderboard / podium; empty falls back to initials).
ALTER TABLE game_players ADD COLUMN avatar TEXT NOT NULL DEFAULT '';

-- Optional custom game soundtrack (uploaded audio), stored once school-wide and
-- streamed at /game-music. Empty falls back to the synthesized music.
ALTER TABLE school_settings ADD COLUMN game_music_data TEXT NOT NULL DEFAULT ''; -- audio data URL
ALTER TABLE school_settings ADD COLUMN game_music_name TEXT NOT NULL DEFAULT ''; -- display name

-- +goose Down
ALTER TABLE school_settings DROP COLUMN game_music_name;
ALTER TABLE school_settings DROP COLUMN game_music_data;
ALTER TABLE game_players DROP COLUMN avatar;
