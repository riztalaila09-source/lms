package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrCategoryNotFound = errors.New("category not found")
var ErrCategoryDuplicate = errors.New("category already exists")

type Category struct {
	ID        string
	Code      string
	Name      string
	CreatedAt time.Time
}

type CategoryRepository interface {
	Create(ctx context.Context, c *Category) error
	List(ctx context.Context) ([]*Category, error)
	Delete(ctx context.Context, id string) error
}

type sqliteCategoryRepository struct{ db *sql.DB }

func NewCategoryRepository(db *sql.DB) CategoryRepository {
	return &sqliteCategoryRepository{db: db}
}

func (r *sqliteCategoryRepository) Create(ctx context.Context, c *Category) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO categories (id, code, name, created_at) VALUES (?, ?, ?, ?)`,
		c.ID, c.Code, c.Name, c.CreatedAt)
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrCategoryDuplicate
		}
		return fmt.Errorf("create category: %w", err)
	}
	return nil
}

func (r *sqliteCategoryRepository) List(ctx context.Context) ([]*Category, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, code, name, created_at FROM categories ORDER BY code ASC`)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()

	var out []*Category
	for rows.Next() {
		c := &Category{}
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *sqliteCategoryRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM categories WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete category: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrCategoryNotFound
	}
	return nil
}
