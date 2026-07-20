-- +goose Up
-- Generic content lists for the public site: galeri_foto, galeri_video,
-- jurusan, berita, pengumuman, agenda, kelulusan. Grouped by `type`.
CREATE TABLE school_content (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    subtitle   TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    image      TEXT NOT NULL DEFAULT '', -- URL / data URL
    url        TEXT NOT NULL DEFAULT '', -- link (video / dokumen)
    urutan     INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_school_content_type ON school_content(type, urutan);

-- +goose Down
DROP TABLE IF EXISTS school_content;
