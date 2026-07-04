package migrations

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

// Fixed IDs so the demo data is deterministic and idempotent.
const (
	demoTeacherID  = "11111111-1111-1111-1111-111111111111"
	demoStudent1ID = "22222222-2222-2222-2222-222222222222"
	demoStudent2ID = "33333333-3333-3333-3333-333333333333"
	demoCourseID   = "44444444-4444-4444-4444-444444444444"
	demoEnroll1ID  = "55555555-5555-5555-5555-555555555551"
	demoEnroll2ID  = "55555555-5555-5555-5555-555555555552"
	demoMaterial1  = "66666666-6666-6666-6666-666666666661"
	demoMaterial2  = "66666666-6666-6666-6666-666666666662"
)

func init() {
	goose.AddMigrationContext(upSeedDemo, downSeedDemo)
}

func upSeedDemo(ctx context.Context, tx *sql.Tx) error {
	// One bcrypt hash reused for all demo accounts (password: "password123").
	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash demo password: %w", err)
	}
	h := string(hash)

	users := []struct {
		id, username, email, role, fullName string
	}{
		{demoTeacherID, "guru", "guru@lms.local", "teacher", "Budi Santoso, S.Pd"},
		{demoStudent1ID, "siswa", "siswa@lms.local", "student", "Siti Nurhaliza"},
		{demoStudent2ID, "siswa2", "siswa2@lms.local", "student", "Andi Pratama"},
	}
	for _, u := range users {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO users (id, username, email, password_hash, role, full_name, is_active)
			VALUES (?, ?, ?, ?, ?, ?, 1)
			ON CONFLICT(email) DO NOTHING
		`, u.id, u.username, u.email, h, u.role, u.fullName)
		if err != nil {
			return fmt.Errorf("seed user %s: %w", u.username, err)
		}
	}

	// Sample course taught by the demo teacher.
	_, err = tx.ExecContext(ctx, `
		INSERT INTO courses (id, code, name, description, teacher_id, is_active)
		VALUES (?, ?, ?, ?, ?, 1)
		ON CONFLICT(code) DO NOTHING
	`, demoCourseID, "MTK-10", "Matematika Kelas 10",
		"Pengantar aljabar, fungsi, dan trigonometri untuk kelas 10.", demoTeacherID)
	if err != nil {
		return fmt.Errorf("seed course: %w", err)
	}

	// Enroll both students.
	enrolls := []struct{ id, student string }{
		{demoEnroll1ID, demoStudent1ID},
		{demoEnroll2ID, demoStudent2ID},
	}
	for _, e := range enrolls {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO course_enrollments (id, course_id, student_id)
			VALUES (?, ?, ?)
			ON CONFLICT(course_id, student_id) DO NOTHING
		`, e.id, demoCourseID, e.student)
		if err != nil {
			return fmt.Errorf("seed enrollment: %w", err)
		}
	}

	// Two materials: one published (visible to students), one draft.
	materials := []struct {
		id, title, desc, ctype, url, text string
		order, published                  int
	}{
		{
			demoMaterial1, "Pengenalan Aljabar",
			"Konsep dasar variabel dan persamaan linear.",
			"text", "",
			"Aljabar adalah cabang matematika yang menggunakan simbol untuk mewakili bilangan. " +
				"Pada materi ini kita akan mempelajari variabel, koefisien, dan cara menyelesaikan persamaan linear sederhana.",
			0, 1,
		},
		{
			demoMaterial2, "Video: Fungsi Kuadrat",
			"Tonton video penjelasan fungsi kuadrat (masih draft).",
			"video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "",
			1, 0,
		},
	}
	for _, m := range materials {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO course_materials
				(id, course_id, title, description, content_type, content_url, content_text, order_index, is_published, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO NOTHING
		`, m.id, demoCourseID, m.title, m.desc, m.ctype, m.url, m.text, m.order, m.published, demoTeacherID)
		if err != nil {
			return fmt.Errorf("seed material: %w", err)
		}
	}

	return nil
}

func downSeedDemo(ctx context.Context, tx *sql.Tx) error {
	// Cascades remove enrollments + materials when the course is deleted.
	if _, err := tx.ExecContext(ctx, `DELETE FROM courses WHERE id = ?`, demoCourseID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id IN (?, ?, ?)`,
		demoTeacherID, demoStudent1ID, demoStudent2ID)
	return err
}
