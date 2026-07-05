-- +goose Up
-- Merge class + major into one SMK-style class name: "Tingkat-Jurusan-Nomor"
-- (e.g. X-TKJ-1). Rename the demo classes and keep students' kelas + jurusan
-- in sync so the "Siswa per Jurusan" dashboard reflects the derived major.
UPDATE users   SET kelas = 'X-TKJ-1', jurusan = 'TKJ' WHERE role = 'student' AND kelas = 'X-1';
UPDATE classes SET name  = 'X-TKJ-1' WHERE name = 'X-1';

UPDATE users   SET kelas = 'X-TKR-1', jurusan = 'TKR' WHERE role = 'student' AND kelas = 'X-2';
UPDATE classes SET name  = 'X-TKR-1' WHERE name = 'X-2';

UPDATE users   SET kelas = 'X-RPL-1', jurusan = 'RPL' WHERE role = 'student' AND kelas = 'X-3';
UPDATE classes SET name  = 'X-RPL-1' WHERE name = 'X-3';

-- +goose Down
-- (irreversible rename)
