-- +goose Up
-- Attendance sessions (per class/subject/time slot) for a moving-class school.
-- A session shows a 60-second barcode (QR token + short code) that students scan
-- or type to mark themselves present.
CREATE TABLE attendance_sessions (
    id               TEXT PRIMARY KEY,
    created_by       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id        TEXT REFERENCES courses(id) ON DELETE SET NULL,
    mapel            TEXT NOT NULL DEFAULT '',   -- subject name snapshot
    kelas            TEXT NOT NULL DEFAULT '',   -- free text (class / room, e.g. "Lab 1")
    tanggal          TEXT NOT NULL,              -- 'YYYY-MM-DD'
    jam_ke           INTEGER NOT NULL DEFAULT 0, -- preset hour 1..10, 0 = manual
    start_time       TEXT NOT NULL DEFAULT '',   -- 'HH:MM'
    end_time         TEXT NOT NULL DEFAULT '',   -- 'HH:MM'
    token            TEXT NOT NULL DEFAULT '',   -- current QR token (rotates every 60s)
    token_code       TEXT NOT NULL DEFAULT '',   -- current short code for manual entry
    token_expires_at DATETIME,                   -- current token expiry
    created_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attendance_sessions_teacher ON attendance_sessions(created_by, tanggal);
CREATE INDEX idx_attendance_sessions_token   ON attendance_sessions(token);

CREATE TABLE attendance_records (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'hadir',   -- 'hadir' | 'sakit' | 'izin' | 'alpa'
    note       TEXT NOT NULL DEFAULT '',
    marked_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, student_id)
);
CREATE INDEX idx_attendance_records_student ON attendance_records(student_id);

-- +goose Down
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS attendance_sessions;
