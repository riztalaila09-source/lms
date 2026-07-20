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

func TestSchoolRepository_SchoolAndSemesters(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	repo := repository.NewSchoolRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	// School round-trips all fields.
	_, err := repo.UpdateSchool(ctx, &repository.School{
		Name: "SMK ISLAM 2 WLINGI", Address: "Jl. Contoh No. 1", AppName: "e-SMK", Logo: "data:image/png;base64,AAAA",
		Profil: "Profil sekolah", Visi: "Visi hebat", Misi: "Misi 1\nMisi 2", KepalaSekolah: "Pak Kepala",
		TahunBerdiri: "1998", Email: "info@smk.sch.id", Whatsapp: "0812", Npsn: "12345678", Status: "Swasta",
		Akreditasi: "A", Jenjang: "SMK",
	})
	require.NoError(t, err)
	s, err := repo.GetSchool(ctx)
	require.NoError(t, err)
	assert.Equal(t, "SMK ISLAM 2 WLINGI", s.Name)
	assert.Equal(t, "Jl. Contoh No. 1", s.Address)
	assert.Equal(t, "e-SMK", s.AppName)
	assert.Equal(t, "Visi hebat", s.Visi)
	assert.Equal(t, "A", s.Akreditasi)
	assert.Equal(t, "data:image/png;base64,AAAA", s.Logo)

	// Create two semesters.
	a := &repository.Semester{ID: testutil.NewUserID(), Semester: "ganjil", TahunAjaran: "2026/2027", IsActive: true, CreatedAt: now}
	b := &repository.Semester{ID: testutil.NewUserID(), Semester: "genap", TahunAjaran: "2026/2027", CreatedAt: now}
	require.NoError(t, repo.CreateSemester(ctx, a))
	require.NoError(t, repo.CreateSemester(ctx, b))
	// Duplicate (same semester+tahun) rejected.
	assert.ErrorIs(t, repo.CreateSemester(ctx, &repository.Semester{ID: testutil.NewUserID(), Semester: "ganjil", TahunAjaran: "2026/2027", CreatedAt: now}), repository.ErrSemesterDuplicate)

	// Activating b deactivates a (exactly one active).
	_, err = repo.SetActiveSemester(ctx, b.ID)
	require.NoError(t, err)
	list, err := repo.ListSemesters(ctx)
	require.NoError(t, err)
	activeCount := 0
	for _, sem := range list {
		if sem.IsActive {
			activeCount++
			assert.Equal(t, b.ID, sem.ID)
		}
	}
	assert.Equal(t, 1, activeCount)

	// Delete.
	require.NoError(t, repo.DeleteSemester(ctx, a.ID))
	assert.ErrorIs(t, repo.DeleteSemester(ctx, a.ID), repository.ErrSemesterNotFound)
}
