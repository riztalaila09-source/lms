package repository

import (
	"context"
	"database/sql"
	"encoding/json"
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
	// Game soundtrack — read-only summary (the audio blob is never loaded here;
	// it is streamed by /game-music). Set via SetGameMusic.
	HasGameMusic  bool
	GameMusicName string
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
	// SetGameMusic stores (or clears, when data=="") the uploaded game soundtrack.
	SetGameMusic(ctx context.Context, dataURL, name string) error
	// GameMusicInfo returns the track name and whether a soundtrack is set.
	GameMusicInfo(ctx context.Context) (name string, has bool, err error)
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
	// PPDB applicant registrations.
	CreatePpdbRegistration(ctx context.Context, p *PpdbRegistration) error
	ListPpdbRegistrations(ctx context.Context, batchID, jurusan, search string) ([]*PpdbRegistration, error)
	UpdatePpdbStatus(ctx context.Context, id, status, catatan string) (*PpdbRegistration, error)
	DeletePpdbRegistration(ctx context.Context, id string) error
	GetPpdbRegistration(ctx context.Context, id string) (*PpdbRegistration, error)
	GetPpdbRegistrationByNo(ctx context.Context, no string) (*PpdbRegistration, error)
	CountPpdbInBatch(ctx context.Context, batchID string) (int, error)
	SetPpdbTestStarted(ctx context.Context, id string) error
	SavePpdbTest(ctx context.Context, id string, score int, answers []PpdbTestAnswer) error
	// PPDB gelombang (batches).
	CreatePpdbBatch(ctx context.Context, b *PpdbBatch) error
	UpdatePpdbBatch(ctx context.Context, b *PpdbBatch) error
	SetPpdbBrosur(ctx context.Context, id, dataURL string) error
	ListPpdbBatches(ctx context.Context) ([]*PpdbBatch, error)
	GetPpdbBatch(ctx context.Context, id string) (*PpdbBatch, error)
	GetActivePpdbBatch(ctx context.Context) (*PpdbBatch, error)
	SetActivePpdbBatch(ctx context.Context, id string) error
	DeletePpdbBatch(ctx context.Context, id string) error
	PpdbBrosur(ctx context.Context, batchID string) (string, error)
	// PPDB bank soal.
	ListPpdbQuestions(ctx context.Context, batchID string) ([]*PpdbQuestion, error)
	SetPpdbQuestions(ctx context.Context, batchID string, qs []*PpdbQuestion) error
	// PPDB dokumen pendaftar.
	SetPpdbDocLink(ctx context.Context, id, docLink string) error
	AddPpdbDocument(ctx context.Context, regID, name, dataURL string) (string, error)
	ListPpdbDocuments(ctx context.Context, regID string) ([]PpdbDoc, error)
}

// PpdbPhone is one labeled contact number of a PPDB applicant.
type PpdbPhone struct {
	Label  string `json:"label"`
	Number string `json:"number"`
}

// PpdbRegistration is a prospective-student admission form submission.
type PpdbRegistration struct {
	ID           string
	Nama         string
	TempatLahir  string
	TanggalLahir string
	JenisKelamin string
	AsalSekolah  string
	Jurusan      string
	NamaOrtu     string
	Alamat       string
	Email        string
	Nisn         string
	NoKK         string
	Phones        []PpdbPhone
	Status        string
	Catatan       string
	CreatedAt     time.Time
	BatchID       string
	NoPendaftaran string
	Password      string // exam credential (password_plain)
	TestScore     int    // -1 = belum ujian
	TestSubmitted bool
	TahunAjaran   string // from batch (filled by list join)
	Gelombang     int
	DocLink       string
	Docs          []PpdbDoc // uploaded document files (metadata; loaded on demand)
}

// PpdbDoc is one uploaded document file's metadata (data streamed at /ppdb-doc).
type PpdbDoc struct {
	ID   string
	Name string
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

func (r *sqliteSchoolRepository) SetGameMusic(ctx context.Context, dataURL, name string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO school_settings (id, game_music_data, game_music_name) VALUES ('default', ?, ?)
		ON CONFLICT(id) DO UPDATE SET game_music_data=excluded.game_music_data, game_music_name=excluded.game_music_name`,
		dataURL, name)
	if err != nil {
		return fmt.Errorf("set game music: %w", err)
	}
	return nil
}

const ppdbCols = `id, nama, tempat_lahir, tanggal_lahir, jenis_kelamin, asal_sekolah, jurusan, nama_ortu, alamat, email, nisn, no_kk, phones, status, catatan, created_at, batch_id, no_pendaftaran, password_plain, test_score, test_submitted, doc_link`

func scanPpdb(row interface{ Scan(...any) error }) (*PpdbRegistration, error) {
	p := &PpdbRegistration{}
	var phonesJSON string
	if err := row.Scan(&p.ID, &p.Nama, &p.TempatLahir, &p.TanggalLahir, &p.JenisKelamin, &p.AsalSekolah,
		&p.Jurusan, &p.NamaOrtu, &p.Alamat, &p.Email, &p.Nisn, &p.NoKK, &phonesJSON, &p.Status, &p.Catatan, &p.CreatedAt,
		&p.BatchID, &p.NoPendaftaran, &p.Password, &p.TestScore, &p.TestSubmitted, &p.DocLink); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(phonesJSON), &p.Phones)
	return p, nil
}

func (r *sqliteSchoolRepository) CreatePpdbRegistration(ctx context.Context, p *PpdbRegistration) error {
	phones, _ := json.Marshal(p.Phones)
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO ppdb_registrations (id, nama, tempat_lahir, tanggal_lahir, jenis_kelamin, asal_sekolah, jurusan, nama_ortu, alamat, email, nisn, no_kk, phones, status, catatan, batch_id, no_pendaftaran, password_plain)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'baru', '', ?, ?, ?)`,
		p.ID, p.Nama, p.TempatLahir, p.TanggalLahir, p.JenisKelamin, p.AsalSekolah, p.Jurusan, p.NamaOrtu, p.Alamat, p.Email, p.Nisn, p.NoKK, string(phones),
		p.BatchID, p.NoPendaftaran, p.Password)
	if err != nil {
		return fmt.Errorf("create ppdb registration: %w", err)
	}
	return nil
}

// ListPpdbRegistrations returns registrations of a batch (or all if batchID==""),
// filtered by jurusan/name, ranked by test score desc then registration order.
func (r *sqliteSchoolRepository) ListPpdbRegistrations(ctx context.Context, batchID, jurusan, search string) ([]*PpdbRegistration, error) {
	q := `SELECT reg.id, reg.nama, reg.tempat_lahir, reg.tanggal_lahir, reg.jenis_kelamin, reg.asal_sekolah, reg.jurusan, reg.nama_ortu, reg.alamat, reg.email, reg.nisn, reg.no_kk, reg.phones, reg.status, reg.catatan, reg.created_at, reg.batch_id, reg.no_pendaftaran, reg.password_plain, reg.test_score, reg.test_submitted, reg.doc_link, COALESCE(b.tahun_ajaran,''), COALESCE(b.gelombang,0)
		FROM ppdb_registrations reg LEFT JOIN ppdb_batches b ON b.id = reg.batch_id WHERE 1=1`
	args := []any{}
	if batchID != "" {
		q += ` AND reg.batch_id = ?`
		args = append(args, batchID)
	}
	if jurusan != "" {
		q += ` AND reg.jurusan = ?`
		args = append(args, jurusan)
	}
	if search != "" {
		q += ` AND reg.nama LIKE ?`
		args = append(args, "%"+search+"%")
	}
	q += ` ORDER BY reg.test_score DESC, reg.created_at ASC`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list ppdb: %w", err)
	}
	defer rows.Close()
	var out []*PpdbRegistration
	for rows.Next() {
		p := &PpdbRegistration{}
		var phonesJSON string
		if err := rows.Scan(&p.ID, &p.Nama, &p.TempatLahir, &p.TanggalLahir, &p.JenisKelamin, &p.AsalSekolah,
			&p.Jurusan, &p.NamaOrtu, &p.Alamat, &p.Email, &p.Nisn, &p.NoKK, &phonesJSON, &p.Status, &p.Catatan, &p.CreatedAt,
			&p.BatchID, &p.NoPendaftaran, &p.Password, &p.TestScore, &p.TestSubmitted, &p.DocLink, &p.TahunAjaran, &p.Gelombang); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(phonesJSON), &p.Phones)
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) UpdatePpdbStatus(ctx context.Context, id, status, catatan string) (*PpdbRegistration, error) {
	res, err := r.db.ExecContext(ctx, `UPDATE ppdb_registrations SET status = ?, catatan = ? WHERE id = ?`, status, catatan, id)
	if err != nil {
		return nil, fmt.Errorf("update ppdb status: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, sql.ErrNoRows
	}
	return scanPpdb(r.db.QueryRowContext(ctx, `SELECT `+ppdbCols+` FROM ppdb_registrations WHERE id = ?`, id))
}

func (r *sqliteSchoolRepository) DeletePpdbRegistration(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM ppdb_registrations WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete ppdb: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) GameMusicInfo(ctx context.Context) (string, bool, error) {
	var name string
	var has bool
	err := r.db.QueryRowContext(ctx,
		`SELECT game_music_name, game_music_data <> '' FROM school_settings WHERE id='default'`).Scan(&name, &has)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("game music info: %w", err)
	}
	return name, has, nil
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
