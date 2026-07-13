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

var ErrGroupNotFound = errors.New("assignment group not found")

type GroupMember struct {
	StudentID    string
	StudentName  string
	StudentKelas string
	IsLeader     bool
}

type AssignGroup struct {
	ID           string
	AssignmentID string
	Name         string
	Members      []GroupMember
}

type PraktikumScore struct {
	AssignmentID string
	StudentID    string
	Score        int
}

type GroupSubmission struct {
	GroupID         string
	GroupName       string
	Content         string
	FileURL         string
	Submitted       bool
	SubmittedAt     time.Time
	Graded          bool
	Score           int
	Feedback        string
	SubmittedByName string
}

type AssignmentGroupRepository interface {
	SetGroups(ctx context.Context, assignmentID string, groups []*AssignGroup) error
	ListGroups(ctx context.Context, assignmentID string) ([]*AssignGroup, error)
	GroupOfStudent(ctx context.Context, assignmentID, studentID string) (string, error)
	IsGroupLeader(ctx context.Context, groupID, studentID string) (bool, error)
	// PraktikumScores mengembalikan nilai kelompok untuk SETIAP anggota
	// (nilai kelompok = nilai semua anggotanya) pada assignment praktikum.
	PraktikumScores(ctx context.Context, assignmentIDs []string) ([]PraktikumScore, error)
	UpsertGroupSubmission(ctx context.Context, groupID, content, fileURL, submittedBy string) error
	ListGroupSubmissions(ctx context.Context, assignmentID string) ([]*GroupSubmission, error)
	GroupSubmissionByGroup(ctx context.Context, groupID string) (*GroupSubmission, error)
	GradeGroupSubmission(ctx context.Context, groupID string, score int, feedback string) error
}

type sqliteAssignmentGroupRepository struct{ db *sql.DB }

func NewAssignmentGroupRepository(db *sql.DB) AssignmentGroupRepository {
	return &sqliteAssignmentGroupRepository{db: db}
}

func (r *sqliteAssignmentGroupRepository) SetGroups(ctx context.Context, assignmentID string, groups []*AssignGroup) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Hapus grup lama (cascade ke members + submissions).
	if _, err := tx.ExecContext(ctx, `DELETE FROM assignment_groups WHERE assignment_id = ?`, assignmentID); err != nil {
		return fmt.Errorf("clear groups: %w", err)
	}
	for _, g := range groups {
		gid := uuid.New().String()
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO assignment_groups (id, assignment_id, name) VALUES (?, ?, ?)`,
			gid, assignmentID, g.Name); err != nil {
			return fmt.Errorf("insert group: %w", err)
		}
		for _, m := range g.Members {
			lead := 0
			if m.IsLeader {
				lead = 1
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO assignment_group_members (id, group_id, student_id, is_leader) VALUES (?, ?, ?, ?)`,
				uuid.New().String(), gid, m.StudentID, lead); err != nil {
				return fmt.Errorf("insert member: %w", err)
			}
		}
	}
	return tx.Commit()
}

func (r *sqliteAssignmentGroupRepository) ListGroups(ctx context.Context, assignmentID string) ([]*AssignGroup, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT g.id, g.name FROM assignment_groups g
		WHERE g.assignment_id = ? ORDER BY g.name ASC`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}
	defer rows.Close()
	var groups []*AssignGroup
	byID := map[string]*AssignGroup{}
	for rows.Next() {
		g := &AssignGroup{AssignmentID: assignmentID}
		if err := rows.Scan(&g.ID, &g.Name); err != nil {
			return nil, fmt.Errorf("scan group: %w", err)
		}
		groups = append(groups, g)
		byID[g.ID] = g
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Anggota tiap grup.
	mrows, err := r.db.QueryContext(ctx, `
		SELECT m.group_id, u.id, u.full_name, u.kelas, m.is_leader
		FROM assignment_group_members m
		JOIN assignment_groups g ON g.id = m.group_id
		JOIN users u ON u.id = m.student_id
		WHERE g.assignment_id = ? ORDER BY m.is_leader DESC, u.full_name ASC`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer mrows.Close()
	for mrows.Next() {
		var gid string
		var m GroupMember
		var lead int
		if err := mrows.Scan(&gid, &m.StudentID, &m.StudentName, &m.StudentKelas, &lead); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		m.IsLeader = lead != 0
		if g := byID[gid]; g != nil {
			g.Members = append(g.Members, m)
		}
	}
	return groups, mrows.Err()
}

func (r *sqliteAssignmentGroupRepository) GroupOfStudent(ctx context.Context, assignmentID, studentID string) (string, error) {
	var gid string
	err := r.db.QueryRowContext(ctx, `
		SELECT m.group_id FROM assignment_group_members m
		JOIN assignment_groups g ON g.id = m.group_id
		WHERE g.assignment_id = ? AND m.student_id = ?`, assignmentID, studentID).Scan(&gid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("group of student: %w", err)
	}
	return gid, nil
}

func (r *sqliteAssignmentGroupRepository) IsGroupLeader(ctx context.Context, groupID, studentID string) (bool, error) {
	var lead int
	err := r.db.QueryRowContext(ctx,
		`SELECT is_leader FROM assignment_group_members WHERE group_id = ? AND student_id = ?`,
		groupID, studentID).Scan(&lead)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("is group leader: %w", err)
	}
	return lead != 0, nil
}

func (r *sqliteAssignmentGroupRepository) PraktikumScores(ctx context.Context, assignmentIDs []string) ([]PraktikumScore, error) {
	if len(assignmentIDs) == 0 {
		return nil, nil
	}
	ph := make([]string, len(assignmentIDs))
	args := make([]interface{}, len(assignmentIDs))
	for i, id := range assignmentIDs {
		ph[i] = "?"
		args[i] = id
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT g.assignment_id, m.student_id, s.score
		FROM assignment_group_members m
		JOIN assignment_groups g ON g.id = m.group_id
		JOIN assignment_group_submissions s ON s.group_id = g.id
		WHERE g.assignment_id IN (`+strings.Join(ph, ",")+`) AND s.score IS NOT NULL`, args...)
	if err != nil {
		return nil, fmt.Errorf("praktikum scores: %w", err)
	}
	defer rows.Close()
	var out []PraktikumScore
	for rows.Next() {
		var p PraktikumScore
		if err := rows.Scan(&p.AssignmentID, &p.StudentID, &p.Score); err != nil {
			return nil, fmt.Errorf("scan praktikum score: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *sqliteAssignmentGroupRepository) UpsertGroupSubmission(ctx context.Context, groupID, content, fileURL, submittedBy string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO assignment_group_submissions (id, group_id, content, file_url, submitted_by, submitted_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(group_id) DO UPDATE SET content=excluded.content, file_url=excluded.file_url,
			submitted_by=excluded.submitted_by, submitted_at=excluded.submitted_at`,
		uuid.New().String(), groupID, content, fileURL, submittedBy, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("upsert group submission: %w", err)
	}
	return nil
}

const groupSubCols = `
	g.id, g.name,
	COALESCE(s.content,''), COALESCE(s.file_url,''),
	s.submitted_at, s.score, COALESCE(s.feedback,''), COALESCE(u.full_name,'')`

func scanGroupSub(scan func(dest ...any) error) (*GroupSubmission, error) {
	gs := &GroupSubmission{}
	var submittedAt sql.NullTime
	var score sql.NullInt64
	if err := scan(&gs.GroupID, &gs.GroupName, &gs.Content, &gs.FileURL, &submittedAt, &score, &gs.Feedback, &gs.SubmittedByName); err != nil {
		return nil, err
	}
	if submittedAt.Valid {
		gs.Submitted = true
		gs.SubmittedAt = submittedAt.Time
	}
	if score.Valid {
		gs.Graded = true
		gs.Score = int(score.Int64)
	}
	return gs, nil
}

func (r *sqliteAssignmentGroupRepository) ListGroupSubmissions(ctx context.Context, assignmentID string) ([]*GroupSubmission, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+groupSubCols+`
		FROM assignment_groups g
		LEFT JOIN assignment_group_submissions s ON s.group_id = g.id
		LEFT JOIN users u ON u.id = s.submitted_by
		WHERE g.assignment_id = ? ORDER BY g.name ASC`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("list group submissions: %w", err)
	}
	defer rows.Close()
	var out []*GroupSubmission
	for rows.Next() {
		gs, err := scanGroupSub(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("scan group submission: %w", err)
		}
		out = append(out, gs)
	}
	return out, rows.Err()
}

func (r *sqliteAssignmentGroupRepository) GroupSubmissionByGroup(ctx context.Context, groupID string) (*GroupSubmission, error) {
	gs, err := scanGroupSub(r.db.QueryRowContext(ctx, `
		SELECT `+groupSubCols+`
		FROM assignment_groups g
		LEFT JOIN assignment_group_submissions s ON s.group_id = g.id
		LEFT JOIN users u ON u.id = s.submitted_by
		WHERE g.id = ?`, groupID).Scan)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrGroupNotFound
		}
		return nil, fmt.Errorf("group submission: %w", err)
	}
	return gs, nil
}

func (r *sqliteAssignmentGroupRepository) GradeGroupSubmission(ctx context.Context, groupID string, score int, feedback string) error {
	// Pastikan ada baris submission untuk grup ini (bisa dinilai walau kosong).
	res, err := r.db.ExecContext(ctx, `
		UPDATE assignment_group_submissions SET score=?, feedback=?, graded_at=? WHERE group_id=?`,
		score, feedback, time.Now().UTC(), groupID)
	if err != nil {
		return fmt.Errorf("grade group: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, err = r.db.ExecContext(ctx, `
			INSERT INTO assignment_group_submissions (id, group_id, score, feedback, graded_at)
			VALUES (?, ?, ?, ?, ?)`,
			uuid.New().String(), groupID, score, feedback, time.Now().UTC())
		if err != nil {
			return fmt.Errorf("grade group insert: %w", err)
		}
	}
	return nil
}
