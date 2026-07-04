-- +goose Up
-- SMK majors, not academic (SMA) ones. Remap any legacy demo majors to
-- vocational (SMK) equivalents so the dashboard shows TKJ/TKR/RPL etc.
UPDATE users SET jurusan = 'TKJ' WHERE role = 'student' AND jurusan = 'IPA';
UPDATE users SET jurusan = 'TKR' WHERE role = 'student' AND jurusan = 'IPS';
UPDATE users SET jurusan = 'RPL' WHERE role = 'student' AND jurusan = 'Bahasa';

-- +goose Down
-- (irreversible data remap)
