-- +goose Up
-- Profil media, map, and PPDB (admissions) info for the public landing page.
ALTER TABLE school_settings ADD COLUMN profil_image     TEXT NOT NULL DEFAULT ''; -- URL / data URL
ALTER TABLE school_settings ADD COLUMN profil_video     TEXT NOT NULL DEFAULT ''; -- video link (YouTube …)
ALTER TABLE school_settings ADD COLUMN maps_url         TEXT NOT NULL DEFAULT ''; -- Google Maps link
ALTER TABLE school_settings ADD COLUMN ppdb_aktif       TEXT NOT NULL DEFAULT ''; -- '1' = tampilkan menu PPDB
ALTER TABLE school_settings ADD COLUMN ppdb_info        TEXT NOT NULL DEFAULT '';
ALTER TABLE school_settings ADD COLUMN ppdb_brosur      TEXT NOT NULL DEFAULT ''; -- URL / data URL brosur
ALTER TABLE school_settings ADD COLUMN ppdb_daftar_url  TEXT NOT NULL DEFAULT ''; -- link daftar
ALTER TABLE school_settings ADD COLUMN ppdb_pengumuman  TEXT NOT NULL DEFAULT ''; -- teks / link pengumuman

-- +goose Down
ALTER TABLE school_settings DROP COLUMN ppdb_pengumuman;
ALTER TABLE school_settings DROP COLUMN ppdb_daftar_url;
ALTER TABLE school_settings DROP COLUMN ppdb_brosur;
ALTER TABLE school_settings DROP COLUMN ppdb_info;
ALTER TABLE school_settings DROP COLUMN ppdb_aktif;
ALTER TABLE school_settings DROP COLUMN maps_url;
ALTER TABLE school_settings DROP COLUMN profil_video;
ALTER TABLE school_settings DROP COLUMN profil_image;
