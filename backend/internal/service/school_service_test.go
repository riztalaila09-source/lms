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
	svc := service.NewSchoolService(repository.NewSchoolRepository(db))

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
	svc := service.NewSchoolService(repository.NewSchoolRepository(db))

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
	svc := service.NewSchoolService(repository.NewSchoolRepository(db))

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
	svc2 := service.NewSchoolService(repository.NewSchoolRepository(db))
	require.NoError(t, svc2.LoadAccessPolicy(ctx))
	assert.False(t, svc2.IsCapabilityDenied("materi.delete"))
}

func TestSchoolService_ExportBackup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db))

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
	svc := service.NewSchoolService(repository.NewSchoolRepository(db))

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
