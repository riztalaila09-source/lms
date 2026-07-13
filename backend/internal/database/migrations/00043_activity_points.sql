-- +goose Up
-- Keaktifan siswa jadi POIN KUMULATIF: satu siswa bisa dinilai berkali-kali,
-- tiap penilaian = satu baris poin (1..10). Menggantikan course_activities
-- (yang bersifat 1 nilai per tanggal). Belum ada data produksi.
DROP INDEX IF EXISTS idx_ca_course_date;
DROP TABLE IF EXISTS course_activities;

CREATE TABLE course_activity_points (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tanggal    TEXT NOT NULL,             -- YYYY-MM-DD
    points     INTEGER NOT NULL,          -- 1..10
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cap_course      ON course_activity_points(course_id);
CREATE INDEX idx_cap_course_date ON course_activity_points(course_id, tanggal);

-- +goose Down
DROP INDEX IF EXISTS idx_cap_course_date;
DROP INDEX IF EXISTS idx_cap_course;
DROP TABLE IF EXISTS course_activity_points;

CREATE TABLE course_activities (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tanggal    TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 0,
    score      INTEGER NOT NULL DEFAULT 0,
    note       TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(course_id, student_id, tanggal)
);
CREATE INDEX idx_ca_course_date ON course_activities(course_id, tanggal);
