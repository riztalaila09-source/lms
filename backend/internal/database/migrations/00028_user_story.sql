-- +goose Up
-- Editable free-text "story" per user, shown as testimonials on the home page.
ALTER TABLE users ADD COLUMN story TEXT NOT NULL DEFAULT '';

-- +goose Down
-- (SQLite cannot easily drop columns; leaving it is harmless.)
