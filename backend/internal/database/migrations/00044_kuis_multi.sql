-- +goose Up
-- Kuis: tiap soal boleh punya >1 jawaban benar (multi). Disimpan sebagai JSON
-- array indeks benar. Untuk tugas 'pilihan_ganda' tetap pakai correct_index.
ALTER TABLE assignment_questions ADD COLUMN correct_indices TEXT NOT NULL DEFAULT '[]';

-- +goose Down
ALTER TABLE assignment_questions DROP COLUMN correct_indices;
