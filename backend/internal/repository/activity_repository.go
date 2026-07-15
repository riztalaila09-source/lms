package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type ActivityLogEntry struct {
	UserID     string
	FullName   string
	Username   string
	Role       string
	Kelas      string
	LoginCount int
	LastLogin  time.Time
	FirstLogin time.Time
}

type ActivityRepository interface {
	Record(ctx context.Context, id, userID, action string) error
	// Aggregate returns per-user login stats, most-recent first.
	Aggregate(ctx context.Context, userID string, page, pageSize int) ([]*ActivityLogEntry, int, error)
	// ResetAll menghapus seluruh catatan log aktivitas.
	ResetAll(ctx context.Context) error
}

type sqliteActivityRepository struct{ db *sql.DB }

func NewActivityRepository(db *sql.DB) ActivityRepository {
	return &sqliteActivityRepository{db: db}
}

// parseSQLiteTime parses datetimes returned as strings by aggregate functions.
func parseSQLiteTime(s string) time.Time {
	for _, layout := range []string{"2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05-07:00", "2006-01-02 15:04:05", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func (r *sqliteActivityRepository) Record(ctx context.Context, id, userID, action string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO activity_logs (id, user_id, action) VALUES (?, ?, ?)`, id, userID, action)
	if err != nil {
		return fmt.Errorf("record activity: %w", err)
	}
	return nil
}

func (r *sqliteActivityRepository) ResetAll(ctx context.Context) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM activity_logs`); err != nil {
		return fmt.Errorf("reset activity logs: %w", err)
	}
	return nil
}

func (r *sqliteActivityRepository) Aggregate(ctx context.Context, userID string, page, pageSize int) ([]*ActivityLogEntry, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	where := "WHERE a.action = 'login'"
	args := []any{}
	if userID != "" {
		where += " AND a.user_id = ?"
		args = append(args, userID)
	}

	var total int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT a.user_id) FROM activity_logs a `+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count activity: %w", err)
	}

	listArgs := append(append([]any{}, args...), pageSize, offset)
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.user_id, u.full_name, u.username, u.role, u.kelas,
		       COUNT(*) AS login_count, MAX(a.created_at) AS last_login, MIN(a.created_at) AS first_login
		FROM activity_logs a
		JOIN users u ON u.id = a.user_id
		`+where+`
		GROUP BY a.user_id
		ORDER BY last_login DESC
		LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("aggregate activity: %w", err)
	}
	defer rows.Close()

	var out []*ActivityLogEntry
	for rows.Next() {
		e := &ActivityLogEntry{}
		// MAX()/MIN() drop column affinity, so SQLite returns datetimes as strings.
		var last, first string
		if err := rows.Scan(&e.UserID, &e.FullName, &e.Username, &e.Role, &e.Kelas,
			&e.LoginCount, &last, &first); err != nil {
			return nil, 0, fmt.Errorf("scan activity: %w", err)
		}
		e.LastLogin = parseSQLiteTime(last)
		e.FirstLogin = parseSQLiteTime(first)
		out = append(out, e)
	}
	return out, total, rows.Err()
}
