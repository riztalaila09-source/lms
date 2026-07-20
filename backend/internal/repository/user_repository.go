package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrNotFound = errors.New("user not found")
var ErrDuplicate = errors.New("user already exists")

type User struct {
	ID            string
	Username      string
	Email         string
	PasswordHash  string
	PasswordPlain string
	Role          string
	FullName      string
	IsActive      bool
	Kelas         string
	Jurusan       string
	PhotoURL      string
	Story         string
	Mapel         string
	Gender        string // '' | 'L' | 'P'
	Phone         string
	Permissions   []string // access-right keys (teachers); admins ignore
	ParentID      string   // '' when no parent linked (students only)
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// permissions are stored as a JSON array string in the users.permissions column.
func marshalPerms(perms []string) string {
	if len(perms) == 0 {
		return ""
	}
	b, err := json.Marshal(perms)
	if err != nil {
		return ""
	}
	return string(b)
}

func unmarshalPerms(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil
	}
	return out
}

// StoryEntry is a user's testimonial shown on the home page.
type StoryEntry struct {
	UserID   string
	FullName string
	Role     string
	Kelas    string
	Jurusan  string
	PhotoURL string
	Story    string
}

type ListFilter struct {
	RoleFilter string
	Kelas      string
	Jurusan    string
	Search     string
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
	// MoveStudentsByClass reassigns every student in fromKelas to toKelas.
	MoveStudentsByClass(ctx context.Context, fromKelas, toKelas string) (int64, error)
	// MoveStudentsByIDs reassigns the given student ids to toKelas.
	MoveStudentsByIDs(ctx context.Context, ids []string, toKelas string) (int64, error)
	// ListStories returns active users who have written a non-empty story.
	ListStories(ctx context.Context, limit int) ([]*StoryEntry, error)
}

type sqliteUserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &sqliteUserRepository{db: db}
}

const userColumns = `id, username, email, password_hash, password_plain, role, full_name, is_active, kelas, jurusan, photo_url, story, mapel, gender, phone, permissions, COALESCE(parent_id, '') AS parent_id, created_at, updated_at`

func scanUser(s interface {
	Scan(dest ...any) error
}, u *User) error {
	var permsJSON string
	if err := s.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.PasswordPlain, &u.Role, &u.FullName,
		&u.IsActive, &u.Kelas, &u.Jurusan, &u.PhotoURL, &u.Story, &u.Mapel, &u.Gender, &u.Phone, &permsJSON, &u.ParentID, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return err
	}
	u.Permissions = unmarshalPerms(permsJSON)
	return nil
}

func (r *sqliteUserRepository) Create(ctx context.Context, u *User) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, username, email, password_hash, password_plain, role, full_name, is_active, kelas, jurusan, photo_url, story, mapel, gender, phone, permissions, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.Username, u.Email, u.PasswordHash, u.PasswordPlain, u.Role, u.FullName, u.IsActive, u.Kelas, u.Jurusan, u.PhotoURL, u.Story, u.Mapel, u.Gender, u.Phone, marshalPerms(u.Permissions), u.CreatedAt, u.UpdatedAt,
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
	err := scanUser(r.db.QueryRowContext(ctx, `SELECT `+userColumns+` FROM users WHERE id = ?`, id), u)
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
	err := scanUser(r.db.QueryRowContext(ctx, `SELECT `+userColumns+` FROM users WHERE email = ?`, email), u)
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
		SET username=?, email=?, password_hash=?, password_plain=?, role=?, full_name=?, is_active=?, kelas=?, jurusan=?, photo_url=?, story=?, mapel=?, gender=?, phone=?, permissions=?, updated_at=?
		WHERE id=?`,
		u.Username, u.Email, u.PasswordHash, u.PasswordPlain, u.Role, u.FullName, u.IsActive, u.Kelas, u.Jurusan, u.PhotoURL, u.Story, u.Mapel, u.Gender, u.Phone, marshalPerms(u.Permissions), u.UpdatedAt, u.ID,
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

	conds := []string{}
	args := []any{}
	if f.RoleFilter != "" {
		conds = append(conds, "role = ?")
		args = append(args, f.RoleFilter)
	}
	if f.Kelas != "" {
		conds = append(conds, "kelas = ?")
		args = append(args, f.Kelas)
	}
	if f.Jurusan != "" {
		conds = append(conds, "jurusan = ?")
		args = append(args, f.Jurusan)
	}
	if f.Search != "" {
		conds = append(conds, "(full_name LIKE ? OR username LIKE ? OR email LIKE ?)")
		like := "%" + f.Search + "%"
		args = append(args, like, like, like)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	listArgs := append(append([]any{}, args...), f.PageSize, offset)
	rows, err := r.db.QueryContext(ctx, `SELECT `+userColumns+` FROM users`+where+
		` ORDER BY full_name ASC, created_at DESC LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		u := &User{}
		if err := scanUser(rows, u); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, total, rows.Err()
}

// JurusanFromKelas extracts the major from a class name like "X-TKJ-1" → "TKJ".
// Returns "" for names that don't follow the tingkat-jurusan-nomor format.
func JurusanFromKelas(kelas string) string {
	parts := strings.Split(kelas, "-")
	if len(parts) >= 3 {
		return strings.Join(parts[1:len(parts)-1], "-")
	}
	return ""
}

func (r *sqliteUserRepository) MoveStudentsByClass(ctx context.Context, fromKelas, toKelas string) (int64, error) {
	jur := JurusanFromKelas(toKelas)
	res, err := r.db.ExecContext(ctx,
		`UPDATE users SET kelas=?, jurusan=CASE WHEN ?<>'' THEN ? ELSE jurusan END, updated_at=?
		 WHERE kelas=? AND role='student'`,
		toKelas, jur, jur, time.Now(), fromKelas)
	if err != nil {
		return 0, fmt.Errorf("move students by class: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (r *sqliteUserRepository) MoveStudentsByIDs(ctx context.Context, ids []string, toKelas string) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	jur := JurusanFromKelas(toKelas)
	placeholders := make([]string, len(ids))
	args := make([]any, 0, len(ids)+4)
	args = append(args, toKelas, jur, jur, time.Now())
	for i, id := range ids {
		placeholders[i] = "?"
		args = append(args, id)
	}
	res, err := r.db.ExecContext(ctx,
		`UPDATE users SET kelas=?, jurusan=CASE WHEN ?<>'' THEN ? ELSE jurusan END, updated_at=?
		 WHERE role='student' AND id IN (`+strings.Join(placeholders, ",")+`)`,
		args...)
	if err != nil {
		return 0, fmt.Errorf("move students by ids: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (r *sqliteUserRepository) ListStories(ctx context.Context, limit int) ([]*StoryEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, full_name, role, kelas, jurusan, photo_url, story
		FROM users
		WHERE story <> '' AND is_active = 1
		ORDER BY updated_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("list stories: %w", err)
	}
	defer rows.Close()

	var out []*StoryEntry
	for rows.Next() {
		e := &StoryEntry{}
		if err := rows.Scan(&e.UserID, &e.FullName, &e.Role, &e.Kelas, &e.Jurusan, &e.PhotoURL, &e.Story); err != nil {
			return nil, fmt.Errorf("scan story: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func isSQLiteConstraintError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed") || strings.Contains(err.Error(), "constraint failed")
}
