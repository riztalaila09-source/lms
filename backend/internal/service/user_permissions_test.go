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

func TestHasPermission(t *testing.T) {
	assert.True(t, service.HasPermission("admin", nil, service.PermKelolaSiswa), "admin is a super-user")
	assert.False(t, service.HasPermission("teacher", nil, service.PermKelolaSiswa))
	assert.True(t, service.HasPermission("teacher", []string{service.PermKelolaSiswa}, service.PermKelolaSiswa))
	assert.False(t, service.HasPermission("teacher", []string{service.PermKelolaNilai}, service.PermKelolaSiswa))
	assert.False(t, service.HasPermission("student", []string{service.PermKelolaSiswa}, service.PermKelolaSiswa))
}

func newPermSvc(t *testing.T) (*service.UserService, context.Context, repository.UserRepository) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	return service.NewUserService(repo, newTestJWTService(), nil), context.Background(), repo
}

func TestCreateUser_PermissionGating(t *testing.T) {
	svc, ctx, _ := newPermSvc(t)

	// Teacher without kelola_siswa cannot add a student.
	_, err := svc.CreateUser(ctx, "teacher", nil, "ps1", "ps1@t.com", "password123", "S1", "student", "X-TKJ-1", "", "", "", "", nil)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// With kelola_siswa, they can.
	u, err := svc.CreateUser(ctx, "teacher", []string{service.PermKelolaSiswa}, "ps2", "ps2@t.com", "password123", "S2", "student", "X-TKJ-1", "", "", "", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "student", u.Role)

	// No teacher may create an admin (even with every teaching permission).
	_, err = svc.CreateUser(ctx, "teacher", service.AllPermissions, "pa1", "pa1@t.com", "password123", "A1", "admin", "", "", "", "", "", nil)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Admin creates a teacher with hand-picked access rights.
	g, err := svc.CreateUser(ctx, "admin", nil, "pg1", "pg1@t.com", "password123", "G1", "teacher", "", "", "MTK", "", "", []string{service.PermKelolaNilai})
	require.NoError(t, err)
	assert.Equal(t, []string{service.PermKelolaNilai}, g.Permissions)

	// Admin omitting permissions → new teacher gets the default teaching set.
	gd, err := svc.CreateUser(ctx, "admin", nil, "pg2", "pg2@t.com", "password123", "G2", "teacher", "", "", "MTK", "", "", nil)
	require.NoError(t, err)
	assert.Equal(t, service.DefaultTeacherPermissions, gd.Permissions)
}

func TestUpdateUser_SetPermissionsAdminOnly(t *testing.T) {
	svc, ctx, _ := newPermSvc(t)

	g, err := svc.CreateUser(ctx, "admin", nil, "up1", "up1@t.com", "password123", "G", "teacher", "", "", "MTK", "", "", nil)
	require.NoError(t, err)

	perms := []string{service.PermKelolaNilai, service.PermKelolaAbsensi}

	// A teacher (even one who may manage teachers) cannot assign access rights.
	_, err = svc.UpdateUser(ctx, "teacher", []string{service.PermKelolaGuru}, g.ID, service.UpdateUserInput{Permissions: &perms})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Admin can.
	updated, err := svc.UpdateUser(ctx, "admin", nil, g.ID, service.UpdateUserInput{Permissions: &perms})
	require.NoError(t, err)
	assert.ElementsMatch(t, perms, updated.Permissions)

	// Invalid keys are dropped.
	bad := []string{"kelola_nilai", "bogus"}
	updated, err = svc.UpdateUser(ctx, "admin", nil, g.ID, service.UpdateUserInput{Permissions: &bad})
	require.NoError(t, err)
	assert.Equal(t, []string{service.PermKelolaNilai}, updated.Permissions)
}
