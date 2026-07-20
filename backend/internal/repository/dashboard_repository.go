package repository

import (
	"context"
	"database/sql"
	"errors"
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
	SiswaLaki        int
	SiswaPerempuan   int
	SiswaPerJurusan  []JurusanCount
	SiswaPerKelas    []KelasCount
	TugasTerbaru     []*RecentAssignment
	PengumpulanTerbaru []*RecentSubmission
}

// RankEntry is one row of a class/major leaderboard.
type RankEntry struct {
	Peringkat int
	Name      string
	Kelas     string
	RataRata  float64
}

// StudentDashboard is the home summary shown to a student: their class/major,
// average grade, rank within their own class and major, plus top-5 leaderboards.
type StudentDashboard struct {
	Kelas            string
	Jurusan          string
	RataRataNilai    float64
	GradedCount      int
	PeringkatKelas   int
	TotalKelas       int
	PeringkatJurusan int
	TotalJurusan     int
	JuaraKelas       []RankEntry
	JuaraJurusan     []RankEntry
	AllKelas         []string
	AllJurusan       []string
}

type DashboardRepository interface {
	TeacherStats(ctx context.Context) (*TeacherDashboard, error)
	StudentStats(ctx context.Context, studentID string) (*StudentDashboard, error)
	// Leaderboard returns the top-5 students within a class or major, ordered by
	// average graded score. scope must be "kelas" or "jurusan".
	Leaderboard(ctx context.Context, scope, value string) ([]RankEntry, error)
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
	// Exclude the sentinel "Materi Umum" (general) course — it is not a real
	// subject and must not inflate the "Total Mata Pelajaran" stat.
	if d.TotalKelas, err = scalar(`SELECT COUNT(*) FROM courses WHERE id <> '` + GeneralCourseID + `'`); err != nil {
		return nil, fmt.Errorf("count courses: %w", err)
	}
	if d.TotalSiswa, err = scalar(`SELECT COUNT(*) FROM users WHERE role='student'`); err != nil {
		return nil, fmt.Errorf("count students: %w", err)
	}
	if d.TotalGuru, err = scalar(`SELECT COUNT(*) FROM users WHERE role='teacher'`); err != nil {
		return nil, fmt.Errorf("count teachers: %w", err)
	}
	if d.SiswaLaki, err = scalar(`SELECT COUNT(*) FROM users WHERE role='student' AND gender='L'`); err != nil {
		return nil, fmt.Errorf("count male students: %w", err)
	}
	if d.SiswaPerempuan, err = scalar(`SELECT COUNT(*) FROM users WHERE role='student' AND gender='P'`); err != nil {
		return nil, fmt.Errorf("count female students: %w", err)
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

// StudentStats returns one student's class/major, average graded score, and
// rank within their own class and major. A peer's score for ranking is
// COALESCE(AVG(score),0), so students without any graded work rank last (tied).
func (r *sqliteDashboardRepository) StudentStats(ctx context.Context, studentID string) (*StudentDashboard, error) {
	d := &StudentDashboard{}

	// This student's class, major, average grade, and graded-submission count.
	var avg sql.NullFloat64
	err := r.db.QueryRowContext(ctx, `
		SELECT u.kelas, u.jurusan, AVG(s.score), COUNT(s.score)
		FROM users u
		LEFT JOIN assignment_submissions s
		       ON s.student_id = u.id AND s.score IS NOT NULL
		WHERE u.id = ?
		GROUP BY u.id`, studentID).Scan(&d.Kelas, &d.Jurusan, &avg, &d.GradedCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("student not found: %s", studentID)
	}
	if err != nil {
		return nil, fmt.Errorf("student summary: %w", err)
	}
	if avg.Valid {
		d.RataRataNilai = avg.Float64
	}

	// Rank within a peer group defined by `col` (kelas / jurusan). col is a fixed
	// literal, never user input, so string interpolation here is safe.
	rank := func(col, val string) (rankN, total int, err error) {
		if err = r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM users WHERE role='student' AND `+col+` = ?`, val).Scan(&total); err != nil {
			return 0, 0, err
		}
		err = r.db.QueryRowContext(ctx, `
			SELECT COUNT(*)+1 FROM (
				SELECT u.id, COALESCE(AVG(s.score), 0) AS a
				FROM users u
				LEFT JOIN assignment_submissions s
				       ON s.student_id = u.id AND s.score IS NOT NULL
				WHERE u.role='student' AND u.`+col+` = ?
				GROUP BY u.id
			) t WHERE t.a > ?`, val, d.RataRataNilai).Scan(&rankN)
		return rankN, total, err
	}

	if d.PeringkatKelas, d.TotalKelas, err = rank("kelas", d.Kelas); err != nil {
		return nil, fmt.Errorf("rank kelas: %w", err)
	}
	if d.PeringkatJurusan, d.TotalJurusan, err = rank("jurusan", d.Jurusan); err != nil {
		return nil, fmt.Errorf("rank jurusan: %w", err)
	}

	if d.JuaraKelas, err = r.Leaderboard(ctx, "kelas", d.Kelas); err != nil {
		return nil, fmt.Errorf("juara kelas: %w", err)
	}
	if d.JuaraJurusan, err = r.Leaderboard(ctx, "jurusan", d.Jurusan); err != nil {
		return nil, fmt.Errorf("juara jurusan: %w", err)
	}

	// Distinct non-empty class/major names for the leaderboard dropdowns.
	if d.AllKelas, err = r.distinctStudentField(ctx, "kelas"); err != nil {
		return nil, fmt.Errorf("all kelas: %w", err)
	}
	if d.AllJurusan, err = r.distinctStudentField(ctx, "jurusan"); err != nil {
		return nil, fmt.Errorf("all jurusan: %w", err)
	}

	return d, nil
}

// leaderboardScope maps a scope name to its (whitelisted) users column so the
// value can never be arbitrary SQL.
func leaderboardScope(scope string) (string, bool) {
	switch scope {
	case "kelas":
		return "kelas", true
	case "jurusan":
		return "jurusan", true
	default:
		return "", false
	}
}

func (r *sqliteDashboardRepository) Leaderboard(ctx context.Context, scope, value string) ([]RankEntry, error) {
	col, ok := leaderboardScope(scope)
	if !ok {
		return nil, fmt.Errorf("invalid leaderboard scope: %q", scope)
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.full_name, u.kelas, COALESCE(AVG(s.score), 0) AS a
		FROM users u
		LEFT JOIN assignment_submissions s
		       ON s.student_id = u.id AND s.score IS NOT NULL
		WHERE u.role='student' AND u.`+col+` = ?
		GROUP BY u.id
		ORDER BY a DESC, u.full_name ASC
		LIMIT 5`, value)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RankEntry
	for rows.Next() {
		var e RankEntry
		if err := rows.Scan(&e.Name, &e.Kelas, &e.RataRata); err != nil {
			return nil, err
		}
		e.Peringkat = len(out) + 1
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *sqliteDashboardRepository) distinctStudentField(ctx context.Context, scope string) ([]string, error) {
	col, ok := leaderboardScope(scope)
	if !ok {
		return nil, fmt.Errorf("invalid scope: %q", scope)
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT DISTINCT `+col+` FROM users WHERE role='student' AND `+col+` <> '' ORDER BY `+col+` ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
