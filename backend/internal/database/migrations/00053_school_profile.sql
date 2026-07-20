-- +goose Up
-- Richer school / app profile used by the public landing page.
ALTER TABLE school_settings ADD COLUMN app_name       TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN logo           TEXT NOT NULL DEFAULT ''; -- base64 data URL
ALTER TABLE school_settings ADD COLUMN profil         TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN visi           TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN misi           TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN kepala_sekolah TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN tahun_berdiri  TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN email          TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN whatsapp       TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN npsn           TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN status         TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN akreditasi     TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN jenjang        TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE school_settings DROP COLUMN jenjang;
ALTER TABLE school_settings DROP COLUMN akreditasi;
ALTER TABLE school_settings DROP COLUMN status;
ALTER TABLE school_settings DROP COLUMN npsn;
ALTER TABLE school_settings DROP COLUMN whatsapp;
ALTER TABLE school_settings DROP COLUMN email;
ALTER TABLE school_settings DROP COLUMN tahun_berdiri;
ALTER TABLE school_settings DROP COLUMN kepala_sekolah;
ALTER TABLE school_settings DROP COLUMN misi;
ALTER TABLE school_settings DROP COLUMN visi;
ALTER TABLE school_settings DROP COLUMN profil;
ALTER TABLE school_settings DROP COLUMN logo;
ALTER TABLE school_settings DROP COLUMN app_name;
