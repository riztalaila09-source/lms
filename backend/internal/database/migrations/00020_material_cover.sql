-- +goose Up
ALTER TABLE course_materials ADD COLUMN cover_image TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite cannot easily drop columns; leaving it in place is harmless.
