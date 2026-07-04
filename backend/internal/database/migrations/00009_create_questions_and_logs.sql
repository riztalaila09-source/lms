-- +goose Up
CREATE TABLE material_questions (
    id            TEXT PRIMARY KEY,
    material_id   TEXT NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    question      TEXT NOT NULL,
    options_json  TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL DEFAULT 0,
    order_index   INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_questions_material ON material_questions(material_id);

CREATE TABLE activity_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT NOT NULL DEFAULT 'login',
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_user ON activity_logs(user_id);

-- +goose Down
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS material_questions;
