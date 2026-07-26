package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrPpdbNotFound = errors.New("ppdb record not found")

// PpdbBatch is one admission wave (gelombang 1..4) within a school year.
type PpdbBatch struct {
	ID                  string
	TahunAjaran         string
	Gelombang           int
	Nama                string
	IsActive            bool
	Buka                string
	Tutup               string
	Brosur              string // data URL (loaded only by PpdbBrosur)
	HasBrosur           bool
	DriveLink           string
	Panduan             string
	RequiredDocs        []string
	Kuota               map[string]int32
	TestActive          bool
	TestDurationMinutes int
	PendaftarCount      int
	CreatedAt           time.Time
}

type PpdbQuestion struct {
	ID           string
	BatchID      string
	Question     string
	Options      []string
	CorrectIndex int
	OrderIndex   int
}

type PpdbTestAnswer struct {
	QuestionIndex int
	OptionIndex   int
	IsCorrect     bool
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ── batches ──

func scanBatch(row interface{ Scan(...any) error }) (*PpdbBatch, error) {
	b := &PpdbBatch{}
	var docsJSON, kuotaJSON string
	if err := row.Scan(&b.ID, &b.TahunAjaran, &b.Gelombang, &b.Nama, &b.IsActive, &b.Buka, &b.Tutup,
		&b.HasBrosur, &b.DriveLink, &b.Panduan, &docsJSON, &kuotaJSON, &b.TestActive, &b.TestDurationMinutes, &b.CreatedAt); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(docsJSON), &b.RequiredDocs)
	_ = json.Unmarshal([]byte(kuotaJSON), &b.Kuota)
	return b, nil
}

// Note: brosur is exposed only as a boolean (has_brosur); the blob is streamed.
const batchCols = `id, tahun_ajaran, gelombang, nama, is_active, buka, tutup, brosur <> '' AS has_brosur, drive_link, panduan, required_docs, kuota, test_active, test_duration_minutes, created_at`

func (r *sqliteSchoolRepository) CreatePpdbBatch(ctx context.Context, b *PpdbBatch) error {
	docs, _ := json.Marshal(b.RequiredDocs)
	kuota, _ := json.Marshal(b.Kuota)
	if b.TestDurationMinutes <= 0 {
		b.TestDurationMinutes = 60
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO ppdb_batches (id, tahun_ajaran, gelombang, nama, buka, tutup, drive_link, panduan, required_docs, kuota, test_active, test_duration_minutes)
		VALUES (?, ?, ?, ?, '', '', '', '', ?, ?, 0, ?)`,
		b.ID, b.TahunAjaran, b.Gelombang, b.Nama, string(docs), string(kuota), b.TestDurationMinutes)
	if err != nil {
		return fmt.Errorf("create ppdb batch: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) UpdatePpdbBatch(ctx context.Context, b *PpdbBatch) error {
	docs, _ := json.Marshal(b.RequiredDocs)
	kuota, _ := json.Marshal(b.Kuota)
	_, err := r.db.ExecContext(ctx, `
		UPDATE ppdb_batches SET nama=?, buka=?, tutup=?, drive_link=?, panduan=?, required_docs=?, kuota=?, test_active=?, test_duration_minutes=?
		WHERE id=?`,
		b.Nama, b.Buka, b.Tutup, b.DriveLink, b.Panduan, string(docs), string(kuota), b2i(b.TestActive), b.TestDurationMinutes, b.ID)
	if err != nil {
		return fmt.Errorf("update ppdb batch: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) SetPpdbBrosur(ctx context.Context, id, dataURL string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ppdb_batches SET brosur=? WHERE id=?`, dataURL, id)
	if err != nil {
		return fmt.Errorf("set ppdb brosur: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) ListPpdbBatches(ctx context.Context) ([]*PpdbBatch, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+batchCols+`,
		(SELECT COUNT(*) FROM ppdb_registrations reg WHERE reg.batch_id = ppdb_batches.id)
		FROM ppdb_batches ORDER BY tahun_ajaran DESC, gelombang ASC`)
	if err != nil {
		return nil, fmt.Errorf("list ppdb batches: %w", err)
	}
	defer rows.Close()
	var out []*PpdbBatch
	for rows.Next() {
		b := &PpdbBatch{}
		var docsJSON, kuotaJSON string
		if err := rows.Scan(&b.ID, &b.TahunAjaran, &b.Gelombang, &b.Nama, &b.IsActive, &b.Buka, &b.Tutup,
			&b.HasBrosur, &b.DriveLink, &b.Panduan, &docsJSON, &kuotaJSON, &b.TestActive, &b.TestDurationMinutes, &b.CreatedAt, &b.PendaftarCount); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(docsJSON), &b.RequiredDocs)
		_ = json.Unmarshal([]byte(kuotaJSON), &b.Kuota)
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) GetPpdbBatch(ctx context.Context, id string) (*PpdbBatch, error) {
	b, err := scanBatch(r.db.QueryRowContext(ctx, `SELECT `+batchCols+` FROM ppdb_batches WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPpdbNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get ppdb batch: %w", err)
	}
	return b, nil
}

func (r *sqliteSchoolRepository) GetActivePpdbBatch(ctx context.Context) (*PpdbBatch, error) {
	b, err := scanBatch(r.db.QueryRowContext(ctx, `SELECT `+batchCols+` FROM ppdb_batches WHERE is_active = 1 LIMIT 1`))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPpdbNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get active ppdb batch: %w", err)
	}
	return b, nil
}

func (r *sqliteSchoolRepository) SetActivePpdbBatch(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE ppdb_batches SET is_active = 0`); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `UPDATE ppdb_batches SET is_active = 1 WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrPpdbNotFound
	}
	return tx.Commit()
}

func (r *sqliteSchoolRepository) DeletePpdbBatch(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM ppdb_batches WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete ppdb batch: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) PpdbBrosur(ctx context.Context, batchID string) (string, error) {
	var data string
	err := r.db.QueryRowContext(ctx, `SELECT brosur FROM ppdb_batches WHERE id = ?`, batchID).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrPpdbNotFound
	}
	if err != nil {
		return "", fmt.Errorf("get ppdb brosur: %w", err)
	}
	return data, nil
}

// ── questions ──

func (r *sqliteSchoolRepository) ListPpdbQuestions(ctx context.Context, batchID string) ([]*PpdbQuestion, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, batch_id, question, options_json, correct_index, order_index FROM ppdb_questions WHERE batch_id = ? ORDER BY order_index ASC`, batchID)
	if err != nil {
		return nil, fmt.Errorf("list ppdb questions: %w", err)
	}
	defer rows.Close()
	var out []*PpdbQuestion
	for rows.Next() {
		q := &PpdbQuestion{}
		var optsJSON string
		if err := rows.Scan(&q.ID, &q.BatchID, &q.Question, &optsJSON, &q.CorrectIndex, &q.OrderIndex); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(optsJSON), &q.Options)
		out = append(out, q)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) SetPpdbQuestions(ctx context.Context, batchID string, qs []*PpdbQuestion) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM ppdb_questions WHERE batch_id = ?`, batchID); err != nil {
		return err
	}
	for i, q := range qs {
		opts, _ := json.Marshal(q.Options)
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO ppdb_questions (id, batch_id, question, options_json, correct_index, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), batchID, q.Question, string(opts), q.CorrectIndex, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListPpdbAcceptedByYear returns accepted, exam-scored applicants across all
// gelombang of a school year, ranked by score desc (majors mixed).
func (r *sqliteSchoolRepository) ListPpdbAcceptedByYear(ctx context.Context, tahunAjaran string) ([]*PpdbRegistration, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT reg.nama, reg.jurusan, reg.test_score, COALESCE(b.gelombang, 0)
		FROM ppdb_registrations reg JOIN ppdb_batches b ON b.id = reg.batch_id
		WHERE b.tahun_ajaran = ? AND reg.status = 'diterima' AND reg.test_submitted = 1
		ORDER BY reg.test_score DESC, reg.created_at ASC`, tahunAjaran)
	if err != nil {
		return nil, fmt.Errorf("list ppdb accepted: %w", err)
	}
	defer rows.Close()
	var out []*PpdbRegistration
	for rows.Next() {
		p := &PpdbRegistration{}
		if err := rows.Scan(&p.Nama, &p.Jurusan, &p.TestScore, &p.Gelombang); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SetPpdbWaSent marks the given registrations as contacted (or not) via WhatsApp.
func (r *sqliteSchoolRepository) SetPpdbWaSent(ctx context.Context, ids []string, sent bool) error {
	if len(ids) == 0 {
		return nil
	}
	v := 0
	if sent {
		v = 1
	}
	ph := make([]string, len(ids))
	args := make([]any, 0, len(ids)+1)
	args = append(args, v)
	for i, id := range ids {
		ph[i] = "?"
		args = append(args, id)
	}
	_, err := r.db.ExecContext(ctx, `UPDATE ppdb_registrations SET wa_sent = ? WHERE id IN (`+strings.Join(ph, ",")+`)`, args...)
	if err != nil {
		return fmt.Errorf("set ppdb wa_sent: %w", err)
	}
	return nil
}

// ── registrations (extra) ──

func (r *sqliteSchoolRepository) GetPpdbRegistration(ctx context.Context, id string) (*PpdbRegistration, error) {
	p, err := scanPpdb(r.db.QueryRowContext(ctx, `SELECT `+ppdbCols+` FROM ppdb_registrations WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPpdbNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get ppdb registration: %w", err)
	}
	return p, nil
}

func (r *sqliteSchoolRepository) GetPpdbRegistrationByNo(ctx context.Context, no string) (*PpdbRegistration, error) {
	p, err := scanPpdb(r.db.QueryRowContext(ctx, `SELECT `+ppdbCols+` FROM ppdb_registrations WHERE no_pendaftaran = ?`, no))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPpdbNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get ppdb by no: %w", err)
	}
	return p, nil
}

func (r *sqliteSchoolRepository) CountPpdbInBatch(ctx context.Context, batchID string) (int, error) {
	var n int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ppdb_registrations WHERE batch_id = ?`, batchID).Scan(&n); err != nil {
		return 0, fmt.Errorf("count ppdb in batch: %w", err)
	}
	return n, nil
}

func (r *sqliteSchoolRepository) SetPpdbTestStarted(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ppdb_registrations SET test_started_at = datetime('now') WHERE id = ? AND test_started_at IS NULL`, id)
	return err
}

// ── dokumen pendaftar ──

func (r *sqliteSchoolRepository) SetPpdbDocLink(ctx context.Context, id, docLink string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ppdb_registrations SET doc_link = ? WHERE id = ?`, docLink, id)
	if err != nil {
		return fmt.Errorf("set ppdb doc link: %w", err)
	}
	return nil
}

func (r *sqliteSchoolRepository) AddPpdbDocument(ctx context.Context, regID, name, dataURL string) (string, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO ppdb_documents (id, registration_id, name, data) VALUES (?, ?, ?, ?)`, id, regID, name, dataURL)
	if err != nil {
		return "", fmt.Errorf("add ppdb document: %w", err)
	}
	return id, nil
}

func (r *sqliteSchoolRepository) ListPpdbDocuments(ctx context.Context, regID string) ([]PpdbDoc, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, name FROM ppdb_documents WHERE registration_id = ? ORDER BY created_at ASC`, regID)
	if err != nil {
		return nil, fmt.Errorf("list ppdb documents: %w", err)
	}
	defer rows.Close()
	var out []PpdbDoc
	for rows.Next() {
		var d PpdbDoc
		if err := rows.Scan(&d.ID, &d.Name); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *sqliteSchoolRepository) SavePpdbTest(ctx context.Context, id string, score int, answers []PpdbTestAnswer) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE ppdb_registrations SET test_score = ?, test_submitted = 1 WHERE id = ?`, score, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ppdb_test_answers WHERE registration_id = ?`, id); err != nil {
		return err
	}
	for _, a := range answers {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO ppdb_test_answers (id, registration_id, question_index, option_index, is_correct) VALUES (?, ?, ?, ?, ?)`,
			uuid.New().String(), id, a.QuestionIndex, a.OptionIndex, b2i(a.IsCorrect)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
