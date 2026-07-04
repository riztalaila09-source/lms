-- +goose Up
-- The sentinel "Materi Umum" course: a single course every student & teacher can
-- access without class/enrollment restrictions. Owned by an existing admin/teacher.
INSERT INTO courses (id, code, name, description, teacher_id, is_active)
SELECT 'general', 'UMUM', 'Materi Umum',
       'Materi untuk semua siswa & guru (tanpa batas kelas).',
       (SELECT id FROM users WHERE role IN ('admin', 'teacher') ORDER BY (role = 'admin') DESC, created_at ASC LIMIT 1),
       1
WHERE EXISTS (SELECT 1 FROM users WHERE role IN ('admin', 'teacher'))
  AND NOT EXISTS (SELECT 1 FROM courses WHERE id = 'general');

-- +goose Down
DELETE FROM courses WHERE id = 'general';
