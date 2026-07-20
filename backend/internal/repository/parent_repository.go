package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrParentNotFound = errors.New("parent not found")

// ChildRef is a student linked to a parent household.
type ChildRef struct {
	StudentID string
	FullName  string
	Kelas     string
}

// Parent is a parent/guardian household. Contact data for now; a login account
// may be attached later.
type Parent struct {
	ID        string
	NamaOrtu  string // guardian name
	Hubungan  string // relationship (Ayah / Ibu / Wali / …)
	Phone     string
	Alamat    string
	Children  []ChildRef
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ParentRepository interface {
	Create(ctx context.Context, p *Parent) error
	GetByID(ctx context.Context, id string) (*Parent, error)
	Update(ctx context.Context, p *Parent) error
	Delete(ctx context.Context, id string) error
	List(ctx context.Context, search string, page, pageSize int) ([]*Parent, int, error)
	// SetChildren makes studentIDs the exact set of children of parentID:
	// previously-linked students not in the list are detached.
	SetChildren(ctx context.Context, parentID string, studentIDs []string) error
}

type sqliteParentRepository struct{ db *sql.DB }

func NewParentRepository(db *sql.DB) ParentRepository {
	return &sqliteParentRepository{db: db}
}

const parentColumns = `id, nama_ortu, hubungan, phone, alamat, created_at, updated_at`

func scanParent(s interface{ Scan(dest ...any) error }, p *Parent) error {
	return s.Scan(&p.ID, &p.NamaOrtu, &p.Hubungan, &p.Phone, &p.Alamat, &p.CreatedAt, &p.UpdatedAt)
}

func (r *sqliteParentRepository) loadChildren(ctx context.Context, parentID string) ([]ChildRef, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, full_name, kelas FROM users WHERE parent_id = ? AND role = 'student' ORDER BY full_name ASC`, parentID)
	if err != nil {
		return nil, fmt.Errorf("load children: %w", err)
	}
	defer rows.Close()
	var out []ChildRef
	for rows.Next() {
		var c ChildRef
		if err := rows.Scan(&c.StudentID, &c.FullName, &c.Kelas); err != nil {
			return nil, fmt.Errorf("scan child: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *sqliteParentRepository) Create(ctx context.Context, p *Parent) error {
	now := time.Now().UTC()
	p.CreatedAt, p.UpdatedAt = now, now
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO parents (`+parentColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.NamaOrtu, p.Hubungan, p.Phone, p.Alamat, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create parent: %w", err)
	}
	return nil
}

func (r *sqliteParentRepository) GetByID(ctx context.Context, id string) (*Parent, error) {
	p := &Parent{}
	err := scanParent(r.db.QueryRowContext(ctx, `SELECT `+parentColumns+` FROM parents WHERE id = ?`, id), p)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrParentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get parent: %w", err)
	}
	children, err := r.loadChildren(ctx, id)
	if err != nil {
		return nil, err
	}
	p.Children = children
	return p, nil
}

func (r *sqliteParentRepository) Update(ctx context.Context, p *Parent) error {
	p.UpdatedAt = time.Now().UTC()
	res, err := r.db.ExecContext(ctx, `
		UPDATE parents
		SET nama_ortu=?, hubungan=?, phone=?, alamat=?, updated_at=?
		WHERE id=?`,
		p.NamaOrtu, p.Hubungan, p.Phone, p.Alamat, p.UpdatedAt, p.ID)
	if err != nil {
		return fmt.Errorf("update parent: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrParentNotFound
	}
	return nil
}

func (r *sqliteParentRepository) Delete(ctx context.Context, id string) error {
	// ON DELETE SET NULL detaches children automatically.
	res, err := r.db.ExecContext(ctx, `DELETE FROM parents WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete parent: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrParentNotFound
	}
	return nil
}

func (r *sqliteParentRepository) List(ctx context.Context, search string, page, pageSize int) ([]*Parent, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	where := ""
	args := []any{}
	if search != "" {
		where = ` WHERE (nama_ortu LIKE ? OR phone LIKE ?)`
		like := "%" + search + "%"
		args = append(args, like, like)
	}

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM parents`+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count parents: %w", err)
	}

	listArgs := append(append([]any{}, args...), pageSize, offset)
	rows, err := r.db.QueryContext(ctx, `SELECT `+parentColumns+` FROM parents`+where+
		` ORDER BY created_at DESC LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list parents: %w", err)
	}
	defer rows.Close()

	var out []*Parent
	for rows.Next() {
		p := &Parent{}
		if err := scanParent(rows, p); err != nil {
			return nil, 0, fmt.Errorf("scan parent: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	// Attach children after the cursor is closed (single-connection SQLite).
	for _, p := range out {
		children, err := r.loadChildren(ctx, p.ID)
		if err != nil {
			return nil, 0, err
		}
		p.Children = children
	}
	return out, total, nil
}

func (r *sqliteParentRepository) SetChildren(ctx context.Context, parentID string, studentIDs []string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Detach everyone currently attached to this parent.
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET parent_id = NULL WHERE parent_id = ? AND role = 'student'`, parentID); err != nil {
		return fmt.Errorf("detach children: %w", err)
	}

	// Attach the requested students.
	if len(studentIDs) > 0 {
		placeholders := make([]string, len(studentIDs))
		args := make([]any, 0, len(studentIDs)+1)
		args = append(args, parentID)
		for i, id := range studentIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		q := `UPDATE users SET parent_id = ? WHERE role = 'student' AND id IN (` + strings.Join(placeholders, ",") + `)`
		if _, err := tx.ExecContext(ctx, q, args...); err != nil {
			return fmt.Errorf("attach children: %w", err)
		}
	}

	return tx.Commit()
}
