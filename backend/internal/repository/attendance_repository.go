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

var ErrAttendanceNotFound = errors.New("attendance session not found")

type AttendanceSession struct {
	ID             string
	CreatedBy      string
	CourseID       string
	Mapel          string
	Kelas          string
	Ruang          string
	Tanggal        string
	JamKe          int
	JamKeAkhir     int
	StartTime      string
	EndTime        string
	Token          string
	TokenCode      string
	TokenExpiresAt sql.NullTime
	CreatedByName  string
	HadirCount     int
	CreatedAt      time.Time
}

type AttendanceRecord struct {
	StudentID    string
	StudentName  string
	StudentKelas string
	Status       string
	Note         string
	MarkedAt     time.Time
}

type AttendanceTodayEntry struct {
	SessionID  string
	Mapel      string
	Kelas      string
	Ruang      string
	JamKe      int
	JamKeAkhir int
	StartTime  string
	EndTime    string
	Status     string
}

// AttendanceExportRow is one student's attendance recap over a period.
type AttendanceExportRow struct {
	StudentName string
	Kelas       string
	Jurusan     string
	Hadir       int
	Telat       int
	Sakit       int
	Izin        int
	Alpa        int
	Total       int
}

// DayStudent / DayCell back the per-day recap grid.
type DayStudent struct {
	ID   string
	Name string
}
type DayCell struct {
	SessionID string
	StudentID string
	Status    string
}

type AttendanceRepository interface {
	CreateSession(ctx context.Context, s *AttendanceSession) error
	SetToken(ctx context.Context, sessionID, token, code string, expiresAt time.Time) error
	GetSession(ctx context.Context, id string) (*AttendanceSession, error)
	FindByToken(ctx context.Context, token string) (*AttendanceSession, error)
	FindByCode(ctx context.Context, code string) (*AttendanceSession, error)
	ListSessions(ctx context.Context, createdBy, tanggal string) ([]*AttendanceSession, error)
	// MarkPresent inserts a record with the given status ('hadir'/'telat');
	// returns already=true if one existed.
	MarkPresent(ctx context.Context, sessionID, studentID, status string) (already bool, err error)
	UpsertRecord(ctx context.Context, sessionID, studentID, status, note string) error
	GetRecord(ctx context.Context, sessionID, studentID string) (*AttendanceRecord, error)
	ListRecords(ctx context.Context, sessionID string) ([]*AttendanceRecord, error)
	MyDay(ctx context.Context, studentID, tanggal string) ([]*AttendanceTodayEntry, error)
	DeleteSession(ctx context.Context, id string) error
	// ExportRecap returns per-student attendance counts within [start,end] for
	// students in the given scope ("kelas" or "jurusan" = value).
	ExportRecap(ctx context.Context, start, end, scope, value string) ([]*AttendanceExportRow, error)
	// Per-day recap grid helpers.
	ListSessionsByKelas(ctx context.Context, kelas, tanggal string) ([]*AttendanceSession, error)
	RosterForDay(ctx context.Context, kelas string, sessionIDs []string) ([]*DayStudent, error)
	RecordsForSessions(ctx context.Context, sessionIDs []string) ([]*DayCell, error)
}

func attendanceScopeCol(scope string) (string, bool) {
	switch scope {
	case "kelas":
		return "kelas", true
	case "jurusan":
		return "jurusan", true
	default:
		return "", false
	}
}

type sqliteAttendanceRepository struct{ db *sql.DB }

func NewAttendanceRepository(db *sql.DB) AttendanceRepository {
	return &sqliteAttendanceRepository{db: db}
}

const sessionCols = `s.id, s.created_by, COALESCE(s.course_id,''), s.mapel, s.kelas, s.ruang, s.tanggal, s.jam_ke, s.jam_ke_akhir,
	s.start_time, s.end_time, s.token, s.token_code, s.token_expires_at, s.created_at, u.full_name,
	(SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'hadir')`

func scanSession(row interface{ Scan(...any) error }) (*AttendanceSession, error) {
	s := &AttendanceSession{}
	err := row.Scan(&s.ID, &s.CreatedBy, &s.CourseID, &s.Mapel, &s.Kelas, &s.Ruang, &s.Tanggal, &s.JamKe, &s.JamKeAkhir,
		&s.StartTime, &s.EndTime, &s.Token, &s.TokenCode, &s.TokenExpiresAt, &s.CreatedAt, &s.CreatedByName, &s.HadirCount)
	return s, err
}

func (r *sqliteAttendanceRepository) getSessionWhere(ctx context.Context, where string, args ...any) (*AttendanceSession, error) {
	q := `SELECT ` + sessionCols + ` FROM attendance_sessions s JOIN users u ON u.id = s.created_by WHERE ` + where + ` LIMIT 1`
	s, err := scanSession(r.db.QueryRowContext(ctx, q, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrAttendanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	return s, nil
}

func (r *sqliteAttendanceRepository) CreateSession(ctx context.Context, s *AttendanceSession) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO attendance_sessions (id, created_by, course_id, mapel, kelas, ruang, tanggal, jam_ke, jam_ke_akhir, start_time, end_time, token, token_code, token_expires_at, created_at)
		VALUES (?, ?, NULLIF(?,''), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.CreatedBy, s.CourseID, s.Mapel, s.Kelas, s.Ruang, s.Tanggal, s.JamKe, s.JamKeAkhir, s.StartTime, s.EndTime,
		s.Token, s.TokenCode, s.TokenExpiresAt, s.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create attendance session: %w", err)
	}
	return nil
}

func (r *sqliteAttendanceRepository) SetToken(ctx context.Context, sessionID, token, code string, expiresAt time.Time) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE attendance_sessions SET token=?, token_code=?, token_expires_at=? WHERE id=?`,
		token, code, expiresAt, sessionID)
	if err != nil {
		return fmt.Errorf("set token: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrAttendanceNotFound
	}
	return nil
}

func (r *sqliteAttendanceRepository) GetSession(ctx context.Context, id string) (*AttendanceSession, error) {
	return r.getSessionWhere(ctx, "s.id = ?", id)
}

func (r *sqliteAttendanceRepository) FindByToken(ctx context.Context, token string) (*AttendanceSession, error) {
	return r.getSessionWhere(ctx, "s.token = ?", token)
}

func (r *sqliteAttendanceRepository) FindByCode(ctx context.Context, code string) (*AttendanceSession, error) {
	return r.getSessionWhere(ctx, "s.token_code = ?", code)
}

func (r *sqliteAttendanceRepository) ListSessions(ctx context.Context, createdBy, tanggal string) ([]*AttendanceSession, error) {
	where := "s.created_by = ?"
	args := []any{createdBy}
	if tanggal != "" {
		where += " AND s.tanggal = ?"
		args = append(args, tanggal)
	}
	q := `SELECT ` + sessionCols + ` FROM attendance_sessions s JOIN users u ON u.id = s.created_by
		WHERE ` + where + ` ORDER BY s.tanggal DESC, s.start_time DESC, s.created_at DESC LIMIT 200`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	var out []*AttendanceSession
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *sqliteAttendanceRepository) MarkPresent(ctx context.Context, sessionID, studentID, status string) (bool, error) {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO attendance_records (id, session_id, student_id, status, marked_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(session_id, student_id) DO NOTHING`,
		uuid.New().String(), sessionID, studentID, status, time.Now().UTC())
	if err != nil {
		return false, fmt.Errorf("mark present: %w", err)
	}
	n, _ := res.RowsAffected()
	return n == 0, nil // 0 rows → already existed
}

func (r *sqliteAttendanceRepository) ListSessionsByKelas(ctx context.Context, kelas, tanggal string) ([]*AttendanceSession, error) {
	q := `SELECT ` + sessionCols + ` FROM attendance_sessions s JOIN users u ON u.id = s.created_by
		WHERE s.kelas = ? AND s.tanggal = ? ORDER BY s.start_time ASC, s.jam_ke ASC`
	rows, err := r.db.QueryContext(ctx, q, kelas, tanggal)
	if err != nil {
		return nil, fmt.Errorf("sessions by kelas: %w", err)
	}
	defer rows.Close()
	var out []*AttendanceSession
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// inClause returns "?,?,…" plus the args for an IN (...) with the given ids.
func inClause(ids []string) (string, []any) {
	ph := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		ph[i] = "?"
		args[i] = id
	}
	return strings.Join(ph, ","), args
}

func (r *sqliteAttendanceRepository) RosterForDay(ctx context.Context, kelas string, sessionIDs []string) ([]*DayStudent, error) {
	// Students of the class, plus anyone who has a record in these sessions
	// (covers moving-class attendees from other classes).
	where := "u.role='student' AND u.kelas = ?"
	args := []any{kelas}
	if len(sessionIDs) > 0 {
		ph, a := inClause(sessionIDs)
		where += " OR (u.role='student' AND u.id IN (SELECT student_id FROM attendance_records WHERE session_id IN (" + ph + ")))"
		args = append(args, a...)
	}
	rows, err := r.db.QueryContext(ctx, `SELECT DISTINCT u.id, u.full_name FROM users u WHERE `+where+` ORDER BY u.full_name ASC`, args...)
	if err != nil {
		return nil, fmt.Errorf("roster for day: %w", err)
	}
	defer rows.Close()
	var out []*DayStudent
	for rows.Next() {
		d := &DayStudent{}
		if err := rows.Scan(&d.ID, &d.Name); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *sqliteAttendanceRepository) RecordsForSessions(ctx context.Context, sessionIDs []string) ([]*DayCell, error) {
	if len(sessionIDs) == 0 {
		return nil, nil
	}
	ph, args := inClause(sessionIDs)
	rows, err := r.db.QueryContext(ctx,
		`SELECT session_id, student_id, status FROM attendance_records WHERE session_id IN (`+ph+`)`, args...)
	if err != nil {
		return nil, fmt.Errorf("records for sessions: %w", err)
	}
	defer rows.Close()
	var out []*DayCell
	for rows.Next() {
		c := &DayCell{}
		if err := rows.Scan(&c.SessionID, &c.StudentID, &c.Status); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *sqliteAttendanceRepository) UpsertRecord(ctx context.Context, sessionID, studentID, status, note string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO attendance_records (id, session_id, student_id, status, note, marked_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id, student_id) DO UPDATE SET status=excluded.status, note=excluded.note, marked_at=excluded.marked_at`,
		uuid.New().String(), sessionID, studentID, status, note, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("upsert record: %w", err)
	}
	return nil
}

func (r *sqliteAttendanceRepository) GetRecord(ctx context.Context, sessionID, studentID string) (*AttendanceRecord, error) {
	rec := &AttendanceRecord{}
	err := r.db.QueryRowContext(ctx, `
		SELECT r.student_id, u.full_name, u.kelas, r.status, r.note, r.marked_at
		FROM attendance_records r JOIN users u ON u.id = r.student_id
		WHERE r.session_id = ? AND r.student_id = ?`, sessionID, studentID,
	).Scan(&rec.StudentID, &rec.StudentName, &rec.StudentKelas, &rec.Status, &rec.Note, &rec.MarkedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrAttendanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get record: %w", err)
	}
	return rec, nil
}

func (r *sqliteAttendanceRepository) ListRecords(ctx context.Context, sessionID string) ([]*AttendanceRecord, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT r.student_id, u.full_name, u.kelas, r.status, r.note, r.marked_at
		FROM attendance_records r JOIN users u ON u.id = r.student_id
		WHERE r.session_id = ? ORDER BY u.full_name ASC`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("list records: %w", err)
	}
	defer rows.Close()
	var out []*AttendanceRecord
	for rows.Next() {
		rec := &AttendanceRecord{}
		if err := rows.Scan(&rec.StudentID, &rec.StudentName, &rec.StudentKelas, &rec.Status, &rec.Note, &rec.MarkedAt); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *sqliteAttendanceRepository) ExportRecap(ctx context.Context, start, end, scope, value string) ([]*AttendanceExportRow, error) {
	col, ok := attendanceScopeCol(scope)
	if !ok {
		return nil, fmt.Errorf("invalid export scope: %q", scope)
	}
	// Only records whose session falls in [start,end] are counted (s.id becomes
	// NULL for out-of-range records via the join condition).
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.full_name, u.kelas, u.jurusan,
		       COUNT(CASE WHEN s.id IS NOT NULL AND rec.status='hadir' THEN 1 END),
		       COUNT(CASE WHEN s.id IS NOT NULL AND rec.status='telat' THEN 1 END),
		       COUNT(CASE WHEN s.id IS NOT NULL AND rec.status='sakit' THEN 1 END),
		       COUNT(CASE WHEN s.id IS NOT NULL AND rec.status='izin'  THEN 1 END),
		       COUNT(CASE WHEN s.id IS NOT NULL AND rec.status='alpa'  THEN 1 END),
		       COUNT(CASE WHEN s.id IS NOT NULL THEN 1 END)
		FROM users u
		LEFT JOIN attendance_records rec ON rec.student_id = u.id
		LEFT JOIN attendance_sessions s ON s.id = rec.session_id AND s.tanggal >= ? AND s.tanggal <= ?
		WHERE u.role='student' AND u.`+col+` = ?
		GROUP BY u.id
		ORDER BY u.full_name ASC`, start, end, value)
	if err != nil {
		return nil, fmt.Errorf("export recap: %w", err)
	}
	defer rows.Close()
	var out []*AttendanceExportRow
	for rows.Next() {
		e := &AttendanceExportRow{}
		if err := rows.Scan(&e.StudentName, &e.Kelas, &e.Jurusan, &e.Hadir, &e.Telat, &e.Sakit, &e.Izin, &e.Alpa, &e.Total); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *sqliteAttendanceRepository) DeleteSession(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM attendance_sessions WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrAttendanceNotFound
	}
	return nil
}

func (r *sqliteAttendanceRepository) MyDay(ctx context.Context, studentID, tanggal string) ([]*AttendanceTodayEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT s.id, s.mapel, s.kelas, s.ruang, s.jam_ke, s.jam_ke_akhir, s.start_time, s.end_time, r.status
		FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
		WHERE r.student_id = ? AND s.tanggal = ?
		ORDER BY s.start_time ASC, s.jam_ke ASC`, studentID, tanggal)
	if err != nil {
		return nil, fmt.Errorf("my day: %w", err)
	}
	defer rows.Close()
	var out []*AttendanceTodayEntry
	for rows.Next() {
		e := &AttendanceTodayEntry{}
		if err := rows.Scan(&e.SessionID, &e.Mapel, &e.Kelas, &e.Ruang, &e.JamKe, &e.JamKeAkhir, &e.StartTime, &e.EndTime, &e.Status); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
