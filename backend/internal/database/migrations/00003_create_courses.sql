-- +goose Up
CREATE TABLE courses (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    teacher_id  TEXT NOT NULL REFERENCES users(id),
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_courses_teacher ON courses(teacher_id);

-- +goose Down
DROP INDEX IF EXISTS idx_courses_teacher;
DROP TABLE IF EXISTS courses;
