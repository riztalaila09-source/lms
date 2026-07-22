-- +goose Up
-- The "telat" (late) attendance status was removed: any valid check-in within the
-- session window now counts as "hadir". Convert any legacy 'telat' records to
-- 'hadir' so old data stays consistent (no orphan status in recaps / badges).
UPDATE attendance_records SET status = 'hadir' WHERE status = 'telat';

-- +goose Down
-- Irreversible: the original hadir/telat distinction is not recoverable.
SELECT 1;
