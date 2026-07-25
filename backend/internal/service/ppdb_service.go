package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

// PpdbJurusanValid is the fixed set of majors offered via PPDB.
var PpdbJurusanValid = map[string]bool{"TKJ": true, "TKR": true, "TPM": true, "TSM": true}

// ppdbNoPendaftaran builds a human registration id, e.g. "2627-G1-0001".
func ppdbNoPendaftaran(b *repository.PpdbBatch, seq int) string {
	short := strings.ReplaceAll(b.TahunAjaran, "/", "")
	if parts := strings.Split(b.TahunAjaran, "/"); len(parts) == 2 && len(parts[0]) >= 2 && len(parts[1]) >= 2 {
		short = parts[0][len(parts[0])-2:] + parts[1][len(parts[1])-2:]
	}
	return fmt.Sprintf("%s-G%d-%04d", short, b.Gelombang, seq)
}

func ppdbPassword() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no ambiguous 0/O/1/I/l
	b := make([]byte, 6)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func ppdbNotFound(err error) error {
	if errors.Is(err, repository.ErrPpdbNotFound) {
		return ErrNotFound
	}
	return err
}

// ── gelombang (batches) ──

func (s *SchoolService) GetActivePpdbBatch(ctx context.Context) (*repository.PpdbBatch, error) {
	return s.repo.GetActivePpdbBatch(ctx) // caller maps ErrPpdbNotFound → empty
}

func (s *SchoolService) ListPpdbBatches(ctx context.Context, callerRole string) ([]*repository.PpdbBatch, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListPpdbBatches(ctx)
}

func (s *SchoolService) CreatePpdbBatch(ctx context.Context, callerRole, tahunAjaran string, gelombang int) (*repository.PpdbBatch, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	tahunAjaran = strings.TrimSpace(tahunAjaran)
	if tahunAjaran == "" {
		return nil, fmt.Errorf("%w: tahun ajaran wajib", ErrInvalidArgument)
	}
	if gelombang < 1 || gelombang > 4 {
		return nil, fmt.Errorf("%w: gelombang harus 1..4", ErrInvalidArgument)
	}
	b := &repository.PpdbBatch{
		ID: uuid.New().String(), TahunAjaran: tahunAjaran, Gelombang: gelombang,
		Nama: fmt.Sprintf("Gelombang %d", gelombang), TestDurationMinutes: 60,
		RequiredDocs: []string{}, Kuota: map[string]int32{},
	}
	if err := s.repo.CreatePpdbBatch(ctx, b); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, fmt.Errorf("%w: gelombang %d tahun %s sudah ada", ErrInvalidArgument, gelombang, tahunAjaran)
		}
		return nil, err
	}
	return s.repo.GetPpdbBatch(ctx, b.ID)
}

// PpdbBatchUpdate carries optional patches; RequiredDocs & Kuota are full-replace.
type PpdbBatchUpdate struct {
	ID                                            string
	Buka, Tutup, Brosur, DriveLink, Panduan, Nama *string
	RequiredDocs                                  []string
	Kuota                                         map[string]int32
	TestActive                                    *bool
	TestDurationMinutes                           *int
}

func (s *SchoolService) UpdatePpdbBatch(ctx context.Context, callerRole string, in PpdbBatchUpdate) (*repository.PpdbBatch, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	cur, err := s.repo.GetPpdbBatch(ctx, in.ID)
	if err != nil {
		return nil, ppdbNotFound(err)
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
	apply(&cur.Nama, in.Nama, true)
	apply(&cur.Buka, in.Buka, true)
	apply(&cur.Tutup, in.Tutup, true)
	apply(&cur.DriveLink, in.DriveLink, true)
	apply(&cur.Panduan, in.Panduan, false)
	cur.RequiredDocs = in.RequiredDocs
	cur.Kuota = in.Kuota
	if in.TestActive != nil {
		cur.TestActive = *in.TestActive
	}
	if in.TestDurationMinutes != nil && *in.TestDurationMinutes > 0 {
		cur.TestDurationMinutes = *in.TestDurationMinutes
	}
	if err := s.repo.UpdatePpdbBatch(ctx, cur); err != nil {
		return nil, err
	}
	if in.Brosur != nil {
		if err := s.repo.SetPpdbBrosur(ctx, in.ID, *in.Brosur); err != nil {
			return nil, err
		}
	}
	return s.repo.GetPpdbBatch(ctx, in.ID)
}

func (s *SchoolService) SetActivePpdbBatch(ctx context.Context, callerRole, id string) (*repository.PpdbBatch, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if err := s.repo.SetActivePpdbBatch(ctx, id); err != nil {
		return nil, ppdbNotFound(err)
	}
	return s.repo.GetPpdbBatch(ctx, id)
}

func (s *SchoolService) DeletePpdbBatch(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	return s.repo.DeletePpdbBatch(ctx, id)
}

// ── bank soal ──

func (s *SchoolService) ListPpdbQuestions(ctx context.Context, callerRole, batchID string) ([]*repository.PpdbQuestion, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListPpdbQuestions(ctx, batchID)
}

func (s *SchoolService) SetPpdbQuestions(ctx context.Context, callerRole, batchID string, qs []*repository.PpdbQuestion) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if batchID == "" {
		return fmt.Errorf("%w: gelombang wajib", ErrInvalidArgument)
	}
	return s.repo.SetPpdbQuestions(ctx, batchID, qs)
}

// ── ujian pendaftar ──

type PpdbLoginResult struct {
	Token string
	Reg   *repository.PpdbRegistration
	Batch *repository.PpdbBatch
}

func (s *SchoolService) PpdbLogin(ctx context.Context, no, password string) (*PpdbLoginResult, error) {
	reg, err := s.repo.GetPpdbRegistrationByNo(ctx, strings.TrimSpace(no))
	if err != nil {
		if errors.Is(err, repository.ErrPpdbNotFound) {
			return nil, fmt.Errorf("%w: nomor/password salah", ErrPermissionDenied)
		}
		return nil, err
	}
	if reg.Password == "" || reg.Password != strings.TrimSpace(password) {
		return nil, fmt.Errorf("%w: nomor/password salah", ErrPermissionDenied)
	}
	token, err := s.jwt.GenerateToken(reg.ID, "ppdb", nil)
	if err != nil {
		return nil, err
	}
	batch, _ := s.repo.GetPpdbBatch(ctx, reg.BatchID)
	return &PpdbLoginResult{Token: token, Reg: reg, Batch: batch}, nil
}

func (s *SchoolService) GetPpdbTest(ctx context.Context, callerRole, regID string) (qs []*repository.PpdbQuestion, durationMin int, submitted bool, err error) {
	if callerRole != "ppdb" {
		return nil, 0, false, ErrPermissionDenied
	}
	reg, err := s.repo.GetPpdbRegistration(ctx, regID)
	if err != nil {
		return nil, 0, false, ppdbNotFound(err)
	}
	batch, err := s.repo.GetPpdbBatch(ctx, reg.BatchID)
	if err != nil {
		return nil, 0, false, ppdbNotFound(err)
	}
	if !batch.TestActive {
		return nil, 0, false, fmt.Errorf("%w: ujian belum dibuka", ErrInvalidArgument)
	}
	if reg.TestSubmitted {
		return nil, batch.TestDurationMinutes, true, nil
	}
	qs, err = s.repo.ListPpdbQuestions(ctx, batch.ID)
	if err != nil {
		return nil, 0, false, err
	}
	_ = s.repo.SetPpdbTestStarted(ctx, regID)
	return qs, batch.TestDurationMinutes, false, nil
}

func (s *SchoolService) SubmitPpdbTest(ctx context.Context, callerRole, regID string, answers map[int]int) (score, correct, total int, err error) {
	if callerRole != "ppdb" {
		return 0, 0, 0, ErrPermissionDenied
	}
	reg, err := s.repo.GetPpdbRegistration(ctx, regID)
	if err != nil {
		return 0, 0, 0, ppdbNotFound(err)
	}
	if reg.TestSubmitted {
		return 0, 0, 0, fmt.Errorf("%w: ujian sudah dikumpulkan", ErrInvalidArgument)
	}
	qs, err := s.repo.ListPpdbQuestions(ctx, reg.BatchID)
	if err != nil {
		return 0, 0, 0, err
	}
	total = len(qs)
	if total == 0 {
		return 0, 0, 0, fmt.Errorf("%w: belum ada soal", ErrInvalidArgument)
	}
	saved := make([]repository.PpdbTestAnswer, 0, total)
	for i, q := range qs {
		opt, ok := answers[i]
		isCorrect := ok && opt == q.CorrectIndex
		if isCorrect {
			correct++
		}
		if !ok {
			opt = -1
		}
		saved = append(saved, repository.PpdbTestAnswer{QuestionIndex: i, OptionIndex: opt, IsCorrect: isCorrect})
	}
	score = (correct*100 + total/2) / total
	if err := s.repo.SavePpdbTest(ctx, regID, score, saved); err != nil {
		return 0, 0, 0, err
	}
	if b, e := s.repo.GetPpdbBatch(ctx, reg.BatchID); e == nil {
		s.refreshPpdbAnnouncement(ctx, b.TahunAjaran) // best-effort auto-refresh
	}
	return score, correct, total, nil
}

// ── dokumen pendaftar ──

type PpdbDocFile struct{ Name, Data string }

const ppdbMaxDocBytes = 6 * 1024 * 1024 // ~6MB per uploaded file (data URL length)

// SubmitPpdbDocuments is PUBLIC: an applicant (identified by their registration
// id from the submit response) saves a Google Drive link and/or uploads files.
func (s *SchoolService) SubmitPpdbDocuments(ctx context.Context, regID, docLink string, files []PpdbDocFile) (int, error) {
	if strings.TrimSpace(regID) == "" {
		return 0, fmt.Errorf("%w: pendaftaran tidak dikenali", ErrInvalidArgument)
	}
	if _, err := s.repo.GetPpdbRegistration(ctx, regID); err != nil {
		return 0, ppdbNotFound(err)
	}
	if err := s.repo.SetPpdbDocLink(ctx, regID, strings.TrimSpace(docLink)); err != nil {
		return 0, err
	}
	uploaded := 0
	for _, f := range files {
		if strings.TrimSpace(f.Data) == "" {
			continue
		}
		if len(f.Data) > ppdbMaxDocBytes {
			return uploaded, fmt.Errorf("%w: ukuran file terlalu besar (maks 4MB)", ErrInvalidArgument)
		}
		name := strings.TrimSpace(f.Name)
		if name == "" {
			name = "dokumen"
		}
		if _, err := s.repo.AddPpdbDocument(ctx, regID, name, f.Data); err != nil {
			return uploaded, err
		}
		uploaded++
	}
	return uploaded, nil
}

func (s *SchoolService) ListPpdbDocuments(ctx context.Context, callerRole, regID string) ([]repository.PpdbDoc, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListPpdbDocuments(ctx, regID)
}

func (s *SchoolService) GetMyPpdb(ctx context.Context, callerRole, regID string) (*repository.PpdbRegistration, error) {
	if callerRole != "ppdb" {
		return nil, ErrPermissionDenied
	}
	reg, err := s.repo.GetPpdbRegistration(ctx, regID)
	if err != nil {
		return nil, ppdbNotFound(err)
	}
	return reg, nil
}

// ── pengumuman hasil seleksi (konten type 'pengumuman') ──

func ppdbAnnouncementTitle(tahun string) string { return "Hasil Seleksi PPDB — TA " + tahun }

func (s *SchoolService) buildPpdbAnnouncementItem(tahun string, rows []*repository.PpdbRegistration) *repository.ContentItem {
	var b strings.Builder
	for i, r := range rows {
		fmt.Fprintf(&b, "%d. %s — %s — Nilai %d\n", i+1, r.Nama, r.Jurusan, r.TestScore)
	}
	body := strings.TrimRight(b.String(), "\n")
	if body == "" {
		body = "Belum ada peserta yang diterima & sudah memiliki nilai ujian."
	}
	now := time.Now().In(wib).Format("02-01-2006 15:04")
	return &repository.ContentItem{
		Type:     "pengumuman",
		Title:    ppdbAnnouncementTitle(tahun),
		Subtitle: fmt.Sprintf("Diurutkan berdasar nilai ujian · %d peserta diterima · diperbarui %s WIB", len(rows), now),
		Body:     body,
	}
}

// mergePpdbAnnouncement prepends the announcement into the 'pengumuman' content,
// replacing any previous auto-generated item (same title). Manual items are kept.
func (s *SchoolService) mergePpdbAnnouncement(ctx context.Context, item *repository.ContentItem) error {
	cur, err := s.repo.ListContent(ctx, "pengumuman")
	if err != nil {
		return err
	}
	out := make([]*repository.ContentItem, 0, len(cur)+1)
	out = append(out, item)
	for _, c := range cur {
		if c.Title != item.Title {
			out = append(out, c)
		}
	}
	_, err = s.repo.SetContent(ctx, "pengumuman", out)
	return err
}

// PublishPpdbAnnouncement generates/refreshes the ranked acceptance announcement
// for a school year (all gelombang combined). Admin-only.
func (s *SchoolService) PublishPpdbAnnouncement(ctx context.Context, callerRole, tahunAjaran string) (int, error) {
	if !isManager(callerRole) {
		return 0, ErrPermissionDenied
	}
	tahunAjaran = strings.TrimSpace(tahunAjaran)
	if tahunAjaran == "" {
		return 0, fmt.Errorf("%w: tahun ajaran wajib", ErrInvalidArgument)
	}
	rows, err := s.repo.ListPpdbAcceptedByYear(ctx, tahunAjaran)
	if err != nil {
		return 0, err
	}
	if err := s.mergePpdbAnnouncement(ctx, s.buildPpdbAnnouncementItem(tahunAjaran, rows)); err != nil {
		return 0, err
	}
	return len(rows), nil
}

// refreshPpdbAnnouncement re-generates the announcement ONLY if one was already
// published for that year (title present). Best-effort, no role check (internal).
func (s *SchoolService) refreshPpdbAnnouncement(ctx context.Context, tahunAjaran string) {
	if strings.TrimSpace(tahunAjaran) == "" {
		return
	}
	cur, err := s.repo.ListContent(ctx, "pengumuman")
	if err != nil {
		return
	}
	title := ppdbAnnouncementTitle(tahunAjaran)
	published := false
	for _, c := range cur {
		if c.Title == title {
			published = true
			break
		}
	}
	if !published {
		return
	}
	rows, err := s.repo.ListPpdbAcceptedByYear(ctx, tahunAjaran)
	if err != nil {
		return
	}
	_ = s.mergePpdbAnnouncement(ctx, s.buildPpdbAnnouncementItem(tahunAjaran, rows))
}

// ppdbTahunOf resolves a registration id → its batch's school year ("" on error).
func (s *SchoolService) ppdbTahunOf(ctx context.Context, regID string) string {
	reg, err := s.repo.GetPpdbRegistration(ctx, regID)
	if err != nil {
		return ""
	}
	b, err := s.repo.GetPpdbBatch(ctx, reg.BatchID)
	if err != nil {
		return ""
	}
	return b.TahunAjaran
}
