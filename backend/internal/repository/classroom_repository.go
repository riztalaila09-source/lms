package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrClassroomNotFound = errors.New("classroom record not found")

type Schedule struct {
	ID         string
	CourseID   string
	DayOfWeek  int
	JamKeMulai int
	JamKeAkhir int
	Kelas      string
	Ruang      string
}

type LessonPlan struct {
	ID            string
	CourseID      string
	Tanggal       string
	Title         string
	MaterialID    string
	MaterialTitle string
	Note          string
}

// ActivityPoint = satu penilaian keaktifan (poin 1..10) untuk seorang siswa.
type ActivityPoint struct {
	ID        string
	CourseID  string
	StudentID string
	Tanggal   string
	Points    int
}

// LeaderboardEntry = akumulasi poin seorang siswa (total atau per tanggal).
type LeaderboardEntry struct {
	StudentID    string
	StudentName  string
	StudentKelas string
	Points       int
	EntryCount   int
}

type ClassroomRepository interface {
	ListSchedules(ctx context.Context, courseID string) ([]*Schedule, error)
	CreateSchedule(ctx context.Context, s *Schedule) error
	UpdateSchedule(ctx context.Context, s *Schedule) error
	DeleteSchedule(ctx context.Context, id string) error

	ListLessonPlans(ctx context.Context, courseID string) ([]*LessonPlan, error)
	CreateLessonPlan(ctx context.Context, p *LessonPlan) error
	UpdateLessonPlan(ctx context.Context, p *LessonPlan) error
	DeleteLessonPlan(ctx context.Context, id string) error

	AddActivityPoint(ctx context.Context, p *ActivityPoint) error
	// Leaderboard: total poin per siswa terdaftar. tanggal "" = akumulasi semua,
	// tanggal terisi = jumlah poin hari itu. Urut poin desc lalu nama.
	Leaderboard(ctx context.Context, courseID, tanggal string) ([]*LeaderboardEntry, error)
	// StudentPointTotals mengembalikan (total keseluruhan, total pada tanggal tsb).
	StudentPointTotals(ctx context.Context, courseID, studentID, tanggal string) (int, int, error)
}

type sqliteClassroomRepository struct{ db *sql.DB }

func NewClassroomRepository(db *sql.DB) ClassroomRepository { return &sqliteClassroomRepository{db: db} }

func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// ── Jadwal ──

func (r *sqliteClassroomRepository) ListSchedules(ctx context.Context, courseID string) ([]*Schedule, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, course_id, day_of_week, jam_ke_mulai, jam_ke_akhir, kelas, ruang
		FROM course_schedules WHERE course_id = ?
		ORDER BY day_of_week ASC, jam_ke_mulai ASC`, courseID)
	if err != nil {
		return nil, fmt.Errorf("list schedules: %w", err)
	}
	defer rows.Close()
	var out []*Schedule
	for rows.Next() {
		s := &Schedule{}
		if err := rows.Scan(&s.ID, &s.CourseID, &s.DayOfWeek, &s.JamKeMulai, &s.JamKeAkhir, &s.Kelas, &s.Ruang); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *sqliteClassroomRepository) CreateSchedule(ctx context.Context, s *Schedule) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO course_schedules (id, course_id, day_of_week, jam_ke_mulai, jam_ke_akhir, kelas, ruang)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.CourseID, s.DayOfWeek, s.JamKeMulai, s.JamKeAkhir, s.Kelas, s.Ruang)
	if err != nil {
		return fmt.Errorf("create schedule: %w", err)
	}
	return nil
}

func (r *sqliteClassroomRepository) UpdateSchedule(ctx context.Context, s *Schedule) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE course_schedules SET day_of_week=?, jam_ke_mulai=?, jam_ke_akhir=?, kelas=?, ruang=?
		WHERE id=?`,
		s.DayOfWeek, s.JamKeMulai, s.JamKeAkhir, s.Kelas, s.Ruang, s.ID)
	if err != nil {
		return fmt.Errorf("update schedule: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrClassroomNotFound
	}
	return nil
}

func (r *sqliteClassroomRepository) DeleteSchedule(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM course_schedules WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete schedule: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrClassroomNotFound
	}
	return nil
}

// ── Kalender / rencana ──

func (r *sqliteClassroomRepository) ListLessonPlans(ctx context.Context, courseID string) ([]*LessonPlan, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT p.id, p.course_id, p.tanggal, p.title, COALESCE(p.material_id,''), COALESCE(m.title,''), p.note
		FROM course_lesson_plans p
		LEFT JOIN course_materials m ON m.id = p.material_id
		WHERE p.course_id = ?
		ORDER BY p.tanggal ASC, p.created_at ASC`, courseID)
	if err != nil {
		return nil, fmt.Errorf("list lesson plans: %w", err)
	}
	defer rows.Close()
	var out []*LessonPlan
	for rows.Next() {
		p := &LessonPlan{}
		if err := rows.Scan(&p.ID, &p.CourseID, &p.Tanggal, &p.Title, &p.MaterialID, &p.MaterialTitle, &p.Note); err != nil {
			return nil, fmt.Errorf("scan lesson plan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *sqliteClassroomRepository) CreateLessonPlan(ctx context.Context, p *LessonPlan) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO course_lesson_plans (id, course_id, tanggal, title, material_id, note)
		VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, p.CourseID, p.Tanggal, p.Title, nilIfEmpty(p.MaterialID), p.Note)
	if err != nil {
		return fmt.Errorf("create lesson plan: %w", err)
	}
	return nil
}

func (r *sqliteClassroomRepository) UpdateLessonPlan(ctx context.Context, p *LessonPlan) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE course_lesson_plans SET tanggal=?, title=?, material_id=?, note=? WHERE id=?`,
		p.Tanggal, p.Title, nilIfEmpty(p.MaterialID), p.Note, p.ID)
	if err != nil {
		return fmt.Errorf("update lesson plan: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrClassroomNotFound
	}
	return nil
}

func (r *sqliteClassroomRepository) DeleteLessonPlan(ctx context.Context, id string) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM course_lesson_plans WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete lesson plan: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrClassroomNotFound
	}
	return nil
}

// ── Keaktifan siswa (poin kumulatif) ──

func (r *sqliteClassroomRepository) AddActivityPoint(ctx context.Context, p *ActivityPoint) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO course_activity_points (id, course_id, student_id, tanggal, points, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, p.CourseID, p.StudentID, p.Tanggal, p.Points, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("add activity point: %w", err)
	}
	return nil
}

func (r *sqliteClassroomRepository) Leaderboard(ctx context.Context, courseID, tanggal string) ([]*LeaderboardEntry, error) {
	// Kondisi tanggal ditaruh di ON clause supaya siswa tanpa poin tetap muncul (0).
	dateJoin, args := "", []interface{}{}
	if tanggal != "" {
		dateJoin = "AND p.tanggal = ?"
		args = append(args, tanggal)
	}
	args = append(args, courseID)
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, u.full_name, u.kelas, COALESCE(SUM(p.points),0), COUNT(p.id)
		FROM course_enrollments e
		JOIN users u ON u.id = e.student_id
		LEFT JOIN course_activity_points p
		       ON p.course_id = e.course_id AND p.student_id = e.student_id `+dateJoin+`
		WHERE e.course_id = ?
		GROUP BY u.id, u.full_name, u.kelas
		ORDER BY COALESCE(SUM(p.points),0) DESC, u.full_name ASC`, args...)
	if err != nil {
		return nil, fmt.Errorf("leaderboard: %w", err)
	}
	defer rows.Close()
	var out []*LeaderboardEntry
	for rows.Next() {
		e := &LeaderboardEntry{}
		if err := rows.Scan(&e.StudentID, &e.StudentName, &e.StudentKelas, &e.Points, &e.EntryCount); err != nil {
			return nil, fmt.Errorf("scan leaderboard: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *sqliteClassroomRepository) StudentPointTotals(ctx context.Context, courseID, studentID, tanggal string) (int, int, error) {
	var total, day int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(points),0) FROM course_activity_points WHERE course_id=? AND student_id=?`,
		courseID, studentID).Scan(&total); err != nil {
		return 0, 0, fmt.Errorf("student total: %w", err)
	}
	if err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(points),0) FROM course_activity_points WHERE course_id=? AND student_id=? AND tanggal=?`,
		courseID, studentID, tanggal).Scan(&day); err != nil {
		return 0, 0, fmt.Errorf("student day total: %w", err)
	}
	return total, day, nil
}
