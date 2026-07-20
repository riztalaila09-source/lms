package service

import (
	"context"
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
	// deniedCaps caches the set of capability keys denied to teachers, so the
	// permission interceptor can check it without a DB hit per request.
	deniedCaps atomic.Pointer[map[string]bool]
}

func NewSchoolService(repo repository.SchoolRepository) *SchoolService {
	s := &SchoolService{repo: repo}
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
	return s.repo.GetSchool(ctx)
}

// UpdateSchoolInput carries only the fields the caller wants to change (nil =
// leave as-is), so partial edits from different screens don't wipe each other.
type UpdateSchoolInput struct {
	Name, Address, AppName, Logo, Profil, Visi, Misi, KepalaSekolah,
	TahunBerdiri, Email, Whatsapp, Npsn, Status, Akreditasi, Jenjang,
	ProfilImage, ProfilVideo, MapsURL, PpdbAktif, PpdbInfo, PpdbBrosur, PpdbDaftarURL, PpdbPengumuman,
	KepalaSekolahFoto *string
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
	return s.repo.UpdateSchool(ctx, cur)
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
