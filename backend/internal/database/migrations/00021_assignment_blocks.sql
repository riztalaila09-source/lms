-- +goose Up
-- Students a teacher has blocked from submitting a specific assignment.
CREATE TABLE assignment_blocks (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(assignment_id, student_id)
);
CREATE INDEX idx_ab_assignment ON assignment_blocks(assignment_id);

-- +goose Down
DROP INDEX IF EXISTS idx_ab_assignment;
DROP TABLE IF EXISTS assignment_blocks;
