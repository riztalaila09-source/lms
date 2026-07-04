-- +goose Up
CREATE TABLE course_enrollments (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(course_id, student_id)
);

CREATE INDEX idx_enrollments_course  ON course_enrollments(course_id);
CREATE INDEX idx_enrollments_student ON course_enrollments(student_id);

-- +goose Down
DROP INDEX IF EXISTS idx_enrollments_student;
DROP INDEX IF EXISTS idx_enrollments_course;
DROP TABLE IF EXISTS course_enrollments;
