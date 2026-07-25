-- +goose Up
-- PPDB gelombang: one row = one wave (gelombang 1..4) within a school year.
CREATE TABLE ppdb_batches (
    id                    TEXT PRIMARY KEY,
    tahun_ajaran          TEXT NOT NULL,               -- e.g. '2026/2027'
    gelombang             INTEGER NOT NULL DEFAULT 1,  -- 1..4
    nama                  TEXT NOT NULL DEFAULT '',    -- derived label, e.g. 'Gelombang 1'
    is_active             INTEGER NOT NULL DEFAULT 0,  -- only one active at a time
    buka                  TEXT NOT NULL DEFAULT '',    -- 'YYYY-MM-DD'
    tutup                 TEXT NOT NULL DEFAULT '',
    brosur                TEXT NOT NULL DEFAULT '',    -- image data URL (streamed at /ppdb-brosur)
    drive_link            TEXT NOT NULL DEFAULT '',    -- Google Drive upload link
    panduan               TEXT NOT NULL DEFAULT '',    -- upload instructions
    required_docs         TEXT NOT NULL DEFAULT '[]',  -- JSON []string checklist
    kuota                 TEXT NOT NULL DEFAULT '{}',  -- JSON {TKJ,TKR,TPM,TSM: int} (info only)
    test_active           INTEGER NOT NULL DEFAULT 0,  -- exam open now
    test_duration_minutes INTEGER NOT NULL DEFAULT 60,
    created_at            DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tahun_ajaran, gelombang)
);

-- Bank soal (pilihan ganda) per gelombang.
CREATE TABLE ppdb_questions (
    id            TEXT PRIMARY KEY,
    batch_id      TEXT NOT NULL REFERENCES ppdb_batches(id) ON DELETE CASCADE,
    question      TEXT NOT NULL DEFAULT '',
    options_json  TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL DEFAULT 0,
    order_index   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ppdb_questions_batch ON ppdb_questions(batch_id, order_index);

-- Jawaban tes tiap pendaftar (untuk rekap; skor ringkas ada di ppdb_registrations).
CREATE TABLE ppdb_test_answers (
    id              TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL REFERENCES ppdb_registrations(id) ON DELETE CASCADE,
    question_index  INTEGER NOT NULL,
    option_index    INTEGER NOT NULL,
    is_correct      INTEGER NOT NULL DEFAULT 0,
    UNIQUE(registration_id, question_index)
);

-- Extend registrations with batch + exam credentials + score.
ALTER TABLE ppdb_registrations ADD COLUMN batch_id        TEXT NOT NULL DEFAULT '';
ALTER TABLE ppdb_registrations ADD COLUMN no_pendaftaran  TEXT NOT NULL DEFAULT '';
ALTER TABLE ppdb_registrations ADD COLUMN password_plain  TEXT NOT NULL DEFAULT '';
ALTER TABLE ppdb_registrations ADD COLUMN test_score      INTEGER NOT NULL DEFAULT -1; -- -1 = belum ujian
ALTER TABLE ppdb_registrations ADD COLUMN test_submitted  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ppdb_registrations ADD COLUMN test_started_at DATETIME;
CREATE INDEX idx_ppdb_reg_batch ON ppdb_registrations(batch_id);

-- +goose Down
DROP INDEX IF EXISTS idx_ppdb_reg_batch;
ALTER TABLE ppdb_registrations DROP COLUMN test_started_at;
ALTER TABLE ppdb_registrations DROP COLUMN test_submitted;
ALTER TABLE ppdb_registrations DROP COLUMN test_score;
ALTER TABLE ppdb_registrations DROP COLUMN password_plain;
ALTER TABLE ppdb_registrations DROP COLUMN no_pendaftaran;
ALTER TABLE ppdb_registrations DROP COLUMN batch_id;
DROP TABLE IF EXISTS ppdb_test_answers;
DROP TABLE IF EXISTS ppdb_questions;
DROP TABLE IF EXISTS ppdb_batches;
