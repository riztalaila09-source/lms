-- +goose Up
-- Internship / PKL partner directory for SMK students.
CREATE TABLE pkl_partners (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    alamat          TEXT NOT NULL DEFAULT '',
    deskripsi       TEXT NOT NULL DEFAULT '',
    maps_url        TEXT NOT NULL DEFAULT '',
    lat             REAL NOT NULL DEFAULT 0,
    lng             REAL NOT NULL DEFAULT 0,
    kontak_wa       TEXT NOT NULL DEFAULT '',
    bidang_usaha    TEXT NOT NULL DEFAULT '',   -- newline-separated points
    job_requirement TEXT NOT NULL DEFAULT '',   -- newline-separated points
    kuota           INTEGER NOT NULL DEFAULT 1, -- max students ("using")
    created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- A student may hold at most one PKL application (UNIQUE student_id).
CREATE TABLE pkl_applications (
    id         TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES pkl_partners(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    applied_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id)
);
CREATE INDEX idx_pkl_applications_partner ON pkl_applications(partner_id);

-- +goose Down
DROP TABLE IF EXISTS pkl_applications;
DROP TABLE IF EXISTS pkl_partners;
