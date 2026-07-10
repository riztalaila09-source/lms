-- +goose Up
-- A session may span several lesson hours (e.g. "Jam ke-1 s/d 4"). jam_ke is the
-- starting hour; jam_ke_akhir is the ending hour (0 = single/manual).
ALTER TABLE attendance_sessions ADD COLUMN jam_ke_akhir INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE attendance_sessions DROP COLUMN jam_ke_akhir;
