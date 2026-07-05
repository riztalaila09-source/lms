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

func TestJurusanFromKelas(t *testing.T) {
	cases := map[string]string{
		"X-TKJ-1":   "TKJ",
		"XI-TKR-2":  "TKR",
		"XII-RPL-3": "RPL",
		"X-1":       "", // legacy, no major segment
		"X TKJ 1":   "", // spaces, not the dash format
		"":          "",
	}
	for in, want := range cases {
		assert.Equal(t, want, repository.JurusanFromKelas(in), "kelas=%q", in)
	}
}

// Moving/renaming a student into an "X-JUR-N" class derives their jurusan so the
// "Siswa per Jurusan" dashboard stays in sync.
func TestMoveAndRename_DerivesJurusan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	classRepo := repository.NewClassRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	s := &repository.User{ID: testutil.NewUserID(), Username: "dj", Email: "dj@t.com", PasswordHash: "x", Role: "student", FullName: "D", IsActive: true, Kelas: "OLD", Jurusan: "TKJ", CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, s))

	// Bulk move into Z-RPL-9 (unique) → jurusan becomes RPL.
	_, err := userRepo.MoveStudentsByClass(ctx, "OLD", "Z-RPL-9")
	require.NoError(t, err)
	g, _ := userRepo.GetByID(ctx, s.ID)
	assert.Equal(t, "Z-RPL-9", g.Kelas)
	assert.Equal(t, "RPL", g.Jurusan)

	// Rename the class to Z-TKR-8 → cascades kelas + jurusan.
	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "Z-RPL-9", CreatedAt: now}))
	var clsID string
	list, _ := classRepo.List(ctx)
	for _, c := range list {
		if c.Name == "Z-RPL-9" {
			clsID = c.ID
		}
	}
	_, err = classRepo.Rename(ctx, clsID, "Z-TKR-8")
	require.NoError(t, err)
	g, _ = userRepo.GetByID(ctx, s.ID)
	assert.Equal(t, "Z-TKR-8", g.Kelas)
	assert.Equal(t, "TKR", g.Jurusan)
}
