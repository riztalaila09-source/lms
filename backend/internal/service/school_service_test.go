package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

func sp(v string) *string { return &v }

func TestSchoolService_UpdateMerge(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// Non-manager is denied.
	_, err := svc.UpdateSchool(ctx, "student", service.UpdateSchoolInput{Name: sp("X")})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Full write.
	_, err = svc.UpdateSchool(ctx, "admin", service.UpdateSchoolInput{
		Name: sp("SMK A"), AppName: sp("e-SMK"), Visi: sp("Visi lama"), Logo: sp("data:img,AAA"),
	})
	require.NoError(t, err)

	// Partial update (only Visi) must NOT wipe the other fields.
	s, err := svc.UpdateSchool(ctx, "admin", service.UpdateSchoolInput{Visi: sp("Visi baru")})
	require.NoError(t, err)
	assert.Equal(t, "Visi baru", s.Visi)
	assert.Equal(t, "SMK A", s.Name, "name preserved by merge")
	assert.Equal(t, "e-SMK", s.AppName, "app name preserved")
	assert.Equal(t, "data:img,AAA", s.Logo, "logo preserved")
}

func TestSchoolService_Staff(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// Non-manager can't set staff.
	_, err := svc.SetStaff(ctx, "student", []*repository.Staff{{Nama: "A"}})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Set replaces the whole list, keeps order, drops empty rows.
	out, err := svc.SetStaff(ctx, "admin", []*repository.Staff{
		{Nama: "Budi", Jabatan: "Guru Matematika", Foto: "data:img,B"},
		{Nama: "", Jabatan: "kosong"},
		{Nama: "Sri", Jabatan: "Kepala TU"},
	})
	require.NoError(t, err)
	require.Len(t, out, 2)
	assert.Equal(t, "Budi", out[0].Nama)
	assert.Equal(t, "Guru Matematika", out[0].Jabatan)
	assert.Equal(t, "Sri", out[1].Nama)

	// ListStaff (public) returns them.
	list, err := svc.ListStaff(ctx)
	require.NoError(t, err)
	assert.Len(t, list, 2)

	// Replace-all: setting a shorter list drops the rest.
	out, err = svc.SetStaff(ctx, "admin", []*repository.Staff{{Nama: "Only"}})
	require.NoError(t, err)
	assert.Len(t, out, 1)
	assert.Equal(t, "Only", out[0].Nama)
}

func TestSchoolService_AccessPolicy(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// Default: nothing denied, cache empty.
	require.NoError(t, svc.LoadAccessPolicy(ctx))
	assert.False(t, svc.IsCapabilityDenied("materi.delete"))

	// Non-admin cannot read or write the policy.
	_, err := svc.GetAccessPolicy(ctx, "teacher")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
	_, err = svc.SetAccessPolicy(ctx, "teacher", []string{"materi.delete"})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Admin sets a denied set; it persists and the cache refreshes immediately.
	saved, err := svc.SetAccessPolicy(ctx, "admin", []string{"materi.delete", "tugas.delete", "materi.delete"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"materi.delete", "tugas.delete"}, saved, "deduped")
	assert.True(t, svc.IsCapabilityDenied("materi.delete"))
	assert.True(t, svc.IsCapabilityDenied("tugas.delete"))
	assert.False(t, svc.IsCapabilityDenied("materi.edit"))

	// Read back via admin.
	got, err := svc.GetAccessPolicy(ctx, "admin")
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"materi.delete", "tugas.delete"}, got)

	// Replace-all: clearing the set re-allows everything.
	_, err = svc.SetAccessPolicy(ctx, "admin", nil)
	require.NoError(t, err)
	assert.False(t, svc.IsCapabilityDenied("materi.delete"))

	// A fresh service loading from the same DB sees the (now empty) policy.
	svc2 := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))
	require.NoError(t, svc2.LoadAccessPolicy(ctx))
	assert.False(t, svc2.IsCapabilityDenied("materi.delete"))
}

func TestSchoolService_ExportBackup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// Non-admin denied.
	_, _, err := svc.ExportBackup(ctx, "teacher")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Admin gets a non-empty SQLite snapshot with a .db filename.
	data, filename, err := svc.ExportBackup(ctx, "admin")
	require.NoError(t, err)
	assert.NotEmpty(t, data)
	assert.Contains(t, filename, ".db")
	// SQLite files begin with the "SQLite format 3\000" magic header.
	assert.Equal(t, "SQLite format 3", string(data[:15]))
}

func TestSchoolService_Content(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// Non-manager denied; empty type rejected.
	_, err := svc.SetContent(ctx, "student", "berita", []*repository.ContentItem{{Title: "X"}})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
	_, err = svc.SetContent(ctx, "admin", "", []*repository.ContentItem{{Title: "X"}})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// Type-scoped replace-all: berita and galeri_foto are independent.
	_, err = svc.SetContent(ctx, "admin", "berita", []*repository.ContentItem{{Title: "Berita 1", Body: "isi"}})
	require.NoError(t, err)
	_, err = svc.SetContent(ctx, "admin", "galeri_foto", []*repository.ContentItem{
		{Image: "https://x/1.jpg", Title: "Foto 1"}, {Image: "https://x/2.jpg"},
	})
	require.NoError(t, err)

	b, _ := svc.ListContent(ctx, "berita")
	assert.Len(t, b, 1)
	g, _ := svc.ListContent(ctx, "galeri_foto")
	assert.Len(t, g, 2)

	// Replacing berita doesn't touch galeri.
	_, err = svc.SetContent(ctx, "admin", "berita", nil)
	require.NoError(t, err)
	b, _ = svc.ListContent(ctx, "berita")
	assert.Len(t, b, 0)
	g, _ = svc.ListContent(ctx, "galeri_foto")
	assert.Len(t, g, 2, "other type untouched")
}

// Game soundtrack is stored/cleared independently and never wipes other fields.
func TestSchoolService_GameMusic(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// Set some regular fields first.
	_, err := svc.UpdateSchool(ctx, "admin", service.UpdateSchoolInput{Name: sp("SMK Musik"), Visi: sp("Visi")})
	require.NoError(t, err)

	// No music yet.
	s, err := svc.GetSchool(ctx)
	require.NoError(t, err)
	assert.False(t, s.HasGameMusic)

	// Upload music (data URL) — an unrelated field edit must not clear it.
	_, err = svc.UpdateSchool(ctx, "admin", service.UpdateSchoolInput{
		GameMusicData: sp("data:audio/mpeg;base64,QUJD"), GameMusicName: sp("lagu.mp3"),
	})
	require.NoError(t, err)
	_, err = svc.UpdateSchool(ctx, "admin", service.UpdateSchoolInput{Visi: sp("Visi baru")})
	require.NoError(t, err)

	s, err = svc.GetSchool(ctx)
	require.NoError(t, err)
	assert.True(t, s.HasGameMusic, "music survives unrelated edits")
	assert.Equal(t, "lagu.mp3", s.GameMusicName)
	assert.Equal(t, "Visi baru", s.Visi)
	assert.Equal(t, "SMK Musik", s.Name)

	// Clearing music with "" leaves other fields intact.
	_, err = svc.UpdateSchool(ctx, "admin", service.UpdateSchoolInput{GameMusicData: sp("")})
	require.NoError(t, err)
	s, err = svc.GetSchool(ctx)
	require.NoError(t, err)
	assert.False(t, s.HasGameMusic)
	assert.Equal(t, "", s.GameMusicName)
	assert.Equal(t, "SMK Musik", s.Name)
}

// PPDB: public submit stores the applicant (status 'baru'); admin can list,
// change status+catatan, and delete. Non-managers are denied.
func TestSchoolService_Ppdb(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	// No active batch yet → registration is refused.
	_, err := svc.SubmitPpdbRegistration(ctx, &repository.PpdbRegistration{Nama: "Budi", Jurusan: "TKJ"})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// Admin creates + activates gelombang 1 of 2026/2027.
	batch, err := svc.CreatePpdbBatch(ctx, "admin", "2026/2027", 1)
	require.NoError(t, err)
	_, err = svc.CreatePpdbBatch(ctx, "student", "2026/2027", 2) // non-manager denied
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
	_, err = svc.CreatePpdbBatch(ctx, "admin", "2026/2027", 1) // duplicate gelombang
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
	_, err = svc.SetActivePpdbBatch(ctx, "admin", batch.ID)
	require.NoError(t, err)

	// Nama wajib + jurusan must be one of TKJ/TKR/TPM/TSM.
	_, err = svc.SubmitPpdbRegistration(ctx, &repository.PpdbRegistration{Nama: "  ", Jurusan: "TKJ"})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
	_, err = svc.SubmitPpdbRegistration(ctx, &repository.PpdbRegistration{Nama: "X", Jurusan: "XXX"})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// Submit two applicants; each gets a No. Pendaftaran + password, empty phones dropped.
	reg1, err := svc.SubmitPpdbRegistration(ctx, &repository.PpdbRegistration{
		Nama: "Budi", Jurusan: "TKJ", NoKK: "123",
		Phones: []repository.PpdbPhone{{Label: "Calon Murid", Number: "0812"}, {Label: "Ortu", Number: "  "}},
	})
	require.NoError(t, err)
	assert.Equal(t, "baru", reg1.Status)
	assert.Len(t, reg1.Phones, 1, "empty phone dropped")
	assert.Equal(t, "2627-G1-0001", reg1.NoPendaftaran)
	assert.NotEmpty(t, reg1.Password)
	reg2, err := svc.SubmitPpdbRegistration(ctx, &repository.PpdbRegistration{Nama: "Ani", Jurusan: "TKR"})
	require.NoError(t, err)
	assert.Equal(t, "2627-G1-0002", reg2.NoPendaftaran)

	// Admin sets the exam question bank (2 soal) and opens the exam.
	require.NoError(t, svc.SetPpdbQuestions(ctx, "admin", batch.ID, []*repository.PpdbQuestion{
		{Question: "1+1?", Options: []string{"2", "3"}, CorrectIndex: 0},
		{Question: "Ibukota?", Options: []string{"Bandung", "Jakarta"}, CorrectIndex: 1},
	}))
	_, err = svc.UpdatePpdbBatch(ctx, "admin", service.PpdbBatchUpdate{ID: batch.ID, TestActive: ptrBool(true)})
	require.NoError(t, err)

	// Applicant login (wrong password rejected), then take the test.
	_, err = svc.PpdbLogin(ctx, reg1.NoPendaftaran, "WRONG")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
	login, err := svc.PpdbLogin(ctx, reg1.NoPendaftaran, reg1.Password)
	require.NoError(t, err)
	assert.NotEmpty(t, login.Token)

	// Questions hidden correct index is applied at handler; here score the service.
	sc, correct, total, err := svc.SubmitPpdbTest(ctx, "ppdb", reg1.ID, map[int]int{0: 0, 1: 1}) // both correct
	require.NoError(t, err)
	assert.Equal(t, 100, sc)
	assert.Equal(t, 2, correct)
	assert.Equal(t, 2, total)
	// Second submit rejected (once only).
	_, _, _, err = svc.SubmitPpdbTest(ctx, "ppdb", reg1.ID, map[int]int{0: 0, 1: 1})
	assert.ErrorIs(t, err, service.ErrInvalidArgument)
	// reg2 answers one wrong → 50.
	sc2, _, _, err := svc.SubmitPpdbTest(ctx, "ppdb", reg2.ID, map[int]int{0: 0, 1: 0})
	require.NoError(t, err)
	assert.Equal(t, 50, sc2)

	// Ranking: highest score first; filter by jurusan works.
	all, err := svc.ListPpdbRegistrations(ctx, "admin", batch.ID, "", "")
	require.NoError(t, err)
	require.Len(t, all, 2)
	assert.Equal(t, "Budi", all[0].Nama, "score 100 ranks first")
	assert.Equal(t, 100, all[0].TestScore)
	tkj, err := svc.ListPpdbRegistrations(ctx, "admin", batch.ID, "TKJ", "")
	require.NoError(t, err)
	assert.Len(t, tkj, 1)
	byName, err := svc.ListPpdbRegistrations(ctx, "admin", batch.ID, "", "ani")
	require.NoError(t, err)
	assert.Len(t, byName, 1)
	_, err = svc.ListPpdbRegistrations(ctx, "student", batch.ID, "", "")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Status update + delete still work.
	updated, err := svc.UpdatePpdbStatus(ctx, "admin", reg1.ID, "diterima", "lolos")
	require.NoError(t, err)
	assert.Equal(t, "diterima", updated.Status)
	require.NoError(t, svc.DeletePpdbRegistration(ctx, "admin", reg2.ID))
	all, _ = svc.ListPpdbRegistrations(ctx, "admin", batch.ID, "", "")
	assert.Len(t, all, 1)
}

func ptrBool(b bool) *bool { return &b }
