-- +goose Up
-- Repair covers corrupted by the edit round-trip bug: cover_image was
-- overwritten with the lean "/covers/<id>" URL instead of the raw data URL,
-- so the image bytes are gone. Clear them so the card shows a clean
-- placeholder (re-upload needed) instead of a broken 404 image.
UPDATE course_materials SET cover_image = '' WHERE cover_image LIKE '/covers/%';

-- +goose Down
-- (irreversible data repair)
