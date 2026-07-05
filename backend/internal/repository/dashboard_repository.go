package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type JurusanCount struct {
	Jurusan string
	Count   int
}

type KelasCount struct {
	Kelas string
	Count int
}

type RecentAssignment struct {
	ID              string
	Title           string
	CourseName      string
	Deadline        sql.NullTime
	SubmissionCount int
}

type RecentSubmission struct {
	StudentName     string
	Kelas           string
	AssignmentTitle string
	SubmittedAt     time.Time
	Graded          bool
}

type TeacherDashboard struct {
	TotalKelas       int
	TotalSiswa       int
	TotalMateri      int
	TotalTugas       int
	TotalPengumpulan int
	BelumKumpul      int
	PerluDinilai     int
	MateriPublikasi  int
	MateriDraft      int
	RataRataNilai    float64
	TotalGuru        int
	SiswaPerJurusan  []JurusanCount
	SiswaPerKelas    []KelasCount
	TugasTerbaru     []*RecentAssignment
	PengumpulanTerbaru []*RecentSubmission
}

type DashboardRepository interface {
	TeacherStats(ctx context.Context) (*TeacherDashboard, error)
}

type sqliteDashboardRepository struct{ db *sql.DB }

func NewDashboardRepository(db *sql.DB) DashboardRepository {
	return &sqliteDashboardRepository{db: db}
}

func (r *sqliteDashboardRepository) TeacherStats(ctx context.Context) (*TeacherDashboard, error) {
	d := &TeacherDashboard{}

	scalar := func(query string) (int, error) {
		var n int
		err := r.db.QueryRowContext(ctx, query).Scan(&n)
		return n, err
	}

	var err error
	if d.TotalKelas, err = scalar(`SELECT COUNT(*) FROM courses`); err != nil {
		return nil, fmt.Errorf("count courses: %w", err)
	}
	if d.TotalSiswa, err = scalar(`SELECT COUNT(*) FROM users WHERE role='student'`); err != nil {
		return nil, fmt.Errorf("count students: %w", err)
	}
	if d.TotalGuru, err = scalar(`SELECT COUNT(*) FROM users WHERE role='teacher'`); err != nil {
		return nil, fmt.Errorf("count teachers: %w", err)
	}
	if d.TotalMateri, err = scalar(`SELECT COUNT(*) FROM course_materials`); err != nil {
		return nil, fmt.Errorf("count materials: %w", err)
	}
	if d.MateriPublikasi, err = scalar(`SELECT COUNT(*) FROM course_materials WHERE is_published=1`); err != nil {
		return nil, fmt.Errorf("count published: %w", err)
	}
	d.MateriDraft = d.TotalMateri - d.MateriPublikasi
	if d.TotalTugas, err = scalar(`SELECT COUNT(*) FROM assignments`); err != nil {
		return nil, fmt.Errorf("count assignments: %w", err)
	}
	if d.TotalPengumpulan, err = scalar(`SELECT COUNT(*) FROM assignment_submissions`); err != nil {
		return nil, fmt.Errorf("count submissions: %w", err)
	}
	if d.PerluDinilai, err = scalar(`SELECT COUNT(*) FROM assignment_submissions WHERE score IS NULL`); err != nil {
		return nil, fmt.Errorf("count ungraded: %w", err)
	}

	// Expected submissions = sum over assignments of enrolled students in their course.
	var expected int
	if err = r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(
			(SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = a.course_id)
		), 0) FROM assignments a`).Scan(&expected); err != nil {
		return nil, fmt.Errorf("count expected: %w", err)
	}
	d.BelumKumpul = expected - d.TotalPengumpulan
	if d.BelumKumpul < 0 {
		d.BelumKumpul = 0
	}

	// Average graded score.
	var avg sql.NullFloat64
	if err = r.db.QueryRowContext(ctx, `SELECT AVG(score) FROM assignment_submissions WHERE score IS NOT NULL`).Scan(&avg); err != nil {
		return nil, fmt.Errorf("avg score: %w", err)
	}
	if avg.Valid {
		d.RataRataNilai = avg.Float64
	}

	// Students per major.
	rows, err := r.db.QueryContext(ctx, `
		SELECT CASE WHEN jurusan='' THEN '(Tanpa Jurusan)' ELSE jurusan END AS j, COUNT(*)
		FROM users WHERE role='student' GROUP BY j ORDER BY COUNT(*) DESC`)
	if err != nil {
		return nil, fmt.Errorf("students per major: %w", err)
	}
	for rows.Next() {
		var jc JurusanCount
		if err := rows.Scan(&jc.Jurusan, &jc.Count); err != nil {
			rows.Close()
			return nil, err
		}
		d.SiswaPerJurusan = append(d.SiswaPerJurusan, jc)
	}
	rows.Close()

	// Students per class (each distinct class name, e.g. X-TKJ-1 vs X-TKJ-2).
	krows, err := r.db.QueryContext(ctx, `
		SELECT CASE WHEN kelas='' THEN '(Tanpa Kelas)' ELSE kelas END AS k, COUNT(*)
		FROM users WHERE role='student' GROUP BY k ORDER BY k ASC`)
	if err != nil {
		return nil, fmt.Errorf("students per class: %w", err)
	}
	for krows.Next() {
		var kc KelasCount
		if err := krows.Scan(&kc.Kelas, &kc.Count); err != nil {
			krows.Close()
			return nil, err
		}
		d.SiswaPerKelas = append(d.SiswaPerKelas, kc)
	}
	krows.Close()

	// Recent assignments.
	arows, err := r.db.QueryContext(ctx, `
		SELECT a.id, a.title, c.name, a.deadline,
		       (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id=a.id)
		FROM assignments a JOIN courses c ON c.id=a.course_id
		ORDER BY a.created_at DESC LIMIT 5`)
	if err != nil {
		return nil, fmt.Errorf("recent assignments: %w", err)
	}
	for arows.Next() {
		ra := &RecentAssignment{}
		if err := arows.Scan(&ra.ID, &ra.Title, &ra.CourseName, &ra.Deadline, &ra.SubmissionCount); err != nil {
			arows.Close()
			return nil, err
		}
		d.TugasTerbaru = append(d.TugasTerbaru, ra)
	}
	arows.Close()

	// Recent submissions.
	srows, err := r.db.QueryContext(ctx, `
		SELECT u.full_name, u.kelas, a.title, s.submitted_at, (s.score IS NOT NULL)
		FROM assignment_submissions s
		JOIN users u ON u.id=s.student_id
		JOIN assignments a ON a.id=s.assignment_id
		ORDER BY s.submitted_at DESC LIMIT 5`)
	if err != nil {
		return nil, fmt.Errorf("recent submissions: %w", err)
	}
	for srows.Next() {
		rs := &RecentSubmission{}
		var submittedAt sql.NullTime
		var graded int
		if err := srows.Scan(&rs.StudentName, &rs.Kelas, &rs.AssignmentTitle, &submittedAt, &graded); err != nil {
			srows.Close()
			return nil, err
		}
		rs.SubmittedAt = submittedAt.Time
		rs.Graded = graded == 1
		d.PengumpulanTerbaru = append(d.PengumpulanTerbaru, rs)
	}
	srows.Close()

	return d, nil
}
