-- +goose Up
-- Granular access rights for teachers (JSON array of permission keys). Admins
-- are super-users and ignore this column. Existing teachers are backfilled with
-- the full grantable set so their current access is preserved.
ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '';

UPDATE users
SET permissions = '["kelola_siswa","kelola_guru","kelola_ortu","kelola_sekolah","kelola_nilai","kelola_absensi","kelola_materi","kelola_tugas","kelola_pkl","kelola_log"]'
WHERE role = 'teacher';

-- +goose Down
ALTER TABLE users DROP COLUMN permissions;
