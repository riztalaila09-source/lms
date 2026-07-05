-- +goose Up
-- School profile (singleton) shown in the dashboard greeting.
CREATE TABLE school_settings (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT ''
);
INSERT INTO school_settings (id, name, address) VALUES ('default', '', '')
ON CONFLICT(id) DO NOTHING;

-- Academic terms. Exactly one is active at a time.
CREATE TABLE semesters (
    id           TEXT PRIMARY KEY,
    semester     TEXT NOT NULL,          -- 'ganjil' | 'genap'
    tahun_ajaran TEXT NOT NULL,          -- e.g. '2026/2027'
    is_active    INTEGER NOT NULL DEFAULT 0,
    created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(semester, tahun_ajaran)
);

-- Teacher's subject taught; students keep this empty.
ALTER TABLE users ADD COLUMN mapel TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users DROP COLUMN mapel;
DROP TABLE IF EXISTS semesters;
DROP TABLE IF EXISTS school_settings;
