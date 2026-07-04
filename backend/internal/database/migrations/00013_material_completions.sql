-- +goose Up
CREATE TABLE material_completions (
    id           TEXT PRIMARY KEY,
    material_id  TEXT NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_percent INTEGER NOT NULL DEFAULT 0,
    quiz_passed  INTEGER NOT NULL DEFAULT 0,
    completed_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(material_id, student_id)
);
CREATE INDEX idx_mc_material ON material_completions(material_id);
CREATE INDEX idx_mc_student  ON material_completions(student_id);

-- +goose Down
DROP INDEX IF EXISTS idx_mc_student;
DROP INDEX IF EXISTS idx_mc_material;
DROP TABLE IF EXISTS material_completions;
