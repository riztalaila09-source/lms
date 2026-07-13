-- +goose Up
-- Per-fase discussion threads. Each "Fase Pembelajaran" block in a material's
-- rich-text content carries a stable block_id; students & teachers post comments
-- keyed by (material_id, block_id). Mirrors essay_comments but block-scoped.
CREATE TABLE material_phase_comments (
    id          TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    block_id    TEXT NOT NULL,
    author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mpc_material_block ON material_phase_comments(material_id, block_id);
CREATE INDEX idx_mpc_author         ON material_phase_comments(author_id);

-- +goose Down
DROP INDEX IF EXISTS idx_mpc_author;
DROP INDEX IF EXISTS idx_mpc_material_block;
DROP TABLE IF EXISTS material_phase_comments;
