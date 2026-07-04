-- +goose Up
CREATE TABLE assignments (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    deadline    DATETIME,
    max_score   INTEGER NOT NULL DEFAULT 100,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_by  TEXT NOT NULL REFERENCES users(id),
    created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assignments_course ON assignments(course_id);

CREATE TABLE assignment_submissions (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content       TEXT NOT NULL DEFAULT '',
    file_url      TEXT NOT NULL DEFAULT '',
    submitted_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    score         INTEGER,
    feedback      TEXT NOT NULL DEFAULT '',
    graded_at     DATETIME,
    UNIQUE(assignment_id, student_id)
);
CREATE INDEX idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX idx_submissions_student    ON assignment_submissions(student_id);

-- +goose Down
DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS assignments;
