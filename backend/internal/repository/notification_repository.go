package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Notification struct {
	ID        string
	UserID    string // '' = broadcast
	Type      string
	Title     string
	Body      string
	Link      string
	CreatedAt time.Time
	Read      bool // filled by ListForUser relative to last-seen
}

type NotificationRepository interface {
	// Add inserts one notification per recipient. Empty userIDs (or a single ""
	// entry) creates a single broadcast row visible to everyone.
	Add(ctx context.Context, userIDs []string, typ, title, body, link string) error
	// ListForUser returns the user's own + broadcast notifications, newest first,
	// each flagged read against the user's last-seen timestamp.
	ListForUser(ctx context.Context, userID string, limit int) ([]*Notification, error)
	// UnreadCount counts user + broadcast notifications newer than last-seen.
	UnreadCount(ctx context.Context, userID string) (int, error)
	// MarkSeen upserts the user's last-seen timestamp to now.
	MarkSeen(ctx context.Context, userID string) error
}

type sqliteNotificationRepository struct{ db *sql.DB }

func NewNotificationRepository(db *sql.DB) NotificationRepository {
	return &sqliteNotificationRepository{db: db}
}

func (r *sqliteNotificationRepository) Add(ctx context.Context, userIDs []string, typ, title, body, link string) error {
	// Normalize: no recipients means a single broadcast row.
	if len(userIDs) == 0 {
		userIDs = []string{""}
	}
	now := time.Now().UTC()
	var (
		placeholders []string
		args         []any
	)
	for _, uid := range userIDs {
		placeholders = append(placeholders, "(?, ?, ?, ?, ?, ?, ?)")
		args = append(args, uuid.New().String(), uid, typ, title, body, link, now)
	}
	q := `INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES ` + strings.Join(placeholders, ", ")
	if _, err := r.db.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("add notifications: %w", err)
	}
	return nil
}

func (r *sqliteNotificationRepository) lastSeen(ctx context.Context, userID string) (time.Time, error) {
	var ts time.Time
	err := r.db.QueryRowContext(ctx, `SELECT last_seen_at FROM notification_seen WHERE user_id = ?`, userID).Scan(&ts)
	if err == sql.ErrNoRows {
		return time.Time{}, nil // never seen anything
	}
	return ts, err
}

func (r *sqliteNotificationRepository) ListForUser(ctx context.Context, userID string, limit int) ([]*Notification, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	seen, err := r.lastSeen(ctx, userID)
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, type, title, body, link, created_at
		FROM notifications
		WHERE user_id = ? OR user_id = ''
		ORDER BY created_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()
	var out []*Notification
	for rows.Next() {
		n := &Notification{}
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.Link, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.Read = !n.CreatedAt.After(seen)
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *sqliteNotificationRepository) UnreadCount(ctx context.Context, userID string) (int, error) {
	seen, err := r.lastSeen(ctx, userID)
	if err != nil {
		return 0, err
	}
	var n int
	err = r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE (user_id = ? OR user_id = '') AND created_at > ?`, userID, seen).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("unread count: %w", err)
	}
	return n, nil
}

func (r *sqliteNotificationRepository) MarkSeen(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO notification_seen (user_id, last_seen_at) VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
		userID, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("mark seen: %w", err)
	}
	return nil
}
