-- +goose Up
CREATE TABLE essay_questions (
    id          TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    question    TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_eq_material ON essay_questions(material_id);

CREATE TABLE essay_comments (
    id                TEXT PRIMARY KEY,
    essay_question_id TEXT NOT NULL REFERENCES essay_questions(id) ON DELETE CASCADE,
    author_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ec_question ON essay_comments(essay_question_id);
CREATE INDEX idx_ec_author   ON essay_comments(author_id);

-- +goose Down
DROP INDEX IF EXISTS idx_ec_author;
DROP INDEX IF EXISTS idx_ec_question;
DROP TABLE IF EXISTS essay_comments;
DROP INDEX IF EXISTS idx_eq_material;
DROP TABLE IF EXISTS essay_questions;
