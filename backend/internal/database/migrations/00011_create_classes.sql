-- +goose Up
CREATE TABLE classes (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE course_classes (
    id        TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    class_id  TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    UNIQUE(course_id, class_id)
);
CREATE INDEX idx_course_classes_course ON course_classes(course_id);
CREATE INDEX idx_course_classes_class  ON course_classes(class_id);

-- Seed master kelas dari kelas siswa demo yang sudah ada (X-1, X-2, X-3, dst).
INSERT INTO classes (id, name)
SELECT lower(hex(randomblob(16))), kelas
FROM (SELECT DISTINCT kelas FROM users WHERE kelas <> '');

-- +goose Down
DROP TABLE IF EXISTS course_classes;
DROP TABLE IF EXISTS classes;
