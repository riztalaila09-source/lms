-- +goose Up
-- Jurusan (SMK major) as a managed list, mirroring classes.
CREATE TABLE jurusans (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Seed common SMK majors so there are options out of the box.
INSERT INTO jurusans (id, name) VALUES
    ('jur-tkj',  'TKJ'),
    ('jur-rpl',  'RPL'),
    ('jur-mm',   'MM'),
    ('jur-tkr',  'TKR'),
    ('jur-tsm',  'TSM'),
    ('jur-tpm',  'TPM'),
    ('jur-titl', 'TITL')
ON CONFLICT(name) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS jurusans;
