-- +goose Up
-- Student star ratings (1–5) for materials. One rating per student per material.
CREATE TABLE material_ratings (
    id          TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars       INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(material_id, student_id)
);

CREATE INDEX idx_material_ratings_material ON material_ratings(material_id);

-- +goose Down
DROP INDEX IF EXISTS idx_material_ratings_material;
DROP TABLE IF EXISTS material_ratings;
