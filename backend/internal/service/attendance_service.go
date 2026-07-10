package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

// A barcode/token is valid for this long after it is generated.
const AttendanceTokenTTL = 60 * time.Second

// Scanning in later than (session start + this) is recorded as "telat".
const AttendanceTelatTolerance = 10 * time.Minute

// WIB (UTC+7) — school-local time, no tzdata dependency.
var wib = time.FixedZone("WIB", 7*3600)

// computeAttendanceStatus returns "telat" if `now` is past the session start
// (tanggal + startTime, interpreted in WIB) plus the tolerance; else "hadir".
func computeAttendanceStatus(tanggal, startTime string, now time.Time) string {
	start, err := time.ParseInLocation("2006-01-02 15:04", tanggal+" "+startTime, wib)
	if err != nil {
		return "hadir"
	}
	if now.In(wib).After(start.Add(AttendanceTelatTolerance)) {
		return "telat"
	}
	return "hadir"
}

var (
	ErrTokenInvalid = errors.New("kode absensi tidak valid")
	ErrTokenExpired = errors.New("kode absensi sudah kadaluarsa")
)

var validAttendanceStatus = map[string]bool{"hadir": true, "telat": true, "sakit": true, "izin": true, "alpa": true}

type AttendanceService struct {
	repo       repository.AttendanceRepository
	courseRepo repository.CourseRepository
}

func NewAttendanceService(repo repository.AttendanceRepository, courseRepo repository.CourseRepository) *AttendanceService {
	return &AttendanceService{repo: repo, courseRepo: courseRepo}
}

func genToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// genCode returns a short, human-typable code (no ambiguous chars like 0/O/1/I).
func genCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	out := make([]byte, 6)
	for i, c := range b {
		out[i] = alphabet[int(c)%len(alphabet)]
	}
	return string(out)
}

func tokenInfo(s *repository.AttendanceSession) *TokenInfo {
	remain := 0
	if s.TokenExpiresAt.Valid {
		remain = int(time.Until(s.TokenExpiresAt.Time).Seconds())
		if remain < 0 {
			remain = 0
		}
	}
	return &TokenInfo{Token: s.Token, Code: s.TokenCode, ExpiresInSeconds: remain}
}

// TokenInfo mirrors the proto message (kept in the service layer so the repo
// stays transport-agnostic).
type TokenInfo struct {
	Token            string
	Code             string
	ExpiresInSeconds int
}

type CreateSessionInput struct {
	CourseID   string
	Mapel      string
	Kelas      string
	Ruang      string
	Tanggal    string
	JamKe      int
	JamKeAkhir int
	StartTime  string
	EndTime    string
}

func (s *AttendanceService) CreateSession(ctx context.Context, callerID, callerRole string, in CreateSessionInput) (*repository.AttendanceSession, *TokenInfo, error) {
	if !isManager(callerRole) {
		return nil, nil, ErrPermissionDenied
	}
	if in.Tanggal == "" || in.Kelas == "" || in.StartTime == "" || in.EndTime == "" {
		return nil, nil, fmt.Errorf("%w: tanggal, kelas, jam mulai & selesai wajib diisi", ErrInvalidArgument)
	}
	mapel := in.Mapel
	if mapel == "" && in.CourseID != "" {
		if c, err := s.courseRepo.GetByID(ctx, in.CourseID); err == nil {
			mapel = c.Name
		}
	}
	now := time.Now().UTC()
	sess := &repository.AttendanceSession{
		ID:        uuid.New().String(),
		CreatedBy: callerID,
		CourseID:  in.CourseID,
		Mapel:     mapel,
		Kelas:      in.Kelas,
		Ruang:      in.Ruang,
		Tanggal:    in.Tanggal,
		JamKe:      in.JamKe,
		JamKeAkhir: in.JamKeAkhir,
		StartTime:  in.StartTime,
		EndTime:    in.EndTime,
		Token:      genToken(),
		TokenCode:  genCode(),
		CreatedAt:  now,
	}
	sess.TokenExpiresAt = sql.NullTime{Time: now.Add(AttendanceTokenTTL), Valid: true}
	if err := s.repo.CreateSession(ctx, sess); err != nil {
		return nil, nil, fmt.Errorf("create session: %w", err)
	}
	full, err := s.repo.GetSession(ctx, sess.ID)
	if err != nil {
		return nil, nil, err
	}
	return full, tokenInfo(full), nil
}

// ownSession loads a session and checks the caller may manage it.
func (s *AttendanceService) ownSession(ctx context.Context, callerID, callerRole, sessionID string) (*repository.AttendanceSession, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	sess, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		if errors.Is(err, repository.ErrAttendanceNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if sess.CreatedBy != callerID && callerRole != "admin" {
		return nil, ErrPermissionDenied
	}
	return sess, nil
}

func (s *AttendanceService) RegenerateToken(ctx context.Context, callerID, callerRole, sessionID string) (*TokenInfo, error) {
	sess, err := s.ownSession(ctx, callerID, callerRole, sessionID)
	if err != nil {
		return nil, err
	}
	exp := time.Now().UTC().Add(AttendanceTokenTTL)
	token, code := genToken(), genCode()
	if err := s.repo.SetToken(ctx, sess.ID, token, code, exp); err != nil {
		return nil, fmt.Errorf("set token: %w", err)
	}
	return &TokenInfo{Token: token, Code: code, ExpiresInSeconds: int(AttendanceTokenTTL.Seconds())}, nil
}

func (s *AttendanceService) DeleteSession(ctx context.Context, callerID, callerRole, sessionID string) error {
	if _, err := s.ownSession(ctx, callerID, callerRole, sessionID); err != nil {
		return err
	}
	if err := s.repo.DeleteSession(ctx, sessionID); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *AttendanceService) ExportAttendance(ctx context.Context, callerRole, start, end, kelas, jurusan string) ([]*repository.AttendanceExportRow, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if start == "" || end == "" {
		return nil, fmt.Errorf("%w: rentang tanggal wajib", ErrInvalidArgument)
	}
	scope, value := "kelas", kelas
	switch {
	case kelas != "" && jurusan == "":
		scope, value = "kelas", kelas
	case jurusan != "" && kelas == "":
		scope, value = "jurusan", jurusan
	default:
		return nil, fmt.Errorf("%w: pilih tepat satu dari kelas/jurusan", ErrInvalidArgument)
	}
	return s.repo.ExportRecap(ctx, start, end, scope, value)
}

// DayGridResult backs the per-day recap grid for a class.
type DayGridResult struct {
	Sessions []*repository.AttendanceSession
	Students []*repository.DayStudent
	Cells    []*repository.DayCell
}

// DayGrid returns all sessions of a class on a date, the class roster (plus any
// attendees), and existing records. Missing (student,session) pairs are "alpa".
func (s *AttendanceService) DayGrid(ctx context.Context, callerRole, tanggal, kelas string) (*DayGridResult, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if tanggal == "" || kelas == "" {
		return nil, fmt.Errorf("%w: tanggal & kelas wajib", ErrInvalidArgument)
	}
	sessions, err := s.repo.ListSessionsByKelas(ctx, kelas, tanggal)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(sessions))
	for i, ss := range sessions {
		ids[i] = ss.ID
	}
	students, err := s.repo.RosterForDay(ctx, kelas, ids)
	if err != nil {
		return nil, err
	}
	cells, err := s.repo.RecordsForSessions(ctx, ids)
	if err != nil {
		return nil, err
	}
	return &DayGridResult{Sessions: sessions, Students: students, Cells: cells}, nil
}

func (s *AttendanceService) ListSessions(ctx context.Context, callerID, callerRole, tanggal string) ([]*repository.AttendanceSession, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListSessions(ctx, callerID, tanggal)
}

func (s *AttendanceService) GetSessionRecords(ctx context.Context, callerID, callerRole, sessionID string) (*repository.AttendanceSession, []*repository.AttendanceRecord, error) {
	sess, err := s.ownSession(ctx, callerID, callerRole, sessionID)
	if err != nil {
		return nil, nil, err
	}
	recs, err := s.repo.ListRecords(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}
	return sess, recs, nil
}

func (s *AttendanceService) SetRecordStatus(ctx context.Context, callerID, callerRole, sessionID, studentID, status, note string) (*repository.AttendanceRecord, error) {
	// Any teacher/admin may adjust attendance (needed for the shared per-day grid),
	// not only the session's creator.
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if _, err := s.repo.GetSession(ctx, sessionID); err != nil {
		if errors.Is(err, repository.ErrAttendanceNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if !validAttendanceStatus[status] {
		return nil, fmt.Errorf("%w: status tidak dikenal", ErrInvalidArgument)
	}
	if studentID == "" {
		return nil, fmt.Errorf("%w: student_id wajib", ErrInvalidArgument)
	}
	if err := s.repo.UpsertRecord(ctx, sessionID, studentID, status, note); err != nil {
		return nil, err
	}
	return s.repo.GetRecord(ctx, sessionID, studentID)
}

// Scan marks the calling student present for the session identified by a valid,
// non-expired token or code.
func (s *AttendanceService) Scan(ctx context.Context, callerID, callerRole, token, code string) (*repository.AttendanceSession, bool, error) {
	if callerRole != "student" {
		return nil, false, ErrPermissionDenied
	}
	var sess *repository.AttendanceSession
	var err error
	switch {
	case token != "":
		sess, err = s.repo.FindByToken(ctx, token)
	case code != "":
		sess, err = s.repo.FindByCode(ctx, code)
	default:
		return nil, false, fmt.Errorf("%w: token atau kode wajib", ErrInvalidArgument)
	}
	if errors.Is(err, repository.ErrAttendanceNotFound) {
		return nil, false, ErrTokenInvalid
	}
	if err != nil {
		return nil, false, err
	}
	if !sess.TokenExpiresAt.Valid || time.Now().After(sess.TokenExpiresAt.Time) {
		return nil, false, ErrTokenExpired
	}
	status := computeAttendanceStatus(sess.Tanggal, sess.StartTime, time.Now())
	already, err := s.repo.MarkPresent(ctx, sess.ID, callerID, status)
	if err != nil {
		return nil, false, err
	}
	return sess, already, nil
}

type MyTodayResult struct {
	Tanggal                         string
	Hadir, Telat, Sakit, Izin, Alpa int
	Entries                         []*repository.AttendanceTodayEntry
}

func (s *AttendanceService) MyToday(ctx context.Context, callerID, callerRole, tanggal string) (*MyTodayResult, error) {
	if callerRole != "student" {
		return nil, ErrPermissionDenied
	}
	if tanggal == "" {
		tanggal = time.Now().Format("2006-01-02")
	}
	entries, err := s.repo.MyDay(ctx, callerID, tanggal)
	if err != nil {
		return nil, err
	}
	res := &MyTodayResult{Tanggal: tanggal, Entries: entries}
	for _, e := range entries {
		switch e.Status {
		case "hadir":
			res.Hadir++
		case "telat":
			res.Telat++
		case "sakit":
			res.Sakit++
		case "izin":
			res.Izin++
		case "alpa":
			res.Alpa++
		}
	}
	return res, nil
}
