-- +goose Up
ALTER TABLE users ADD COLUMN kelas     TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN jurusan   TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN photo_url TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_users_kelas   ON users(kelas);
CREATE INDEX idx_users_jurusan ON users(jurusan);

-- Backfill demo students (seeded in 00006) with class + major.
UPDATE users SET kelas = 'X-1', jurusan = 'IPA' WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE users SET kelas = 'X-2', jurusan = 'IPS' WHERE id = '33333333-3333-3333-3333-333333333333';

-- +goose Down
DROP INDEX IF EXISTS idx_users_jurusan;
DROP INDEX IF EXISTS idx_users_kelas;
ALTER TABLE users DROP COLUMN photo_url;
ALTER TABLE users DROP COLUMN jurusan;
ALTER TABLE users DROP COLUMN kelas;
