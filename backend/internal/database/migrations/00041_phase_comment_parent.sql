-- +goose Up
-- parent_id enables 1-level threaded replies (teacher replies under a student's
-- comment). Empty string = top-level comment. Reused by the material-level
-- discussion thread (block_id = '__material__').
ALTER TABLE material_phase_comments ADD COLUMN parent_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_mpc_parent ON material_phase_comments(parent_id);

-- +goose Down
DROP INDEX IF EXISTS idx_mpc_parent;
ALTER TABLE material_phase_comments DROP COLUMN parent_id;
