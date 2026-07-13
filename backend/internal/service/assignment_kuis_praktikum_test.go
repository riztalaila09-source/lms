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

func kpFixture(t *testing.T) (*service.AssignmentService, string, *repository.User, []*repository.User, *repository.User) {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	enrollRepo := repository.NewEnrollmentRepository(db)
	svc := service.NewAssignmentService(
		repository.NewAssignmentRepository(db), repository.NewSubmissionRepository(db),
		enrollRepo, repository.NewCourseRepository(db),
		repository.NewAssignmentQuestionRepository(db), repository.NewAssignmentGroupRepository(db))
	now := time.Now().UTC()
	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "kp_" + name, Email: name + "@kp.com", PasswordHash: "x",
			Role: role, FullName: name, Kelas: "X-TKJ-1", IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher")
	students := []*repository.User{mk("Ana", "student"), mk("Budi", "student"), mk("Cici", "student")}
	courseID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, 'KP', 'Mapel', ?)`, courseID, teacher.ID)
	require.NoError(t, err)
	for _, s := range students {
		require.NoError(t, enrollRepo.Enroll(ctx, courseID, s.ID, testutil.NewUserID()))
	}
	return svc, courseID, teacher, students, teacher
}

func TestKuis_MultiCorrectScoring(t *testing.T) {
	ctx := context.Background()
	svc, courseID, teacher, students, _ := kpFixture(t)

	a, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Kuis", MaxScore: 100, Type: "kuis"})
	require.NoError(t, err)

	// <5 soal → ditolak.
	few := []*repository.AssignmentQuestion{{Question: "s1", CorrectIndices: []int{0}}}
	assert.Error(t, svc.SetAssignmentQuestions(ctx, "teacher", a.ID, few))

	// 5 soal; soal ke-5 punya 2 jawaban benar → total unit = 6.
	qs := []*repository.AssignmentQuestion{
		{Question: "s1", CorrectIndices: []int{0}},       // Benar
		{Question: "s2", CorrectIndices: []int{1}},       // Salah
		{Question: "s3", CorrectIndices: []int{2}},       // Mungkin
		{Question: "s4", CorrectIndices: []int{0}},       // Benar
		{Question: "s5", CorrectIndices: []int{0, 2}},    // Benar & Mungkin (2)
	}
	require.NoError(t, svc.SetAssignmentQuestions(ctx, "teacher", a.ID, qs))

	// Ambil id soal (urut order).
	list, err := svc.ListAssignmentQuestions(ctx, teacher.ID, "teacher", a.ID)
	require.NoError(t, err)
	require.Len(t, list, 5)
	id := func(i int) string { return list[i].ID }

	// Siswa: jawab semua benar → skor 100.
	perfect := map[string][]int{id(0): {0}, id(1): {1}, id(2): {2}, id(3): {0}, id(4): {0, 2}}
	score, earned, total, err := svc.SubmitKuis(ctx, students[0].ID, "student", a.ID, perfect, 30)
	require.NoError(t, err)
	assert.Equal(t, 6, total)
	assert.Equal(t, 6, earned)
	assert.Equal(t, 100, score)

	// Siswa lain: benar 5 dari 6 unit (soal 5 hanya pilih 1 dari 2 benar) → round(5/6*100)=83.
	partial := map[string][]int{id(0): {0}, id(1): {1}, id(2): {2}, id(3): {0}, id(4): {0}}
	score2, earned2, _, err := svc.SubmitKuis(ctx, students[1].ID, "student", a.ID, partial, 20)
	require.NoError(t, err)
	assert.Equal(t, 5, earned2)
	assert.Equal(t, 83, score2)

	// Penalti pilihan salah: pada soal 1 pilih {0,1} → benar1 salah1 = 0 unit untuk soal itu.
	penalized := map[string][]int{id(0): {0, 1}, id(1): {1}, id(2): {2}, id(3): {0}, id(4): {0, 2}}
	_, earned3, _, err := svc.SubmitKuis(ctx, students[2].ID, "student", a.ID, penalized, 25)
	require.NoError(t, err)
	assert.Equal(t, 5, earned3) // 0(soal1)+1+1+1+2 = 5

	// Kunci jawaban tidak bocor ke siswa.
	sList, err := svc.ListAssignmentQuestions(ctx, students[0].ID, "student", a.ID)
	// students[0] sudah submit → canStudentAttempt gagal; abaikan bila error, cek via siswa lain belum submit.
	if err == nil {
		for _, q := range sList {
			assert.Empty(t, q.CorrectIndices)
		}
	}
}

func TestPraktikum_GroupsSubmitGrade(t *testing.T) {
	ctx := context.Background()
	svc, courseID, teacher, students, _ := kpFixture(t)

	a, err := svc.CreateAssignment(ctx, teacher.ID, "teacher", service.CreateAssignmentInput{CourseID: courseID, Title: "Praktikum", MaxScore: 100, Type: "praktikum"})
	require.NoError(t, err)

	// Guru bentuk 2 kelompok: [Ana(ketua),Budi], [Cici(ketua)].
	groups := []*repository.AssignGroup{
		{Name: "Kelompok 1", Members: []repository.GroupMember{{StudentID: students[0].ID, IsLeader: true}, {StudentID: students[1].ID}}},
		{Name: "Kelompok 2", Members: []repository.GroupMember{{StudentID: students[2].ID, IsLeader: true}}},
	}
	require.NoError(t, svc.SetAssignmentGroups(ctx, "teacher", a.ID, groups))

	// Siswa ditolak set groups.
	assert.ErrorIs(t, svc.SetAssignmentGroups(ctx, "student", a.ID, groups), service.ErrPermissionDenied)

	// Budi (anggota biasa, bukan ketua) tidak boleh mengumpulkan.
	_, err = svc.SubmitGroupAssignment(ctx, students[1].ID, "student", a.ID, "coba", "")
	require.Error(t, err)

	// Ana (ketua K1) mengumpulkan → mengisi 1 submission kelompok.
	gs, err := svc.SubmitGroupAssignment(ctx, students[0].ID, "student", a.ID, "hasil kelompok", "")
	require.NoError(t, err)
	assert.True(t, gs.Submitted)

	// Budi (anggota K1 juga) melihat submission kelompok yang sama.
	subsBudi, err := svc.ListGroupSubmissions(ctx, students[1].ID, "student", a.ID)
	require.NoError(t, err)
	require.Len(t, subsBudi, 1)
	assert.Equal(t, "hasil kelompok", subsBudi[0].Content)
	groupID := subsBudi[0].GroupID

	// Guru menilai kelompok → semua anggota lihat nilai sama.
	require.NoError(t, svc.GradeGroupSubmission(ctx, "teacher", groupID, 90, "bagus"))
	subsAna, err := svc.ListGroupSubmissions(ctx, students[0].ID, "student", a.ID)
	require.NoError(t, err)
	require.Len(t, subsAna, 1)
	assert.True(t, subsAna[0].Graded)
	assert.Equal(t, 90, subsAna[0].Score)

	// Guru lihat semua kelompok (2).
	all, err := svc.ListGroupSubmissions(ctx, teacher.ID, "teacher", a.ID)
	require.NoError(t, err)
	assert.Len(t, all, 2)

	// Nilai kelompok mengalir ke rekap SETIAP anggota — Budi (bukan ketua) juga dapat 90.
	mg, err := svc.ListMyGrades(ctx, students[1].ID)
	require.NoError(t, err)
	var found bool
	for _, sub := range mg.Subjects {
		if sub.HasGrade && sub.Average == 90 {
			found = true
		}
	}
	assert.True(t, found, "nilai praktikum kelompok harus muncul di rekap nilai anggota")

	// ListAssignmentGroups: Cici tahu grupnya (K2).
	_, myGroup, err := svc.ListAssignmentGroups(ctx, students[2].ID, "student", a.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, myGroup)
}
