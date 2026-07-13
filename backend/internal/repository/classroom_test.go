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

func classroomFixture(t *testing.T) (*repository.Course, []*repository.User, repository.ClassroomRepository, *repository.Material, func()) {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC()

	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "cr_" + name, Email: name + "@cr.com", PasswordHash: "x",
			Role: role, FullName: name, Kelas: "X-TKJ-1", IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher")
	s1 := mk("Ana", "student")
	s2 := mk("Budi", "student")

	courseID, matID := testutil.NewUserID(), testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO courses (id, code, name, teacher_id) VALUES (?, ?, ?, ?)`,
		courseID, "C1", "Mapel 1", teacher.ID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO course_materials (id, course_id, title, content_type, is_published, created_by)
		VALUES (?, ?, ?, 'text', 1, ?)`, matID, courseID, "Materi A", teacher.ID)
	require.NoError(t, err)
	for _, s := range []*repository.User{s1, s2} {
		_, err = db.ExecContext(ctx, `INSERT INTO course_enrollments (id, course_id, student_id) VALUES (?, ?, ?)`,
			testutil.NewUserID(), courseID, s.ID)
		require.NoError(t, err)
	}

	course := &repository.Course{ID: courseID}
	mat := &repository.Material{ID: matID, Title: "Materi A"}
	cleanup := func() { _, _ = db.ExecContext(ctx, `DELETE FROM courses WHERE id=?`, courseID) }
	return course, []*repository.User{teacher, s1, s2}, repository.NewClassroomRepository(db), mat, cleanup
}

func TestClassroom_Schedule_CRUD(t *testing.T) {
	course, _, repo, _, _ := classroomFixture(t)
	ctx := context.Background()

	s := &repository.Schedule{ID: testutil.NewUserID(), CourseID: course.ID, DayOfWeek: 1, JamKeMulai: 1, JamKeAkhir: 2, Kelas: "X-TKJ-1", Ruang: "Lab"}
	require.NoError(t, repo.CreateSchedule(ctx, s))

	list, err := repo.ListSchedules(ctx, course.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "Lab", list[0].Ruang)

	s.Ruang = "Kelas 2"
	require.NoError(t, repo.UpdateSchedule(ctx, s))
	list, _ = repo.ListSchedules(ctx, course.ID)
	assert.Equal(t, "Kelas 2", list[0].Ruang)

	require.NoError(t, repo.DeleteSchedule(ctx, s.ID))
	list, _ = repo.ListSchedules(ctx, course.ID)
	assert.Empty(t, list)
	assert.ErrorIs(t, repo.DeleteSchedule(ctx, s.ID), repository.ErrClassroomNotFound)
}

func TestClassroom_LessonPlan_WithMaterialTitle(t *testing.T) {
	course, _, repo, mat, _ := classroomFixture(t)
	ctx := context.Background()

	p := &repository.LessonPlan{ID: testutil.NewUserID(), CourseID: course.ID, Tanggal: "2026-08-01", Title: "Bab 1", MaterialID: mat.ID, Note: "catatan"}
	require.NoError(t, repo.CreateLessonPlan(ctx, p))

	list, err := repo.ListLessonPlans(ctx, course.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "Bab 1", list[0].Title)
	assert.Equal(t, mat.ID, list[0].MaterialID)
	assert.Equal(t, "Materi A", list[0].MaterialTitle) // join

	// Plan tanpa materi → material_id kosong, tak error.
	p2 := &repository.LessonPlan{ID: testutil.NewUserID(), CourseID: course.ID, Tanggal: "2026-08-02", Title: "Bab 2"}
	require.NoError(t, repo.CreateLessonPlan(ctx, p2))
	list, _ = repo.ListLessonPlans(ctx, course.ID)
	require.Len(t, list, 2)

	require.NoError(t, repo.DeleteLessonPlan(ctx, p.ID))
	list, _ = repo.ListLessonPlans(ctx, course.ID)
	require.Len(t, list, 1)
}

func TestClassroom_ActivityPoints_CumulativeAndLeaderboard(t *testing.T) {
	course, users, repo, _, _ := classroomFixture(t)
	ctx := context.Background()
	const d1, d2 = "2026-08-05", "2026-08-06"
	ana, budi := users[1].ID, users[2].ID

	add := func(student, tgl string, pts int) {
		require.NoError(t, repo.AddActivityPoint(ctx, &repository.ActivityPoint{
			ID: testutil.NewUserID(), CourseID: course.ID, StudentID: student, Tanggal: tgl, Points: pts,
		}))
	}
	// Ana dinilai 3x (8 + 10 hari-1, 5 hari-2 = total 23), Budi 1x (7 hari-1).
	add(ana, d1, 8)
	add(ana, d1, 10)
	add(ana, d2, 5)
	add(budi, d1, 7)

	// Total leaderboard (tanggal ""): Ana 23 (3x) di atas Budi 7 (1x).
	total, err := repo.Leaderboard(ctx, course.ID, "")
	require.NoError(t, err)
	require.Len(t, total, 2) // kedua siswa terdaftar muncul
	assert.Equal(t, ana, total[0].StudentID)
	assert.Equal(t, 23, total[0].Points)
	assert.Equal(t, 3, total[0].EntryCount)
	assert.Equal(t, budi, total[1].StudentID)
	assert.Equal(t, 7, total[1].Points)

	// Per hari-1: Ana 18, Budi 7.
	day1, err := repo.Leaderboard(ctx, course.ID, d1)
	require.NoError(t, err)
	require.Len(t, day1, 2)
	assert.Equal(t, ana, day1[0].StudentID)
	assert.Equal(t, 18, day1[0].Points)

	// StudentPointTotals Ana: total 23, hari-2 = 5.
	tot, day, err := repo.StudentPointTotals(ctx, course.ID, ana, d2)
	require.NoError(t, err)
	assert.Equal(t, 23, tot)
	assert.Equal(t, 5, day)
}
