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

func attSetup(t *testing.T) (context.Context, *service.AttendanceService, repository.AttendanceRepository, *repository.User, *repository.User) {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	attRepo := repository.NewAttendanceRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	svc := service.NewAttendanceService(attRepo, courseRepo)
	now := time.Now().UTC().Truncate(time.Second)

	mk := func(name, role string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "at_" + name, Email: name + "@at.com",
			PasswordHash: "x", Role: role, FullName: name, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	return ctx, svc, attRepo, mk("Guru", "teacher"), mk("Siswa", "student")
}

func mkSession(t *testing.T, ctx context.Context, svc *service.AttendanceService, teacherID string) (*repository.AttendanceSession, *service.TokenInfo) {
	t.Helper()
	sess, tok, err := svc.CreateSession(ctx, teacherID, "teacher", service.CreateSessionInput{
		Mapel: "Informatika", Kelas: "Lab 1", Tanggal: "2030-07-09", JamKe: 1, StartTime: "07:00", EndTime: "09:00",
	})
	require.NoError(t, err)
	return sess, tok
}

// Re-creating a session for the same teacher/class/date/lesson-hour must REUSE
// the existing session (refreshing the token) instead of piling up duplicates.
func TestAttendanceService_CreateSessionReusesSlot(t *testing.T) {
	ctx, svc, attRepo, teacher, student := attSetup(t)
	in := service.CreateSessionInput{Mapel: "Matematika", Kelas: "X-TKJ-1", Tanggal: "2030-08-01", JamKe: 1, JamKeAkhir: 3, StartTime: "07:00", EndTime: "09:15"}

	s1, tok1, err := svc.CreateSession(ctx, teacher.ID, "teacher", in)
	require.NoError(t, err)

	// A student checks in on the first session.
	_, _, err = svc.Scan(ctx, student.ID, "student", "", tok1.Code)
	require.NoError(t, err)

	// Re-creating the same slot returns the SAME session (not a new one).
	s2, tok2, err := svc.CreateSession(ctx, teacher.ID, "teacher", in)
	require.NoError(t, err)
	assert.Equal(t, s1.ID, s2.ID, "same session reused")
	assert.Equal(t, 3, s2.JamKeAkhir, "the jam 1 s/d 3 range is preserved")
	assert.NotEqual(t, tok1.Code, tok2.Code, "token refreshed on reuse")
	assert.Equal(t, 1, s2.HadirCount, "existing check-ins are kept")

	// Only one session exists for that day.
	sessions, err := attRepo.ListSessions(ctx, teacher.ID, "2030-08-01")
	require.NoError(t, err)
	assert.Len(t, sessions, 1)

	// A different lesson-hour is a distinct session.
	in4 := in
	in4.JamKe, in4.JamKeAkhir, in4.StartTime = 4, 6, "10:00"
	s3, _, err := svc.CreateSession(ctx, teacher.ID, "teacher", in4)
	require.NoError(t, err)
	assert.NotEqual(t, s1.ID, s3.ID, "different slot -> new session")
	sessions, _ = attRepo.ListSessions(ctx, teacher.ID, "2030-08-01")
	assert.Len(t, sessions, 2)
}

func TestAttendanceService_ScanFlow(t *testing.T) {
	ctx, svc, _, teacher, student := attSetup(t)
	_, tok := mkSession(t, ctx, svc, teacher.ID)
	require.Len(t, tok.Code, 6)

	// First scan by code → hadir, not already.
	sess, already, err := svc.Scan(ctx, student.ID, "student", "", tok.Code)
	require.NoError(t, err)
	assert.False(t, already)
	assert.Equal(t, "Informatika", sess.Mapel)

	// Second scan → already recorded.
	_, already, err = svc.Scan(ctx, student.ID, "student", "", tok.Code)
	require.NoError(t, err)
	assert.True(t, already)

	// Daily summary counts the hadir.
	today, err := svc.MyToday(ctx, student.ID, "student", "2030-07-09")
	require.NoError(t, err)
	assert.Equal(t, 1, today.Hadir)
	require.Len(t, today.Entries, 1)
	assert.Equal(t, "Lab 1", today.Entries[0].Kelas)
}

func TestAttendanceService_TokenExpiredAndInvalid(t *testing.T) {
	ctx, svc, attRepo, teacher, student := attSetup(t)
	sess, _ := mkSession(t, ctx, svc, teacher.ID)

	// Force the token to be expired.
	require.NoError(t, attRepo.SetToken(ctx, sess.ID, "EXPIREDTOKEN", "EXPIRD", time.Now().Add(-time.Minute)))
	_, _, err := svc.Scan(ctx, student.ID, "student", "EXPIREDTOKEN", "")
	assert.ErrorIs(t, err, service.ErrTokenExpired)

	// Unknown token → invalid.
	_, _, err = svc.Scan(ctx, student.ID, "student", "does-not-exist", "")
	assert.ErrorIs(t, err, service.ErrTokenInvalid)
}

func TestAttendanceService_Permissions(t *testing.T) {
	ctx, svc, _, teacher, student := attSetup(t)
	sess, tok := mkSession(t, ctx, svc, teacher.ID)

	// Students can't create sessions.
	_, _, err := svc.CreateSession(ctx, student.ID, "student", service.CreateSessionInput{
		Kelas: "X", Tanggal: "2030-07-09", StartTime: "07:00", EndTime: "08:00",
	})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Teachers can't scan (student-only).
	_, _, err = svc.Scan(ctx, teacher.ID, "teacher", "", tok.Code)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Another teacher can't read someone else's session records.
	_, _, err = svc.GetSessionRecords(ctx, testutil.NewUserID(), "teacher", sess.ID)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
}

func TestAttendanceService_ManualStatus(t *testing.T) {
	ctx, svc, _, teacher, student := attSetup(t)
	sess, _ := mkSession(t, ctx, svc, teacher.ID)

	// Teacher marks the student Izin manually (no scan needed).
	rec, err := svc.SetRecordStatus(ctx, teacher.ID, "teacher", sess.ID, student.ID, "izin", "surat izin")
	require.NoError(t, err)
	assert.Equal(t, "izin", rec.Status)

	today, err := svc.MyToday(ctx, student.ID, "student", "2030-07-09")
	require.NoError(t, err)
	assert.Equal(t, 1, today.Izin)
	assert.Equal(t, 0, today.Hadir)

	// Invalid status rejected.
	_, err = svc.SetRecordStatus(ctx, teacher.ID, "teacher", sess.ID, student.ID, "bolos", "")
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
}

func TestAttendanceService_Export(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewAttendanceService(repository.NewAttendanceRepository(db), repository.NewCourseRepository(db))
	now := time.Now().UTC().Truncate(time.Second)
	mk := func(name, role, kelas, jur string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "ex_" + name, Email: name + "@ex.com", PasswordHash: "x",
			Role: role, FullName: name, IsActive: true, Kelas: kelas, Jurusan: jur, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher", "", "")
	alice := mk("Alice", "student", "UJI-TKJ-1", "UJITKJ")
	mk("Bob", "student", "UJI-TKJ-1", "UJITKJ") // no attendance → zeros
	mk("Eve", "student", "UJI-RPL-1", "UJIRPL")  // other class → excluded

	mkSess := func(tgl string) *repository.AttendanceSession {
		sess, _, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
			Mapel: "Informatika", Kelas: "UJI-TKJ-1", Tanggal: tgl, StartTime: "07:00", EndTime: "08:00",
		})
		require.NoError(t, err)
		return sess
	}
	// Statuses set explicitly (deterministic; independent of the clock). Explicit
	// records are counted even for sessions that have not ended yet.
	// In range (Aug): Alice hadir on the 10th, sakit on the 11th, izin on the 12th.
	set := func(sessID, status string) {
		_, err := svc.SetRecordStatus(ctx, teacher.ID, "teacher", sessID, alice.ID, status, "")
		require.NoError(t, err)
	}
	set(mkSess("2026-08-10").ID, "hadir")
	set(mkSess("2026-08-11").ID, "sakit")
	set(mkSess("2026-08-12").ID, "izin")
	// Out of range (Jan): must NOT be counted in the August export.
	set(mkSess("2026-01-05").ID, "hadir")

	rows, err := svc.ExportAttendance(ctx, "teacher", "2026-08-01", "2026-08-31", "UJI-TKJ-1", "")
	require.NoError(t, err)
	byName := map[string]*repository.AttendanceExportRow{}
	for _, r := range rows {
		byName[r.StudentName] = r
	}
	require.Contains(t, byName, "Alice")
	require.Contains(t, byName, "Bob")
	assert.NotContains(t, byName, "Eve", "other class excluded")
	assert.Equal(t, 1, byName["Alice"].Hadir)
	assert.Equal(t, 1, byName["Alice"].Sakit)
	assert.Equal(t, 1, byName["Alice"].Izin)
	assert.Equal(t, 3, byName["Alice"].Total, "Jan session excluded")
	assert.Equal(t, 0, byName["Bob"].Total)

	// Scope by jurusan works too.
	jrows, err := svc.ExportAttendance(ctx, "teacher", "2026-08-01", "2026-08-31", "", "UJITKJ")
	require.NoError(t, err)
	assert.Len(t, jrows, 2)

	// Student may not export; both/none scope invalid.
	_, err = svc.ExportAttendance(ctx, "student", "2026-08-01", "2026-08-31", "UJI-TKJ-1", "")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
	_, err = svc.ExportAttendance(ctx, "teacher", "2026-08-01", "2026-08-31", "", "")
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
}

func TestAttendanceService_DeleteSession(t *testing.T) {
	ctx, svc, _, teacher, student := attSetup(t)
	sess, tok := mkSession(t, ctx, svc, teacher.ID)
	_, _, err := svc.Scan(ctx, student.ID, "student", "", tok.Code)
	require.NoError(t, err)

	// A different teacher can't delete it.
	err = svc.DeleteSession(ctx, testutil.NewUserID(), "teacher", sess.ID)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Owner deletes it (records cascade).
	require.NoError(t, svc.DeleteSession(ctx, teacher.ID, "teacher", sess.ID))
	_, _, err = svc.GetSessionRecords(ctx, teacher.ID, "teacher", sess.ID)
	assert.ErrorIs(t, err, service.ErrNotFound)

	// The student's day no longer includes it.
	today, err := svc.MyToday(ctx, student.ID, "student", "2030-07-09")
	require.NoError(t, err)
	assert.Equal(t, 0, today.Hadir)
}

func TestAttendanceService_ScanLateIsStillHadir(t *testing.T) {
	ctx, svc, _, teacher, student := attSetup(t)
	// Session dated far in the past → scanning now is well past start time. There is
	// no "telat" status anymore: any valid scan within the window counts as hadir.
	_, tok, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
		Mapel: "X", Kelas: "Lab", Tanggal: "2020-01-01", StartTime: "07:00", EndTime: "08:00",
	})
	require.NoError(t, err)
	_, _, err = svc.Scan(ctx, student.ID, "student", "", tok.Code)
	require.NoError(t, err)

	today, err := svc.MyToday(ctx, student.ID, "student", "2020-01-01")
	require.NoError(t, err)
	assert.Equal(t, 1, today.Hadir)
	assert.Equal(t, 0, today.Alpa)
}

// A student who is never marked is auto-alpa in the recap ONLY after the session
// ends; an ongoing session with no record is not counted yet.
func TestAttendanceService_ExportAutoAlpa(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewAttendanceService(repository.NewAttendanceRepository(db), repository.NewCourseRepository(db))
	now := time.Now().UTC().Truncate(time.Second)
	mk := func(name, role, kelas string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "aa_" + name, Email: name + "@aa.com", PasswordHash: "x",
			Role: role, FullName: name, IsActive: true, Kelas: kelas, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher", "")
	mk("Zoe", "student", "AUTO-1") // never marked

	// An ENDED session (yesterday) with no record → Zoe is auto-alpa.
	yesterday := time.Now().In(time.FixedZone("WIB", 7*3600)).AddDate(0, 0, -1).Format("2006-01-02")
	_, _, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
		Mapel: "X", Kelas: "AUTO-1", Tanggal: yesterday, StartTime: "07:00", EndTime: "08:00",
	})
	require.NoError(t, err)

	// A FUTURE session (not ended) with no record → not counted yet.
	tomorrow := time.Now().In(time.FixedZone("WIB", 7*3600)).AddDate(0, 0, 1).Format("2006-01-02")
	_, _, err = svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
		Mapel: "X", Kelas: "AUTO-1", Tanggal: tomorrow, StartTime: "07:00", EndTime: "08:00",
	})
	require.NoError(t, err)

	rows, err := svc.ExportAttendance(ctx, "teacher", yesterday, tomorrow, "AUTO-1", "")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	zoe := rows[0]
	assert.Equal(t, "Zoe", zoe.StudentName)
	assert.Equal(t, 1, zoe.Alpa, "ended session with no record is auto-alpa")
	assert.Equal(t, 1, zoe.Total, "future session not counted yet")
	assert.Equal(t, 0, zoe.Hadir)
}

func TestAttendanceService_DayGrid(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewAttendanceService(repository.NewAttendanceRepository(db), repository.NewCourseRepository(db))
	now := time.Now().UTC().Truncate(time.Second)
	mk := func(name, role, kelas string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "dg_" + name, Email: name + "@dg.com", PasswordHash: "x",
			Role: role, FullName: name, IsActive: true, Kelas: kelas, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("Guru", "teacher", "")
	alice := mk("Alice", "student", "UJI-DAY")
	mk("Bob", "student", "UJI-DAY")
	mk("Eve", "student", "UJI-OTHER") // other class, no record → excluded

	const D = "2030-03-03"
	s1, _, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{Kelas: "UJI-DAY", Tanggal: D, JamKe: 1, StartTime: "07:00", EndTime: "08:00"})
	require.NoError(t, err)
	_, _, err = svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{Kelas: "UJI-DAY", Tanggal: D, JamKe: 2, StartTime: "08:00", EndTime: "09:00"})
	require.NoError(t, err)
	_, err = svc.SetRecordStatus(ctx, teacher.ID, "teacher", s1.ID, alice.ID, "hadir", "")
	require.NoError(t, err)

	res, err := svc.DayGrid(ctx, "teacher", D, "UJI-DAY")
	require.NoError(t, err)
	assert.Len(t, res.Sessions, 2)
	names := map[string]bool{}
	for _, st := range res.Students {
		names[st.Name] = true
	}
	assert.True(t, names["Alice"] && names["Bob"], "roster of the class")
	assert.False(t, names["Eve"], "other class excluded")
	require.Len(t, res.Cells, 1)
	assert.Equal(t, "hadir", res.Cells[0].Status)

	// Students may not view the grid.
	_, err = svc.DayGrid(ctx, "student", D, "UJI-DAY")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
}
