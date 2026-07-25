package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var (
	ErrSemesterNotFound  = errors.New("semester not found")
	ErrSemesterDuplicate = errors.New("semester already exists")
)

type SchoolService struct {
	repo repository.SchoolRepository
	jwt  *JWTService // issues exam tokens for PPDB applicants
	// deniedCaps caches the set of capability keys denied to teachers, so the
	// permission interceptor can check it without a DB hit per request.
	deniedCaps atomic.Pointer[map[string]bool]
}

func NewSchoolService(repo repository.SchoolRepository, jwt *JWTService) *SchoolService {
	s := &SchoolService{repo: repo, jwt: jwt}
	empty := map[string]bool{}
	s.deniedCaps.Store(&empty)
	return s
}

// LoadAccessPolicy populates the denied-capability cache from the DB. Call once
// at startup (composition root).
func (s *SchoolService) LoadAccessPolicy(ctx context.Context) error {
	keys, err := s.repo.ListDeniedCaps(ctx)
	if err != nil {
		return err
	}
	s.storeCaps(keys)
	return nil
}

func (s *SchoolService) storeCaps(keys []string) {
	m := make(map[string]bool, len(keys))
	for _, k := range keys {
		m[k] = true
	}
	s.deniedCaps.Store(&m)
}

// IsCapabilityDenied reports whether a capability key is globally denied to
// teachers. Read by the permission interceptor.
func (s *SchoolService) IsCapabilityDenied(key string) bool {
	m := s.deniedCaps.Load()
	if m == nil {
		return false
	}
	return (*m)[key]
}

// GetAccessPolicy returns the denied-capability keys. Admin-only.
func (s *SchoolService) GetAccessPolicy(ctx context.Context, callerRole string) ([]string, error) {
	if callerRole != "admin" {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListDeniedCaps(ctx)
}

// SetAccessPolicy replaces the denied-capability set and refreshes the cache. Admin-only.
func (s *SchoolService) SetAccessPolicy(ctx context.Context, callerRole string, keys []string) ([]string, error) {
	if callerRole != "admin" {
		return nil, ErrPermissionDenied
	}
	if err := s.repo.SetDeniedCaps(ctx, keys); err != nil {
		return nil, fmt.Errorf("set access policy: %w", err)
	}
	saved, err := s.repo.ListDeniedCaps(ctx)
	if err != nil {
		return nil, err
	}
	s.storeCaps(saved)
	return saved, nil
}

// ExportBackup returns a consistent DB snapshot and a suggested filename. Admin-only.
func (s *SchoolService) ExportBackup(ctx context.Context, callerRole string) ([]byte, string, error) {
	if callerRole != "admin" {
		return nil, "", ErrPermissionDenied
	}
	data, err := s.repo.ExportBackup(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("export backup: %w", err)
	}
	filename := fmt.Sprintf("lms-backup-%s.db", time.Now().Format("20060102-150405"))
	return data, filename, nil
}

func (s *SchoolService) GetSchool(ctx context.Context) (*repository.School, error) {
	school, err := s.repo.GetSchool(ctx)
	if err != nil {
		return nil, err
	}
	school.GameMusicName, school.HasGameMusic, _ = s.repo.GameMusicInfo(ctx)
	return school, nil
}

// UpdateSchoolInput carries only the fields the caller wants to change (nil =
// leave as-is), so partial edits from different screens don't wipe each other.
type UpdateSchoolInput struct {
	Name, Address, AppName, Logo, Profil, Visi, Misi, KepalaSekolah,
	TahunBerdiri, Email, Whatsapp, Npsn, Status, Akreditasi, Jenjang,
	ProfilImage, ProfilVideo, MapsURL, PpdbAktif, PpdbInfo, PpdbBrosur, PpdbDaftarURL, PpdbPengumuman,
	KepalaSekolahFoto, KepalaSekolahTtd,
	GameMusicData, GameMusicName *string // audio data URL ("" clears) + display name
}

func (s *SchoolService) UpdateSchool(ctx context.Context, callerRole string, in UpdateSchoolInput) (*repository.School, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	cur, err := s.repo.GetSchool(ctx)
	if err != nil {
		return nil, fmt.Errorf("get school: %w", err)
	}
	apply := func(dst *string, v *string, trim bool) {
		if v != nil {
			if trim {
				*dst = strings.TrimSpace(*v)
			} else {
				*dst = *v
			}
		}
	}
	apply(&cur.Name, in.Name, true)
	apply(&cur.Address, in.Address, true)
	apply(&cur.AppName, in.AppName, true)
	apply(&cur.Logo, in.Logo, false) // base64 — don't trim
	apply(&cur.Profil, in.Profil, false)
	apply(&cur.Visi, in.Visi, false)
	apply(&cur.Misi, in.Misi, false)
	apply(&cur.KepalaSekolah, in.KepalaSekolah, true)
	apply(&cur.TahunBerdiri, in.TahunBerdiri, true)
	apply(&cur.Email, in.Email, true)
	apply(&cur.Whatsapp, in.Whatsapp, true)
	apply(&cur.Npsn, in.Npsn, true)
	apply(&cur.Status, in.Status, true)
	apply(&cur.Akreditasi, in.Akreditasi, true)
	apply(&cur.Jenjang, in.Jenjang, true)
	apply(&cur.ProfilImage, in.ProfilImage, true)
	apply(&cur.ProfilVideo, in.ProfilVideo, true)
	apply(&cur.MapsURL, in.MapsURL, true)
	apply(&cur.PpdbAktif, in.PpdbAktif, true)
	apply(&cur.PpdbInfo, in.PpdbInfo, false)
	apply(&cur.PpdbBrosur, in.PpdbBrosur, false)
	apply(&cur.PpdbDaftarURL, in.PpdbDaftarURL, true)
	apply(&cur.PpdbPengumuman, in.PpdbPengumuman, false)
	apply(&cur.KepalaSekolahFoto, in.KepalaSekolahFoto, true)
	apply(&cur.KepalaSekolahTtd, in.KepalaSekolahTtd, false)
	out, err := s.repo.UpdateSchool(ctx, cur)
	if err != nil {
		return nil, err
	}
	// Game soundtrack is stored separately (the audio blob never rides the
	// generic school overwrite). Only touched when explicitly provided.
	if in.GameMusicData != nil {
		name := ""
		if in.GameMusicName != nil {
			name = strings.TrimSpace(*in.GameMusicName)
		}
		if err := s.repo.SetGameMusic(ctx, *in.GameMusicData, name); err != nil {
			return nil, err
		}
	}
	out.GameMusicName, out.HasGameMusic, _ = s.repo.GameMusicInfo(ctx)
	return out, nil
}

func (s *SchoolService) ListStaff(ctx context.Context) ([]*repository.Staff, error) {
	return s.repo.ListStaff(ctx)
}

func (s *SchoolService) SetStaff(ctx context.Context, callerRole string, staff []*repository.Staff) ([]*repository.Staff, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.SetStaff(ctx, staff)
}

func (s *SchoolService) ListContent(ctx context.Context, typ string) ([]*repository.ContentItem, error) {
	return s.repo.ListContent(ctx, typ)
}

func (s *SchoolService) SetContent(ctx context.Context, callerRole, typ string, items []*repository.ContentItem) ([]*repository.ContentItem, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if strings.TrimSpace(typ) == "" {
		return nil, fmt.Errorf("%w: tipe konten wajib", ErrInvalidArgument)
	}
	return s.repo.SetContent(ctx, typ, items)
}

func (s *SchoolService) ListSemesters(ctx context.Context) ([]*repository.Semester, error) {
	return s.repo.ListSemesters(ctx)
}

func (s *SchoolService) CreateSemester(ctx context.Context, callerRole, semester, tahunAjaran string) (*repository.Semester, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	semester = strings.ToLower(strings.TrimSpace(semester))
	tahunAjaran = strings.TrimSpace(tahunAjaran)
	if semester != "ganjil" && semester != "genap" {
		return nil, fmt.Errorf("semester harus 'ganjil' atau 'genap'")
	}
	if tahunAjaran == "" {
		return nil, fmt.Errorf("tahun ajaran wajib diisi")
	}
	// The first semester created becomes the active one.
	existing, _ := s.repo.ListSemesters(ctx)
	sem := &repository.Semester{
		ID: uuid.New().String(), Semester: semester, TahunAjaran: tahunAjaran,
		IsActive: len(existing) == 0, CreatedAt: time.Now().UTC(),
	}
	if err := s.repo.CreateSemester(ctx, sem); err != nil {
		if errors.Is(err, repository.ErrSemesterDuplicate) {
			return nil, ErrSemesterDuplicate
		}
		return nil, fmt.Errorf("create semester: %w", err)
	}
	return sem, nil
}

func (s *SchoolService) SetActiveSemester(ctx context.Context, callerRole, id string) (*repository.Semester, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	sem, err := s.repo.SetActiveSemester(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrSemesterNotFound) {
			return nil, ErrSemesterNotFound
		}
		return nil, fmt.Errorf("set active semester: %w", err)
	}
	return sem, nil
}

func (s *SchoolService) DeleteSemester(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.DeleteSemester(ctx, id); err != nil {
		if errors.Is(err, repository.ErrSemesterNotFound) {
			return ErrSemesterNotFound
		}
		return fmt.Errorf("delete semester: %w", err)
	}
	return nil
}

// ── PPDB registrations ──

var ppdbStatuses = map[string]bool{"baru": true, "diterima": true, "ditolak": true}

// SubmitPpdbRegistration is PUBLIC (no auth): a prospective student submits the
// admission form from the landing page.
func (s *SchoolService) SubmitPpdbRegistration(ctx context.Context, in *repository.PpdbRegistration) (*repository.PpdbRegistration, error) {
	in.Nama = strings.TrimSpace(in.Nama)
	if in.Nama == "" {
		return nil, fmt.Errorf("%w: nama calon murid wajib diisi", ErrInvalidArgument)
	}
	// Drop empty phone rows.
	clean := in.Phones[:0]
	for _, p := range in.Phones {
		if strings.TrimSpace(p.Number) != "" {
			clean = append(clean, repository.PpdbPhone{Label: strings.TrimSpace(p.Label), Number: strings.TrimSpace(p.Number)})
		}
	}
	in.Phones = clean
	if !PpdbJurusanValid[in.Jurusan] {
		return nil, fmt.Errorf("%w: pilih jurusan (TKJ/TKR/TPM/TSM)", ErrInvalidArgument)
	}
	// Registration must land in the currently open gelombang.
	batch, err := s.repo.GetActivePpdbBatch(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: pendaftaran belum dibuka", ErrInvalidArgument)
	}
	seq, _ := s.repo.CountPpdbInBatch(ctx, batch.ID)
	in.ID = uuid.New().String()
	in.BatchID = batch.ID
	in.NoPendaftaran = ppdbNoPendaftaran(batch, seq+1)
	in.Password = ppdbPassword()
	in.Status = "baru"
	in.TestScore = -1
	in.CreatedAt = time.Now().UTC()
	if err := s.repo.CreatePpdbRegistration(ctx, in); err != nil {
		return nil, err
	}
	return in, nil
}

func (s *SchoolService) ListPpdbRegistrations(ctx context.Context, callerRole, batchID, jurusan, search string) ([]*repository.PpdbRegistration, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if batchID == "" {
		if b, err := s.repo.GetActivePpdbBatch(ctx); err == nil {
			batchID = b.ID
		}
	}
	return s.repo.ListPpdbRegistrations(ctx, batchID, strings.TrimSpace(jurusan), strings.TrimSpace(search))
}

func (s *SchoolService) UpdatePpdbStatus(ctx context.Context, callerRole, id, status, catatan string) (*repository.PpdbRegistration, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if !ppdbStatuses[status] {
		return nil, fmt.Errorf("%w: status tidak valid", ErrInvalidArgument)
	}
	p, err := s.repo.UpdatePpdbStatus(ctx, id, status, strings.TrimSpace(catatan))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return p, nil
}

func (s *SchoolService) DeletePpdbRegistration(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	return s.repo.DeletePpdbRegistration(ctx, id)
}
