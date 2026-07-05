package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrSemesterNotFound = errors.New("semester not found")
var ErrSemesterDuplicate = errors.New("semester already exists")

type School struct {
	Name    string
	Address string
}

type Semester struct {
	ID          string
	Semester    string
	TahunAjaran string
	IsActive    bool
	CreatedAt   time.Time
}

type SchoolRepository interface {
	GetSchool(ctx context.Context) (*School, error)
	UpdateSchool(ctx context.Context, name, address string) (*School, error)
	CreateSemester(ctx context.Context, s *Semester) error
	ListSemesters(ctx context.Context) ([]*Semester, error)
	SetActiveSemester(ctx context.Context, id string) (*Semester, error)
	DeleteSemester(ctx context.Context, id string) error
}

type sqliteSchoolRepository struct{ db *sql.DB }

func NewSchoolRepository(db *sql.DB) SchoolRepository {
	return &sqliteSchoolRepository{db: db}
}

func (r *sqliteSchoolRepository) GetSchool(ctx context.Context) (*School, error) {
	s := &School{}
	err := r.db.QueryRowContext(ctx, `SELECT name, address FROM school_settings WHERE id='default'`).Scan(&s.Name, &s.Address)
	if errors.Is(err, sql.ErrNoRows) {
		return s, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get school: %w", err)
	}
	return s, nil
}

func (r *sqliteSchoolRepository) UpdateSchool(ctx context.Context, name, address string) (*School, error) {
	if _, err := r.db.ExecContext(ctx,
		`INSERT INTO school_settings (id, name, address) VALUES ('default', ?, ?)
		 ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address`, name, address); err != nil {
		return nil, fmt.Errorf("update school: %w", err)
	}
	return &School{Name: name, Address: address}, nil
}

func (r *sqliteSchoolRepository) CreateSemester(ctx context.Context, s *Semester) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO semesters (id, semester, tahun_ajaran, is_active, created_at) VALUES (?, ?, ?, ?, ?)`,
		s.ID, s.Semester, s.TahunAjaran, boolToInt(s.IsActive), s.CreatedAt)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrSemesterDuplicate
		}
		return fmt.Errorf("create semester: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) ListSemesters(ctx context.Context) ([]*Semester, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, semester, tahun_ajaran, is_active, created_at
		FROM semesters ORDER BY tahun_ajaran DESC, semester DESC, created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list semesters: %w", err)
	}
	defer rows.Close()

	var out []*Semester
	for rows.Next() {
		s := &Semester{}
		var active int
		if err := rows.Scan(&s.ID, &s.Semester, &s.TahunAjaran, &active, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan semester: %w", err)
		}
		s.IsActive = active == 1
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) SetActiveSemester(ctx context.Context, id string) (*Semester, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	s := &Semester{}
	var active int
	err = tx.QueryRowContext(ctx, `SELECT id, semester, tahun_ajaran, created_at FROM semesters WHERE id=?`, id).
		Scan(&s.ID, &s.Semester, &s.TahunAjaran, &s.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrSemesterNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get semester: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE semesters SET is_active=0`); err != nil {
		return nil, fmt.Errorf("clear active: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE semesters SET is_active=1 WHERE id=?`, id); err != nil {
		return nil, fmt.Errorf("set active: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	s.IsActive = true
	_ = active
	return s, nil
}

func (r *sqliteSchoolRepository) DeleteSemester(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM semesters WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete semester: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrSemesterNotFound
	}
	return nil
}
