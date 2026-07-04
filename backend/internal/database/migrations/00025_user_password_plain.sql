-- +goose Up
-- Store a plaintext copy of the password so staff can view student/teacher
-- credentials in Kelola Akun. Populated on create / password change; empty for
-- accounts that predate this column.
ALTER TABLE users ADD COLUMN password_plain TEXT NOT NULL DEFAULT '';

-- +goose Down
-- (SQLite cannot easily drop columns; leaving it is harmless.)
