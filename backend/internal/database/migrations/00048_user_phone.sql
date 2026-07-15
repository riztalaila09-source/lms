-- +goose Up
ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users DROP COLUMN phone;
