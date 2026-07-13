-- +goose Up
-- Jadwal mingguan mapel (course = mapel).
CREATE TABLE course_schedules (
    id           TEXT PRIMARY KEY,
    course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    day_of_week  INTEGER NOT NULL,        -- 1=Senin .. 7=Minggu
    jam_ke_mulai INTEGER NOT NULL,
    jam_ke_akhir INTEGER NOT NULL,
    kelas        TEXT NOT NULL DEFAULT '',
    ruang        TEXT NOT NULL DEFAULT '',
    created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cs_course ON course_schedules(course_id);

-- Kalender: rencana pembelajaran materi per tanggal (siswa boleh lihat).
CREATE TABLE course_lesson_plans (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    tanggal     TEXT NOT NULL,            -- YYYY-MM-DD
    title       TEXT NOT NULL,
    material_id TEXT REFERENCES course_materials(id) ON DELETE SET NULL,
    note        TEXT NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_clp_course_date ON course_lesson_plans(course_id, tanggal);

-- Keaktifan/apersepsi siswa per (mapel, siswa, tanggal pertemuan).
CREATE TABLE course_activities (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tanggal    TEXT NOT NULL,             -- YYYY-MM-DD
    active     INTEGER NOT NULL DEFAULT 0,
    score      INTEGER NOT NULL DEFAULT 0, -- 1..10, 0=belum dinilai
    note       TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(course_id, student_id, tanggal)
);
CREATE INDEX idx_ca_course_date ON course_activities(course_id, tanggal);

-- +goose Down
DROP INDEX IF EXISTS idx_ca_course_date;
DROP TABLE IF EXISTS course_activities;
DROP INDEX IF EXISTS idx_clp_course_date;
DROP TABLE IF EXISTS course_lesson_plans;
DROP INDEX IF EXISTS idx_cs_course;
DROP TABLE IF EXISTS course_schedules;
