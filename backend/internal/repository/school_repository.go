package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrSemesterNotFound = errors.New("semester not found")
var ErrSemesterDuplicate = errors.New("semester already exists")

type School struct {
	Name          string
	Address       string
	AppName       string
	Logo          string // base64 data URL
	Profil        string
	Visi          string
	Misi          string
	KepalaSekolah string
	TahunBerdiri  string
	Email         string
	Whatsapp      string
	Npsn          string
	Status        string
	Akreditasi    string
	Jenjang       string
	ProfilImage   string
	ProfilVideo   string
	MapsURL       string
	PpdbAktif     string
	PpdbInfo      string
	PpdbBrosur    string
	PpdbDaftarURL string
	PpdbPengumuman string
	KepalaSekolahFoto string
}

// Staff is a member of the guru / tata usaha directory.
type Staff struct {
	ID      string
	Nama    string
	Jabatan string
	Foto    string
}

const schoolCols = `name, address, app_name, logo, profil, visi, misi, kepala_sekolah, tahun_berdiri, email, whatsapp, npsn, status, akreditasi, jenjang, profil_image, profil_video, maps_url, ppdb_aktif, ppdb_info, ppdb_brosur, ppdb_daftar_url, ppdb_pengumuman, kepala_sekolah_foto`

func schoolScanDest(s *School) []any {
	return []any{&s.Name, &s.Address, &s.AppName, &s.Logo, &s.Profil, &s.Visi, &s.Misi, &s.KepalaSekolah,
		&s.TahunBerdiri, &s.Email, &s.Whatsapp, &s.Npsn, &s.Status, &s.Akreditasi, &s.Jenjang,
		&s.ProfilImage, &s.ProfilVideo, &s.MapsURL, &s.PpdbAktif, &s.PpdbInfo, &s.PpdbBrosur, &s.PpdbDaftarURL, &s.PpdbPengumuman, &s.KepalaSekolahFoto}
}

func schoolValues(s *School) []any {
	return []any{s.Name, s.Address, s.AppName, s.Logo, s.Profil, s.Visi, s.Misi, s.KepalaSekolah,
		s.TahunBerdiri, s.Email, s.Whatsapp, s.Npsn, s.Status, s.Akreditasi, s.Jenjang,
		s.ProfilImage, s.ProfilVideo, s.MapsURL, s.PpdbAktif, s.PpdbInfo, s.PpdbBrosur, s.PpdbDaftarURL, s.PpdbPengumuman, s.KepalaSekolahFoto}
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
	UpdateSchool(ctx context.Context, s *School) (*School, error)
	CreateSemester(ctx context.Context, s *Semester) error
	ListSemesters(ctx context.Context) ([]*Semester, error)
	SetActiveSemester(ctx context.Context, id string) (*Semester, error)
	DeleteSemester(ctx context.Context, id string) error
	ListStaff(ctx context.Context) ([]*Staff, error)
	// SetStaff replaces the whole staff directory with the given entries.
	SetStaff(ctx context.Context, staff []*Staff) ([]*Staff, error)
	ListContent(ctx context.Context, typ string) ([]*ContentItem, error)
	// SetContent replaces all items of a given type.
	SetContent(ctx context.Context, typ string, items []*ContentItem) ([]*ContentItem, error)
	// ListDeniedCaps returns the capability keys denied to teachers globally.
	ListDeniedCaps(ctx context.Context) ([]string, error)
	// SetDeniedCaps replaces the whole denied-capability set.
	SetDeniedCaps(ctx context.Context, keys []string) error
	// ExportBackup returns a consistent snapshot of the SQLite database file.
	ExportBackup(ctx context.Context) ([]byte, error)
}

// ContentItem is a generic public-site content row (galeri/jurusan/berita/…).
type ContentItem struct {
	ID       string
	Type     string
	Title    string
	Subtitle string
	Body     string
	Image    string
	URL      string
}

type sqliteSchoolRepository struct{ db *sql.DB }

func NewSchoolRepository(db *sql.DB) SchoolRepository {
	return &sqliteSchoolRepository{db: db}
}

func (r *sqliteSchoolRepository) GetSchool(ctx context.Context) (*School, error) {
	s := &School{}
	err := r.db.QueryRowContext(ctx, `SELECT `+schoolCols+` FROM school_settings WHERE id='default'`).Scan(schoolScanDest(s)...)
	if errors.Is(err, sql.ErrNoRows) {
		return s, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get school: %w", err)
	}
	return s, nil
}

func (r *sqliteSchoolRepository) UpdateSchool(ctx context.Context, s *School) (*School, error) {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO school_settings (id, `+schoolCols+`)
		 VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   name=excluded.name, address=excluded.address, app_name=excluded.app_name, logo=excluded.logo,
		   profil=excluded.profil, visi=excluded.visi, misi=excluded.misi, kepala_sekolah=excluded.kepala_sekolah,
		   tahun_berdiri=excluded.tahun_berdiri, email=excluded.email, whatsapp=excluded.whatsapp, npsn=excluded.npsn,
		   status=excluded.status, akreditasi=excluded.akreditasi, jenjang=excluded.jenjang,
		   profil_image=excluded.profil_image, profil_video=excluded.profil_video, maps_url=excluded.maps_url,
		   ppdb_aktif=excluded.ppdb_aktif, ppdb_info=excluded.ppdb_info, ppdb_brosur=excluded.ppdb_brosur,
		   ppdb_daftar_url=excluded.ppdb_daftar_url, ppdb_pengumuman=excluded.ppdb_pengumuman,
		   kepala_sekolah_foto=excluded.kepala_sekolah_foto`,
		schoolValues(s)...)
	if err != nil {
		return nil, fmt.Errorf("update school: %w", err)
	}
	return s, nil
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

func (r *sqliteSchoolRepository) ListStaff(ctx context.Context) ([]*Staff, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, nama, jabatan, foto FROM school_staff ORDER BY urutan ASC, created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("list staff: %w", err)
	}
	defer rows.Close()
	var out []*Staff
	for rows.Next() {
		st := &Staff{}
		if err := rows.Scan(&st.ID, &st.Nama, &st.Jabatan, &st.Foto); err != nil {
			return nil, fmt.Errorf("scan staff: %w", err)
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) SetStaff(ctx context.Context, staff []*Staff) ([]*Staff, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM school_staff`); err != nil {
		return nil, fmt.Errorf("clear staff: %w", err)
	}
	now := time.Now().UTC()
	for i, st := range staff {
		if strings.TrimSpace(st.Nama) == "" {
			continue // skip empty rows
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO school_staff (id, nama, jabatan, foto, urutan, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), strings.TrimSpace(st.Nama), strings.TrimSpace(st.Jabatan), st.Foto, i, now); err != nil {
			return nil, fmt.Errorf("insert staff: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return r.ListStaff(ctx)
}

func (r *sqliteSchoolRepository) ListContent(ctx context.Context, typ string) ([]*ContentItem, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, type, title, subtitle, body, image, url FROM school_content WHERE type = ? ORDER BY urutan ASC, created_at ASC`, typ)
	if err != nil {
		return nil, fmt.Errorf("list content: %w", err)
	}
	defer rows.Close()
	var out []*ContentItem
	for rows.Next() {
		c := &ContentItem{}
		if err := rows.Scan(&c.ID, &c.Type, &c.Title, &c.Subtitle, &c.Body, &c.Image, &c.URL); err != nil {
			return nil, fmt.Errorf("scan content: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) SetContent(ctx context.Context, typ string, items []*ContentItem) ([]*ContentItem, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM school_content WHERE type = ?`, typ); err != nil {
		return nil, fmt.Errorf("clear content: %w", err)
	}
	now := time.Now().UTC()
	for i, c := range items {
		// Skip fully-empty rows.
		if strings.TrimSpace(c.Title) == "" && strings.TrimSpace(c.Body) == "" && strings.TrimSpace(c.Image) == "" && strings.TrimSpace(c.URL) == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO school_content (id, type, title, subtitle, body, image, url, urutan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), typ, strings.TrimSpace(c.Title), strings.TrimSpace(c.Subtitle), c.Body, c.Image, strings.TrimSpace(c.URL), i, now); err != nil {
			return nil, fmt.Errorf("insert content: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return r.ListContent(ctx, typ)
}

func (r *sqliteSchoolRepository) ListDeniedCaps(ctx context.Context) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT key FROM access_policy ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("list denied caps: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, fmt.Errorf("scan cap: %w", err)
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) SetDeniedCaps(ctx context.Context, keys []string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM access_policy`); err != nil {
		return fmt.Errorf("clear access policy: %w", err)
	}
	seen := map[string]bool{}
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		if _, err := tx.ExecContext(ctx, `INSERT INTO access_policy (key) VALUES (?)`, k); err != nil {
			return fmt.Errorf("insert cap: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ExportBackup produces a consistent copy of the database via `VACUUM INTO`
// (safe even in WAL mode) and returns the resulting file's bytes.
func (r *sqliteSchoolRepository) ExportBackup(ctx context.Context) ([]byte, error) {
	f, err := os.CreateTemp("", "lms-backup-*.db")
	if err != nil {
		return nil, fmt.Errorf("temp file: %w", err)
	}
	tmp := f.Name()
	f.Close()
	os.Remove(tmp) // VACUUM INTO requires the target file to not exist
	defer os.Remove(tmp)

	if _, err := r.db.ExecContext(ctx, `VACUUM INTO ?`, tmp); err != nil {
		return nil, fmt.Errorf("vacuum into: %w", err)
	}
	data, err := os.ReadFile(tmp)
	if err != nil {
		return nil, fmt.Errorf("read backup: %w", err)
	}
	return data, nil
}
