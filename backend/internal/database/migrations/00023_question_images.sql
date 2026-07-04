-- +goose Up
-- Optional image per MCQ question (small data URL). Only loaded on demand
-- (editing / taking a quiz), never on the assignment/material list pages.
ALTER TABLE assignment_questions ADD COLUMN image TEXT NOT NULL DEFAULT '';
ALTER TABLE material_questions   ADD COLUMN image TEXT NOT NULL DEFAULT '';

-- +goose Down
-- (SQLite cannot easily drop columns; leaving them is harmless.)
