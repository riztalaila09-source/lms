package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("user not found")
var ErrDuplicate = errors.New("user already exists")

type User struct {
	ID           string
	Username     string
	Email        string
	PasswordHash string
	Role         string
	FullName     string
	IsActive     bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type ListFilter struct {
	RoleFilter string
	Page       int
	PageSize   int
}

type UserRepository interface {
	Create(ctx context.Context, u *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, u *User) error
	Delete(ctx context.Context, id string) error
	List(ctx context.Context, f ListFilter) ([]*User, int, error)
}

type sqliteUserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &sqliteUserRepository{db: db}
}

func (r *sqliteUserRepository) Create(ctx context.Context, u *User) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, username, email, password_hash, role, full_name, is_active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.Username, u.Email, u.PasswordHash, u.Role, u.FullName, u.IsActive, u.CreatedAt, u.UpdatedAt,
	)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrDuplicate
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *sqliteUserRepository) GetByID(ctx context.Context, id string) (*User, error) {
	u := &User{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, username, email, password_hash, role, full_name, is_active, created_at, updated_at
		FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.FullName, &u.IsActive, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

func (r *sqliteUserRepository) GetByEmail(ctx context.Context, email string) (*User, error) {
	u := &User{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, username, email, password_hash, role, full_name, is_active, created_at, updated_at
		FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.FullName, &u.IsActive, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

func (r *sqliteUserRepository) Update(ctx context.Context, u *User) error {
	u.UpdatedAt = time.Now()
	res, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET username=?, email=?, password_hash=?, role=?, full_name=?, is_active=?, updated_at=?
		WHERE id=?`,
		u.Username, u.Email, u.PasswordHash, u.Role, u.FullName, u.IsActive, u.UpdatedAt, u.ID,
	)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrDuplicate
		}
		return fmt.Errorf("update user: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *sqliteUserRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *sqliteUserRepository) List(ctx context.Context, f ListFilter) ([]*User, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 20
	}
	offset := (f.Page - 1) * f.PageSize

	whereClause := ""
	args := []any{}
	countArgs := []any{}

	if f.RoleFilter != "" {
		whereClause = " WHERE role = ?"
		args = append(args, f.RoleFilter)
		countArgs = append(countArgs, f.RoleFilter)
	}

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`+whereClause, countArgs...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	args = append(args, f.PageSize, offset)
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, username, email, password_hash, role, full_name, is_active, created_at, updated_at
		FROM users`+whereClause+` ORDER BY created_at DESC LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		u := &User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.FullName, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, total, rows.Err()
}

func isSQLiteConstraintError(err error) bool {
	if err == nil {
		return false
	}
	return contains(err.Error(), "UNIQUE constraint failed") || contains(err.Error(), "constraint failed")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
