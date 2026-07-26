-- +goose Up
-- Pusat notifikasi in-app. user_id='' berarti broadcast (untuk semua pengguna).
CREATE TABLE notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL DEFAULT '', -- '' = broadcast ke semua
    type       TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    link       TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Penanda "sudah dibaca" per-pengguna via timestamp terakhir dilihat.
CREATE TABLE notification_seen (
    user_id      TEXT PRIMARY KEY,
    last_seen_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- +goose Down
DROP TABLE IF EXISTS notification_seen;
DROP TABLE IF EXISTS notifications;
