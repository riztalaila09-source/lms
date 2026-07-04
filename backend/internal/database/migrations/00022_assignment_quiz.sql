-- +goose Up
-- Assignment type: 'uraian' (free text, current) or 'pilihan_ganda' (MCQ quiz).
ALTER TABLE assignments ADD COLUMN type TEXT NOT NULL DEFAULT 'uraian';
-- Seconds a student spent doing an MCQ quiz (for the teacher's grading view).
ALTER TABLE assignment_submissions ADD COLUMN time_taken_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE assignment_questions (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    question      TEXT NOT NULL,
    options_json  TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL DEFAULT 0,
    order_index   INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_aq_assignment ON assignment_questions(assignment_id);

-- +goose Down
DROP INDEX IF EXISTS idx_aq_assignment;
DROP TABLE IF EXISTS assignment_questions;
