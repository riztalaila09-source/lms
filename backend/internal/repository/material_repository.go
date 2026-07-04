package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrMaterialNotFound = errors.New("material not found")

type Material struct {
	ID            string
	CourseID      string
	Title         string
	Description   string
	ContentType   string
	ContentURL    string
	ContentText   string
	OrderIndex    int
	IsPublished   bool
	CreatedByID   string
	CreatedByName string
	UpdatedByID   string
	UpdatedByName string
	CategoryID    string
	CategoryCode  string
	CategoryName  string
	CoverImage    string
	AvgRating     float64
	RatingCount   int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// materialSelect is the shared SELECT/JOIN that enriches a material row with its
// category code/name and the names of its creator and last editor.
const materialSelect = `
	SELECT m.id, m.course_id, m.title, m.description, m.content_type, m.content_url, m.content_text,
	       m.order_index, m.is_published, m.created_by, COALESCE(cu.full_name, ''),
	       m.updated_by, COALESCE(eu.full_name, ''),
	       m.category_id, COALESCE(cat.code, ''), COALESCE(cat.name, ''),
	       CASE WHEN m.cover_image <> '' THEN '/covers/' || m.id ELSE '' END,
	       COALESCE((SELECT AVG(stars) FROM material_ratings WHERE material_id = m.id), 0),
	       (SELECT COUNT(*) FROM material_ratings WHERE material_id = m.id),
	       m.created_at, m.updated_at
	FROM course_materials m
	LEFT JOIN users cu      ON cu.id = m.created_by
	LEFT JOIN users eu      ON eu.id = m.updated_by
	LEFT JOIN categories cat ON cat.id = m.category_id`

func scanMaterial(s interface{ Scan(...any) error }) (*Material, error) {
	m := &Material{}
	if err := s.Scan(&m.ID, &m.CourseID, &m.Title, &m.Description, &m.ContentType, &m.ContentURL, &m.ContentText,
		&m.OrderIndex, &m.IsPublished, &m.CreatedByID, &m.CreatedByName,
		&m.UpdatedByID, &m.UpdatedByName, &m.CategoryID, &m.CategoryCode, &m.CategoryName, &m.CoverImage,
		&m.AvgRating, &m.RatingCount, &m.CreatedAt, &m.UpdatedAt); err != nil {
		return nil, err
	}
	return m, nil
}

type MaterialListFilter struct {
	CourseID    string
	OnlyPublished bool
	Page        int
	PageSize    int
}

// MaterialSearchResult is a matched material plus the name of its course, used
// by the global search dropdown.
type MaterialSearchResult struct {
	*Material
	CourseName string
}

type MaterialRepository interface {
	Create(ctx context.Context, m *Material) error
	GetByID(ctx context.Context, id string) (*Material, error)
	Update(ctx context.Context, m *Material) error
	Delete(ctx context.Context, id string) error
	List(ctx context.Context, f MaterialListFilter) ([]*Material, int, error)
	// SearchMaterials matches title/description across accessible courses. When
	// studentID is non-empty the search is limited to Materi Umum + the student's
	// enrolled courses; onlyPublished hides drafts.
	SearchMaterials(ctx context.Context, query, studentID string, onlyPublished bool, limit int) ([]*MaterialSearchResult, error)
	// RateMaterial upserts a student's 1–5 star rating and returns the new average
	// and total number of ratings for the material.
	RateMaterial(ctx context.Context, materialID, studentID string, stars int) (float64, int, error)
}

type sqliteMaterialRepository struct{ db *sql.DB }

func NewMaterialRepository(db *sql.DB) MaterialRepository {
	return &sqliteMaterialRepository{db: db}
}

func (r *sqliteMaterialRepository) Create(ctx context.Context, m *Material) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO course_materials
		  (id, course_id, title, description, content_type, content_url, content_text,
		   order_index, is_published, created_by, updated_by, category_id, cover_image, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.CourseID, m.Title, m.Description, m.ContentType, m.ContentURL, m.ContentText,
		m.OrderIndex, m.IsPublished, m.CreatedByID, m.CreatedByID, m.CategoryID, m.CoverImage, m.CreatedAt, m.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create material: %w", err)
	}
	return nil
}

func (r *sqliteMaterialRepository) GetByID(ctx context.Context, id string) (*Material, error) {
	m, err := scanMaterial(r.db.QueryRowContext(ctx, materialSelect+` WHERE m.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMaterialNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get material: %w", err)
	}
	return m, nil
}

func (r *sqliteMaterialRepository) Update(ctx context.Context, m *Material) error {
	m.UpdatedAt = time.Now()
	// cover_image stores the raw data URL. GetByID returns it in the lean
	// "/covers/<id>" URL form, so never overwrite the column with that URL
	// (that would destroy the image on any edit). Keep the existing value when
	// the incoming cover is the URL form; only replace on a real data: URL or "".
	res, err := r.db.ExecContext(ctx, `
		UPDATE course_materials
		SET title=?, description=?, content_type=?, content_url=?, content_text=?,
		    order_index=?, is_published=?, category_id=?,
		    cover_image = CASE WHEN ? LIKE '/covers/%' THEN cover_image ELSE ? END,
		    updated_by=?, updated_at=?
		WHERE id=?`,
		m.Title, m.Description, m.ContentType, m.ContentURL, m.ContentText,
		m.OrderIndex, m.IsPublished, m.CategoryID, m.CoverImage, m.CoverImage, m.UpdatedByID, m.UpdatedAt, m.ID,
	)
	if err != nil {
		return fmt.Errorf("update material: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrMaterialNotFound
	}
	return nil
}

func (r *sqliteMaterialRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM course_materials WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete material: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrMaterialNotFound
	}
	return nil
}

func (r *sqliteMaterialRepository) List(ctx context.Context, f MaterialListFilter) ([]*Material, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 50
	}
	offset := (f.Page - 1) * f.PageSize

	where := "WHERE m.course_id = ?"
	args := []any{f.CourseID}

	if f.OnlyPublished {
		where += " AND m.is_published = 1"
	}

	var total int
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM course_materials m `+where, countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count materials: %w", err)
	}

	listArgs := append(args, f.PageSize, offset)
	rows, err := r.db.QueryContext(ctx,
		materialSelect+` `+where+`
		ORDER BY m.order_index ASC, m.created_at ASC LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list materials: %w", err)
	}
	defer rows.Close()

	var materials []*Material
	for rows.Next() {
		m, err := scanMaterial(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan material: %w", err)
		}
		materials = append(materials, m)
	}
	return materials, total, rows.Err()
}

func (r *sqliteMaterialRepository) SearchMaterials(ctx context.Context, query, studentID string, onlyPublished bool, limit int) ([]*MaterialSearchResult, error) {
	if limit <= 0 {
		limit = 20
	}
	like := "%" + query + "%"
	conds := []string{"(m.title LIKE ? OR m.description LIKE ?)"}
	args := []any{like, like}
	if onlyPublished {
		conds = append(conds, "m.is_published = 1")
	}
	if studentID != "" {
		conds = append(conds, "(m.course_id = 'general' OR m.course_id IN (SELECT course_id FROM course_enrollments WHERE student_id = ?))")
		args = append(args, studentID)
	}
	args = append(args, limit)

	// Dedicated query (materialSelect has its own FROM/JOINs) so we can add the
	// courses join and the course name column.
	q := `
		SELECT m.id, m.course_id, m.title, m.description, m.content_type, m.content_url, m.content_text,
		       m.order_index, m.is_published, m.created_by, COALESCE(cu.full_name, ''),
		       m.updated_by, COALESCE(eu.full_name, ''),
		       m.category_id, COALESCE(cat.code, ''), COALESCE(cat.name, ''),
		       CASE WHEN m.cover_image <> '' THEN '/covers/' || m.id ELSE '' END,
		       m.created_at, m.updated_at, c.name
		FROM course_materials m
		JOIN courses c           ON c.id = m.course_id
		LEFT JOIN users cu       ON cu.id = m.created_by
		LEFT JOIN users eu       ON eu.id = m.updated_by
		LEFT JOIN categories cat ON cat.id = m.category_id
		WHERE ` + strings.Join(conds, " AND ") + `
		ORDER BY m.is_published DESC, m.title ASC LIMIT ?`

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("search materials: %w", err)
	}
	defer rows.Close()

	var out []*MaterialSearchResult
	for rows.Next() {
		m := &Material{}
		var courseName string
		if err := rows.Scan(&m.ID, &m.CourseID, &m.Title, &m.Description, &m.ContentType, &m.ContentURL, &m.ContentText,
			&m.OrderIndex, &m.IsPublished, &m.CreatedByID, &m.CreatedByName,
			&m.UpdatedByID, &m.UpdatedByName, &m.CategoryID, &m.CategoryCode, &m.CategoryName, &m.CoverImage,
			&m.CreatedAt, &m.UpdatedAt, &courseName); err != nil {
			return nil, fmt.Errorf("scan search result: %w", err)
		}
		out = append(out, &MaterialSearchResult{Material: m, CourseName: courseName})
	}
	return out, rows.Err()
}

func (r *sqliteMaterialRepository) RateMaterial(ctx context.Context, materialID, studentID string, stars int) (float64, int, error) {
	if _, err := r.db.ExecContext(ctx, `
		INSERT INTO material_ratings (id, material_id, student_id, stars)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(material_id, student_id) DO UPDATE SET stars = excluded.stars`,
		uuid.New().String(), materialID, studentID, stars); err != nil {
		return 0, 0, fmt.Errorf("rate material: %w", err)
	}
	var avg float64
	var count int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(AVG(stars), 0), COUNT(*) FROM material_ratings WHERE material_id = ?`, materialID,
	).Scan(&avg, &count); err != nil {
		return 0, 0, fmt.Errorf("aggregate rating: %w", err)
	}
	return avg, count, nil
}
