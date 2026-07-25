-- +goose Up
-- PPDB: pendaftaran calon murid (diisi publik lewat landing page, dikelola admin).
CREATE TABLE ppdb_registrations (
    id            TEXT PRIMARY KEY,
    nama          TEXT NOT NULL,
    tempat_lahir  TEXT NOT NULL DEFAULT '',
    tanggal_lahir TEXT NOT NULL DEFAULT '', -- 'YYYY-MM-DD'
    jenis_kelamin TEXT NOT NULL DEFAULT '', -- 'L' | 'P'
    asal_sekolah  TEXT NOT NULL DEFAULT '',
    jurusan       TEXT NOT NULL DEFAULT '',
    nama_ortu     TEXT NOT NULL DEFAULT '', -- nama orang tua / wali
    alamat        TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    nisn          TEXT NOT NULL DEFAULT '',
    no_kk         TEXT NOT NULL DEFAULT '', -- nomor kartu keluarga
    phones        TEXT NOT NULL DEFAULT '[]', -- JSON: [{"label","number"}]
    status        TEXT NOT NULL DEFAULT 'baru', -- 'baru' | 'diterima' | 'ditolak'
    catatan       TEXT NOT NULL DEFAULT '',
    created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ppdb_created ON ppdb_registrations(created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS ppdb_registrations;
