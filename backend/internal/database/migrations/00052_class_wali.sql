-- +goose Up
-- Homeroom teacher (wali kelas) per class. Detaches (SET NULL) if the teacher
-- account is removed.
ALTER TABLE classes ADD COLUMN wali_teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE classes DROP COLUMN wali_teacher_id;
