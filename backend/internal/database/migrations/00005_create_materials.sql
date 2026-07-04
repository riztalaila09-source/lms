-- +goose Up
CREATE TABLE course_materials (
    id           TEXT PRIMARY KEY,
    course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL CHECK(content_type IN ('link', 'document', 'video', 'text')),
    content_url  TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    order_index  INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 0,
    created_by   TEXT NOT NULL REFERENCES users(id),
    created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_materials_course ON course_materials(course_id);

-- +goose Down
DROP INDEX IF EXISTS idx_materials_course;
DROP TABLE IF EXISTS course_materials;
