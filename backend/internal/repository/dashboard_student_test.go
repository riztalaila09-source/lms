package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

// StudentStats computes a student's average graded score and their rank within
// their own class and major (COALESCE(AVG,0) so ungraded students rank last).
func TestDashboardRepository_StudentStats(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	userRepo := repository.NewUserRepository(db)
	dashRepo := repository.NewDashboardRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	mkStudent := func(name, kelas, jurusan string) *repository.User {
		u := &repository.User{
			ID: testutil.NewUserID(), Username: "d_" + name, Email: name + "@d.com", PasswordHash: "x",
			Role: "student", FullName: name, IsActive: true, Kelas: kelas, Jurusan: jurusan,
			CreatedAt: now, UpdatedAt: now,
		}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := &repository.User{ID: testutil.NewUserID(), Username: "d_t", Email: "t@d.com", PasswordHash: "x",
		Role: "teacher", FullName: "Teacher", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))

	// Unique class/major names so seeded demo students don't pollute the counts.
	// Class UJI-A / major UJITKJ.
	alice := mkStudent("Alice", "UJI-A", "UJITKJ")
	bob := mkStudent("Bob", "UJI-A", "UJITKJ")
	carol := mkStudent("Carol", "UJI-A", "UJITKJ")
	dave := mkStudent("Dave", "UJI-B", "UJITKJ") // same major, different class
	eve := mkStudent("Eve", "UJI-C", "UJIRPL")   // different major — must not affect UJITKJ ranking

	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?,?,?,?)`,
		courseID, "MAT", "Matematika", teacher.ID)
	require.NoError(t, err)

	mkAssignment := func(title string) string {
		id := testutil.NewUserID()
		_, err := db.ExecContext(ctx, `INSERT INTO assignments (id, course_id, title, created_by) VALUES (?,?,?,?)`,
			id, courseID, title, teacher.ID)
		require.NoError(t, err)
		return id
	}
	a1, a2, a3 := mkAssignment("A1"), mkAssignment("A2"), mkAssignment("A3")

	submit := func(assignmentID, studentID string, score interface{}) {
		_, err := db.ExecContext(ctx,
			`INSERT INTO assignment_submissions (id, assignment_id, student_id, score) VALUES (?,?,?,?)`,
			testutil.NewUserID(), assignmentID, studentID, score)
		require.NoError(t, err)
	}
	// Averages: Alice=(80+100)/2=90, Bob=80, Carol=70, Dave=85, Eve=95.
	submit(a1, alice.ID, 80)
	submit(a2, alice.ID, 100)
	submit(a3, alice.ID, nil) // ungraded — excluded from avg & graded count
	submit(a1, bob.ID, 80)
	submit(a1, carol.ID, 70)
	submit(a1, dave.ID, 85)
	submit(a1, eve.ID, 95)

	// ── Alice: top of both her class and major. ──
	got, err := dashRepo.StudentStats(ctx, alice.ID)
	require.NoError(t, err)
	assert.Equal(t, "UJI-A", got.Kelas)
	assert.Equal(t, "UJITKJ", got.Jurusan)
	assert.InDelta(t, 90.0, got.RataRataNilai, 0.01)
	assert.Equal(t, 2, got.GradedCount, "NULL score not counted")
	assert.Equal(t, 1, got.PeringkatKelas)
	assert.Equal(t, 3, got.TotalKelas)
	assert.Equal(t, 1, got.PeringkatJurusan)
	assert.Equal(t, 4, got.TotalJurusan)

	// Leaderboard within the class: Alice(90) > Bob(80) > Carol(70).
	require.Len(t, got.JuaraKelas, 3)
	assert.Equal(t, []string{"Alice", "Bob", "Carol"}, []string{got.JuaraKelas[0].Name, got.JuaraKelas[1].Name, got.JuaraKelas[2].Name})
	assert.Equal(t, 1, got.JuaraKelas[0].Peringkat)
	assert.InDelta(t, 90.0, got.JuaraKelas[0].RataRata, 0.01)

	// Leaderboard within the major: Alice(90) > Dave(85) > Bob(80) > Carol(70).
	require.Len(t, got.JuaraJurusan, 4)
	assert.Equal(t, []string{"Alice", "Dave", "Bob", "Carol"},
		[]string{got.JuaraJurusan[0].Name, got.JuaraJurusan[1].Name, got.JuaraJurusan[2].Name, got.JuaraJurusan[3].Name})
	assert.Equal(t, 2, got.JuaraJurusan[1].Peringkat)
	assert.Equal(t, "UJI-B", got.JuaraJurusan[1].Kelas) // Dave's class shown in major board

	// Dropdown option lists include our unique groups.
	assert.Subset(t, got.AllKelas, []string{"UJI-A", "UJI-B", "UJI-C"})
	assert.Subset(t, got.AllJurusan, []string{"UJITKJ", "UJIRPL"})

	// ── Bob: 2nd in class (behind Alice), 3rd in major (behind Alice & Dave). ──
	got, err = dashRepo.StudentStats(ctx, bob.ID)
	require.NoError(t, err)
	assert.InDelta(t, 80.0, got.RataRataNilai, 0.01)
	assert.Equal(t, 2, got.PeringkatKelas)
	assert.Equal(t, 3, got.TotalKelas)
	assert.Equal(t, 3, got.PeringkatJurusan)
	assert.Equal(t, 4, got.TotalJurusan)

	// ── Leaderboard(scope) directly, for another class the caller isn't in. ──
	board, err := dashRepo.Leaderboard(ctx, "kelas", "UJI-B")
	require.NoError(t, err)
	require.Len(t, board, 1)
	assert.Equal(t, "Dave", board[0].Name)
	assert.Equal(t, 1, board[0].Peringkat)

	majorBoard, err := dashRepo.Leaderboard(ctx, "jurusan", "UJITKJ")
	require.NoError(t, err)
	require.Len(t, majorBoard, 4)
	assert.Equal(t, "Alice", majorBoard[0].Name)

	_, err = dashRepo.Leaderboard(ctx, "bogus", "x")
	assert.Error(t, err, "invalid scope rejected")
}

// StudentStats returns zeros for a student with no graded work but still ranks
// them (last, tied) in their group.
func TestDashboardRepository_StudentStats_NoGrades(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	dashRepo := repository.NewDashboardRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	u := &repository.User{ID: testutil.NewUserID(), Username: "d_solo", Email: "solo@d.com", PasswordHash: "x",
		Role: "student", FullName: "Solo", IsActive: true, Kelas: "UJI-SOLO", Jurusan: "UJISOLO", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, u))

	got, err := dashRepo.StudentStats(ctx, u.ID)
	require.NoError(t, err)
	assert.Equal(t, 0.0, got.RataRataNilai)
	assert.Equal(t, 0, got.GradedCount)
	assert.Equal(t, 1, got.PeringkatKelas)
	assert.Equal(t, 1, got.TotalKelas)
	assert.Equal(t, 1, got.PeringkatJurusan)
	assert.Equal(t, 1, got.TotalJurusan)
}
