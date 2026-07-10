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
	// Statuses set explicitly (deterministic; independent of the clock).
	// In range (Aug): Alice hadir on the 10th, telat on the 11th, izin on the 12th.
	set := func(sessID, status string) {
		_, err := svc.SetRecordStatus(ctx, teacher.ID, "teacher", sessID, alice.ID, status, "")
		require.NoError(t, err)
	}
	set(mkSess("2026-08-10").ID, "hadir")
	set(mkSess("2026-08-11").ID, "telat")
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
	assert.Equal(t, 1, byName["Alice"].Telat)
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

func TestAttendanceService_ScanTelat(t *testing.T) {
	ctx, svc, _, teacher, student := attSetup(t)
	// Session dated far in the past → scanning now is well past start → telat.
	_, tok, err := svc.CreateSession(ctx, teacher.ID, "teacher", service.CreateSessionInput{
		Mapel: "X", Kelas: "Lab", Tanggal: "2020-01-01", StartTime: "07:00", EndTime: "08:00",
	})
	require.NoError(t, err)
	_, _, err = svc.Scan(ctx, student.ID, "student", "", tok.Code)
	require.NoError(t, err)

	today, err := svc.MyToday(ctx, student.ID, "student", "2020-01-01")
	require.NoError(t, err)
	assert.Equal(t, 1, today.Telat)
	assert.Equal(t, 0, today.Hadir)
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
