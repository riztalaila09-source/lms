-- +goose Up
ALTER TABLE courses ADD COLUMN background_image TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE courses DROP COLUMN background_image;
