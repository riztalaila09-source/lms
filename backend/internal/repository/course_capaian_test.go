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

// Capaian & Tujuan Pembelajaran round-trip through Create/Update → GetByID, and
// are included in List results.
func TestCourseRepository_CapaianTujuan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	teacher := &repository.User{ID: testutil.NewUserID(), Username: "cap_t", Email: "cap@t.com", PasswordHash: "x",
		Role: "teacher", FullName: "T", IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, teacher))

	c := &repository.Course{ID: testutil.NewUserID(), Code: "CAP-MTK", Name: "Matematika",
		TeacherID: teacher.ID, IsActive: true, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, courseRepo.Create(ctx, c))

	const capaian = "Memahami aljabar dasar\nMenyelesaikan persamaan linear"
	const tujuan = "Menguasai konsep dasar\nSiap mengikuti ujian"
	c.CapaianPembelajaran = capaian
	c.TujuanPembelajaran = tujuan
	require.NoError(t, courseRepo.Update(ctx, c))

	got, err := courseRepo.GetByID(ctx, c.ID)
	require.NoError(t, err)
	assert.Equal(t, capaian, got.CapaianPembelajaran)
	assert.Equal(t, tujuan, got.TujuanPembelajaran)

	list, _, err := courseRepo.List(ctx, repository.CourseListFilter{Page: 1, PageSize: 100})
	require.NoError(t, err)
	var found *repository.Course
	for _, cc := range list {
		if cc.ID == c.ID {
			found = cc
		}
	}
	require.NotNil(t, found, "course present in list")
	assert.Equal(t, capaian, found.CapaianPembelajaran)
	assert.Equal(t, tujuan, found.TujuanPembelajaran)
}
