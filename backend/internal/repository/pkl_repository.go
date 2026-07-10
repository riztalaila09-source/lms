package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

var (
	ErrPklNotFound  = errors.New("mitra PKL tidak ditemukan")
	ErrPklDuplicate = errors.New("siswa sudah memiliki tempat PKL")
)

type PklPartner struct {
	ID             string
	Name           string
	Alamat         string
	Deskripsi      string
	MapsURL        string
	Lat            float64
	Lng            float64
	KontakWA       string
	BidangUsaha    string
	JobRequirement string
	Logo           string
	Kuota          int
	Terisi         int
	AppliedByMe    bool
	CreatedBy      string // user id
	CreatedByName  string // display name (from join)
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type PklApplicant struct {
	StudentID string
	Name      string
	Kelas     string
	AppliedAt time.Time
}

type PklRepository interface {
	Create(ctx context.Context, p *PklPartner) error
	Update(ctx context.Context, p *PklPartner) error
	Delete(ctx context.Context, id string) error
	GetByID(ctx context.Context, id, callerID string) (*PklPartner, error)
	List(ctx context.Context, callerID string) ([]*PklPartner, error)
	CountApplications(ctx context.Context, partnerID string) (int, error)
	HasApplication(ctx context.Context, studentID string) (bool, error)
	Apply(ctx context.Context, partnerID, studentID string) error
	CancelApply(ctx context.Context, studentID string) error
	MyApplicationPartnerID(ctx context.Context, studentID string) (string, bool, error)
	ListApplicants(ctx context.Context, partnerID string) ([]*PklApplicant, error)
}

type sqlitePklRepository struct{ db *sql.DB }

func NewPklRepository(db *sql.DB) PklRepository { return &sqlitePklRepository{db: db} }

const pklCols = `p.id, p.name, p.alamat, p.deskripsi, p.maps_url, p.lat, p.lng, p.kontak_wa,
	p.bidang_usaha, p.job_requirement, p.logo, p.kuota, u.full_name, p.created_at, p.updated_at,
	(SELECT COUNT(*) FROM pkl_applications a WHERE a.partner_id = p.id),
	EXISTS(SELECT 1 FROM pkl_applications a WHERE a.partner_id = p.id AND a.student_id = ?)`

func scanPartner(row interface{ Scan(...any) error }) (*PklPartner, error) {
	p := &PklPartner{}
	var appliedByMe int
	err := row.Scan(&p.ID, &p.Name, &p.Alamat, &p.Deskripsi, &p.MapsURL, &p.Lat, &p.Lng, &p.KontakWA,
		&p.BidangUsaha, &p.JobRequirement, &p.Logo, &p.Kuota, &p.CreatedByName, &p.CreatedAt, &p.UpdatedAt,
		&p.Terisi, &appliedByMe)
	p.AppliedByMe = appliedByMe == 1
	return p, err
}

func (r *sqlitePklRepository) Create(ctx context.Context, p *PklPartner) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO pkl_partners (id, name, alamat, deskripsi, maps_url, lat, lng, kontak_wa, bidang_usaha, job_requirement, logo, kuota, created_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Alamat, p.Deskripsi, p.MapsURL, p.Lat, p.Lng, p.KontakWA, p.BidangUsaha, p.JobRequirement, p.Logo, p.Kuota, p.CreatedBy, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create partner: %w", err)
	}
	return nil
}

func (r *sqlitePklRepository) Update(ctx context.Context, p *PklPartner) error {
	p.UpdatedAt = time.Now()
	res, err := r.db.ExecContext(ctx, `
		UPDATE pkl_partners SET name=?, alamat=?, deskripsi=?, maps_url=?, lat=?, lng=?, kontak_wa=?, bidang_usaha=?, job_requirement=?, logo=?, kuota=?, updated_at=?
		WHERE id=?`,
		p.Name, p.Alamat, p.Deskripsi, p.MapsURL, p.Lat, p.Lng, p.KontakWA, p.BidangUsaha, p.JobRequirement, p.Logo, p.Kuota, p.UpdatedAt, p.ID)
	if err != nil {
		return fmt.Errorf("update partner: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrPklNotFound
	}
	return nil
}

func (r *sqlitePklRepository) Delete(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM pkl_partners WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete partner: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrPklNotFound
	}
	return nil
}

func (r *sqlitePklRepository) GetByID(ctx context.Context, id, callerID string) (*PklPartner, error) {
	p, err := scanPartner(r.db.QueryRowContext(ctx,
		`SELECT `+pklCols+` FROM pkl_partners p JOIN users u ON u.id = p.created_by WHERE p.id = ?`, callerID, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPklNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get partner: %w", err)
	}
	return p, nil
}

func (r *sqlitePklRepository) List(ctx context.Context, callerID string) ([]*PklPartner, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+pklCols+` FROM pkl_partners p JOIN users u ON u.id = p.created_by ORDER BY p.created_at DESC`, callerID)
	if err != nil {
		return nil, fmt.Errorf("list partners: %w", err)
	}
	defer rows.Close()
	var out []*PklPartner
	for rows.Next() {
		p, err := scanPartner(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *sqlitePklRepository) CountApplications(ctx context.Context, partnerID string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pkl_applications WHERE partner_id=?`, partnerID).Scan(&n)
	return n, err
}

func (r *sqlitePklRepository) HasApplication(ctx context.Context, studentID string) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pkl_applications WHERE student_id=?`, studentID).Scan(&n)
	return n > 0, err
}

func (r *sqlitePklRepository) Apply(ctx context.Context, partnerID, studentID string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO pkl_applications (id, partner_id, student_id, applied_at) VALUES (?, ?, ?, ?)`,
		uuid.New().String(), partnerID, studentID, time.Now().UTC())
	if err != nil {
		if isSQLiteConstraintError(err) {
			return ErrPklDuplicate
		}
		return fmt.Errorf("apply: %w", err)
	}
	return nil
}

func (r *sqlitePklRepository) CancelApply(ctx context.Context, studentID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM pkl_applications WHERE student_id=?`, studentID)
	if err != nil {
		return fmt.Errorf("cancel apply: %w", err)
	}
	return nil
}

func (r *sqlitePklRepository) MyApplicationPartnerID(ctx context.Context, studentID string) (string, bool, error) {
	var pid string
	err := r.db.QueryRowContext(ctx, `SELECT partner_id FROM pkl_applications WHERE student_id=?`, studentID).Scan(&pid)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("my application: %w", err)
	}
	return pid, true, nil
}

func (r *sqlitePklRepository) ListApplicants(ctx context.Context, partnerID string) ([]*PklApplicant, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.student_id, u.full_name, u.kelas, a.applied_at
		FROM pkl_applications a JOIN users u ON u.id = a.student_id
		WHERE a.partner_id=? ORDER BY a.applied_at ASC`, partnerID)
	if err != nil {
		return nil, fmt.Errorf("list applicants: %w", err)
	}
	defer rows.Close()
	var out []*PklApplicant
	for rows.Next() {
		a := &PklApplicant{}
		if err := rows.Scan(&a.StudentID, &a.Name, &a.Kelas, &a.AppliedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
