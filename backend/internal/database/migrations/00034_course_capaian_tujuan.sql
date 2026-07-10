-- +goose Up
-- Learning outcomes (capaian) and objectives (tujuan) per course, shown to
-- students. Stored as newline-separated bullet points.
ALTER TABLE courses ADD COLUMN capaian_pembelajaran TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN tujuan_pembelajaran  TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE courses DROP COLUMN tujuan_pembelajaran;
ALTER TABLE courses DROP COLUMN capaian_pembelajaran;
