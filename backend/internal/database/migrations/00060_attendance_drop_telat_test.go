package migrations_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

// Legacy 'telat' attendance records must be converted to 'hadir' by migration
// 00060, while valid statuses are left untouched — so old data neither errors
// nor shows an orphan status in recaps.
func TestDropTelatMigration(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	// A student + a session are needed to satisfy the record's foreign keys.
	userRepo := repository.NewUserRepository(db)
	stu := &repository.User{ID: testutil.NewUserID(), Username: "tl_stu", Email: "tl@x.com", PasswordHash: "x",
		Role: "student", FullName: "Telat Student", IsActive: true, Kelas: "TL-1", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, stu))
	teacher := &repository.User{ID: testutil.NewUserID(), Username: "tl_gru", Email: "tlg@x.com", PasswordHash: "x",
		Role: "teacher", FullName: "Telat Guru", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))

	sessID := testutil.NewUserID()
	_, err := db.ExecContext(ctx, `INSERT INTO attendance_sessions(id, created_by, kelas, tanggal, start_time, end_time)
		VALUES(?, ?, 'TL-1', '2026-01-01', '07:00', '08:00')`, sessID, teacher.ID)
	require.NoError(t, err)

	// Seed a legacy 'telat' record and an 'izin' record (raw INSERT bypasses the
	// service-layer status validation, mimicking rows written before the change).
	// Distinct students so both records coexist under UNIQUE(session_id, student_id).
	stu2 := &repository.User{ID: testutil.NewUserID(), Username: "tl_stu2", Email: "tl2@x.com", PasswordHash: "x",
		Role: "student", FullName: "Izin Student", IsActive: true, Kelas: "TL-1", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, stu2))
	mkRec := func(studentID, status string) string {
		id := testutil.NewUserID()
		_, err := db.ExecContext(ctx, `INSERT INTO attendance_records(id, session_id, student_id, status) VALUES(?, ?, ?, ?)`,
			id, sessID, studentID, status)
		require.NoError(t, err)
		return id
	}
	telatID := mkRec(stu.ID, "telat")
	izinID := mkRec(stu2.ID, "izin")

	// Apply the migration's conversion (identical to 00060_attendance_drop_telat.sql).
	_, err = db.ExecContext(ctx, `UPDATE attendance_records SET status = 'hadir' WHERE status = 'telat'`)
	require.NoError(t, err)

	var got string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT status FROM attendance_records WHERE id = ?`, telatID).Scan(&got))
	assert.Equal(t, "hadir", got, "legacy telat converted to hadir")
	require.NoError(t, db.QueryRowContext(ctx, `SELECT status FROM attendance_records WHERE id = ?`, izinID).Scan(&got))
	assert.Equal(t, "izin", got, "valid statuses left untouched")

	// No 'telat' rows remain anywhere.
	var n int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT COUNT(*) FROM attendance_records WHERE status = 'telat'`).Scan(&n))
	assert.Equal(t, 0, n)
}
