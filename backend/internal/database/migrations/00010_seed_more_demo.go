package migrations

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

const (
	demoTeacher2ID = "11111111-1111-1111-1111-111111111112"
	demoStudent3ID = "33333333-3333-3333-3333-333333333334"
	demoStudent4ID = "33333333-3333-3333-3333-333333333335"
	demoStudent5ID = "33333333-3333-3333-3333-333333333336"
	demoStudent6ID = "33333333-3333-3333-3333-333333333337"
)

func init() {
	goose.AddMigrationContext(upSeedMoreDemo, downSeedMoreDemo)
}

func upSeedMoreDemo(ctx context.Context, tx *sql.Tx) error {
	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash demo password: %w", err)
	}
	h := string(hash)

	// Second teacher — full control, like the first.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, username, email, password_hash, role, full_name, is_active)
		VALUES (?, ?, ?, ?, 'teacher', ?, 1)
		ON CONFLICT(email) DO NOTHING
	`, demoTeacher2ID, "guru2", "guru2@lms.local", h, "Dewi Lestari, S.Pd"); err != nil {
		return fmt.Errorf("seed teacher2: %w", err)
	}

	// Extra students with varied class + major for a meaningful dashboard.
	students := []struct{ id, username, email, name, kelas, jurusan string }{
		{demoStudent3ID, "siswa3", "siswa3@lms.local", "Rina Wijaya", "X-1", "TKJ"},
		{demoStudent4ID, "siswa4", "siswa4@lms.local", "Joko Susilo", "X-1", "TKJ"},
		{demoStudent5ID, "siswa5", "siswa5@lms.local", "Maya Sari", "X-2", "TKR"},
		{demoStudent6ID, "siswa6", "siswa6@lms.local", "Bayu Aji", "X-3", "RPL"},
	}
	for _, s := range students {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO users (id, username, email, password_hash, role, full_name, is_active, kelas, jurusan)
			VALUES (?, ?, ?, ?, 'student', ?, 1, ?, ?)
			ON CONFLICT(email) DO NOTHING
		`, s.id, s.username, s.email, h, s.name, s.kelas, s.jurusan); err != nil {
			return fmt.Errorf("seed student %s: %w", s.username, err)
		}
		// enroll into the demo course
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO course_enrollments (id, course_id, student_id)
			VALUES (?, ?, ?)
			ON CONFLICT(course_id, student_id) DO NOTHING
		`, "enr-"+s.id, demoCourseID, s.id); err != nil {
			return fmt.Errorf("enroll %s: %w", s.username, err)
		}
	}

	// Remove admin: the product is teacher-driven now. Disable login.
	if _, err := tx.ExecContext(ctx, `UPDATE users SET is_active = 0 WHERE role = 'admin'`); err != nil {
		return fmt.Errorf("disable admin: %w", err)
	}

	return nil
}

func downSeedMoreDemo(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `UPDATE users SET is_active = 1 WHERE role = 'admin'`); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id IN (?, ?, ?, ?, ?)`,
		demoTeacher2ID, demoStudent3ID, demoStudent4ID, demoStudent5ID, demoStudent6ID)
	return err
}
