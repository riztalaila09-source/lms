-- +goose Up
CREATE TABLE parents (
    id            TEXT PRIMARY KEY,
    nama_ayah     TEXT NOT NULL DEFAULT '',
    nama_ibu      TEXT NOT NULL DEFAULT '',
    nama_wali     TEXT NOT NULL DEFAULT '',
    hubungan_wali TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    pekerjaan     TEXT NOT NULL DEFAULT '',
    alamat        TEXT NOT NULL DEFAULT '',
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- A student points at one parent household; a household has many students.
-- Deleting the parent record detaches its children (kept, just unlinked).
ALTER TABLE users ADD COLUMN parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL;
CREATE INDEX idx_users_parent ON users(parent_id);

-- +goose Down
DROP INDEX IF EXISTS idx_users_parent;
ALTER TABLE users DROP COLUMN parent_id;
DROP TABLE IF EXISTS parents;
