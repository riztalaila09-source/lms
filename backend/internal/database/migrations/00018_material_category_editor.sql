-- +goose Up
-- Materials get an optional category and a "last edited by" user. Plain TEXT
-- columns (no FK) so categories can be deleted without cascading constraints.
ALTER TABLE course_materials ADD COLUMN category_id TEXT NOT NULL DEFAULT '';
ALTER TABLE course_materials ADD COLUMN updated_by  TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite cannot easily drop columns; leaving them in place is harmless.
