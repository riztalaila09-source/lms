-- +goose Up
-- Ketua kelompok praktikum. Hanya ketua yang boleh mengumpulkan tugas kelompok.
ALTER TABLE assignment_group_members ADD COLUMN is_leader INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE assignment_group_members DROP COLUMN is_leader;
