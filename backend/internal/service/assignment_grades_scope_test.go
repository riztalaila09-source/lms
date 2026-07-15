package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

// Saat kelas difilter, kolom tugas PRAKTIKUM hanya muncul untuk kelas yang punya
// kelompok pada tugas itu; tugas uraian tetap muncul untuk semua kelas.
func TestListGrades_KelasScopesPraktikumColumns(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	svc := service.NewAssignmentService(
		repository.NewAssignmentRepository(db), repository.NewSubmissionRepository(db),
		enrollRepo, repository.NewCourseRepository(db),
		repository.NewAssignmentQuestionRepository(db), repository.NewAssignmentGroupRepository(db))
	now := time.Now().UTC()

	mk := func(name, kelas string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "gs_" + name, Email: name + "@gs.com", PasswordHash: "x",
			Role: "student", FullName: name, Kelas: kelas, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := &repository.User{ID: testutil.NewUserID(), Username: "gst", Email: "gst@gs.com", PasswordHash: "x", Role: "teacher", FullName: "Guru", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))
	tkj := mk("Tono", "X-TKJ-1")
	rpl := mk("Rani", "X-RPL-1")

	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, 'MTK', 'Matematika', ?)`, courseID, teacher.ID)
	require.NoError(t, err)
	require.NoError(t, enrollRepo.Enroll(ctx, courseID, tkj.ID, testutil.NewUserID()))
	require.NoError(t, enrollRepo.Enroll(ctx, courseID, rpl.ID, testutil.NewUserID()))

	// Tugas uraian (berlaku semua kelas) + praktikum (kelompok hanya untuk X-TKJ-1).
	uraian, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Uraian", MaxScore: 100, Type: "uraian"})
	require.NoError(t, err)
	prak, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Praktikum", MaxScore: 100, Type: "praktikum"})
	require.NoError(t, err)
	require.NoError(t, svc.SetAssignmentGroups(ctx, "teacher", prak.ID, []*repository.AssignGroup{
		{Name: "X-TKJ-1 - Kelompok 1", Members: []repository.GroupMember{{StudentID: tkj.ID, IsLeader: true}}},
	}))

	// Kelas X-TKJ-1 → dua kolom (uraian + praktikum).
	gTkj, err := svc.ListGrades(ctx, teacher.ID, "teacher", courseID, "X-TKJ-1", "")
	require.NoError(t, err)
	assert.Len(t, gTkj.Columns, 2)

	// Kelas X-RPL-1 (tak punya kelompok praktikum) → hanya kolom uraian; siswa tetap tampil.
	gRpl, err := svc.ListGrades(ctx, teacher.ID, "teacher", courseID, "X-RPL-1", "")
	require.NoError(t, err)
	require.Len(t, gRpl.Columns, 1)
	assert.Equal(t, uraian.ID, gRpl.Columns[0].AssignmentID)
	require.Len(t, gRpl.Rows, 1)
	assert.Equal(t, "Rani", gRpl.Rows[0].StudentName)

	// Tanpa filter kelas → semua kolom tampil.
	gAll, err := svc.ListGrades(ctx, teacher.ID, "teacher", courseID, "", "")
	require.NoError(t, err)
	assert.Len(t, gAll.Columns, 2)
}
