-- +goose Up
-- Headmaster signature image (data URL), printed on PPDB exam cards.
ALTER TABLE school_settings ADD COLUMN kepala_sekolah_ttd TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE school_settings DROP COLUMN kepala_sekolah_ttd;
