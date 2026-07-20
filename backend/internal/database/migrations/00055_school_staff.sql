-- +goose Up
ALTER TABLE school_settings ADD COLUMN kepala_sekolah_foto TEXT NOT NULL DEFAULT ''; -- URL / data URL

-- Staff directory (guru & tata usaha) shown on the public landing page.
CREATE TABLE school_staff (
    id         TEXT PRIMARY KEY,
    nama       TEXT NOT NULL DEFAULT '',
    jabatan    TEXT NOT NULL DEFAULT '',
    foto       TEXT NOT NULL DEFAULT '',
    urutan     INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- +goose Down
DROP TABLE IF EXISTS school_staff;
ALTER TABLE school_settings DROP COLUMN kepala_sekolah_foto;
