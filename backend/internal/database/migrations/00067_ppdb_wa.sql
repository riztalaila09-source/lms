-- +goose Up
-- PPDB: tandai apakah pendaftar sudah dihubungi via WhatsApp.
ALTER TABLE ppdb_registrations ADD COLUMN wa_sent INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE ppdb_registrations DROP COLUMN wa_sent;
