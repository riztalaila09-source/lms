-- +goose Up
-- Separate the room from the class: kelas is the class (e.g. "X-TKJ-1"),
-- ruang is the physical room/lab used (e.g. "Lab 1").
ALTER TABLE attendance_sessions ADD COLUMN ruang TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE attendance_sessions DROP COLUMN ruang;
