-- +goose Up
-- Gender for teachers and students. '' = unspecified, 'L' = laki-laki, 'P' = perempuan.
ALTER TABLE users ADD COLUMN gender TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users DROP COLUMN gender;
