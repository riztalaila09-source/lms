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

func TestClassService_SetWali(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	classRepo := repository.NewClassRepository(db)
	userRepo := repository.NewUserRepository(db)
	svc := service.NewClassService(classRepo, userRepo)
	now := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "ZWALI-1", CreatedAt: now}))
	var clsID string
	list, _ := classRepo.List(ctx)
	for _, c := range list {
		if c.Name == "ZWALI-1" {
			clsID = c.ID
		}
	}
	require.NotEmpty(t, clsID)

	mk := func(role, name, phone string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "zw_" + name, Email: name + "@zw.com", PasswordHash: "x",
			Role: role, FullName: name, Phone: phone, IsActive: true, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	teacher := mk("teacher", "Pak Guru", "0812")
	student := mk("student", "Siswa", "")

	// Non-manager is denied.
	_, err := svc.SetClassWali(ctx, "student", clsID, teacher.ID)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Assign the teacher → wali fields populated from the join.
	c, err := svc.SetClassWali(ctx, "admin", clsID, teacher.ID)
	require.NoError(t, err)
	assert.Equal(t, teacher.ID, c.WaliTeacherID)
	assert.Equal(t, "Pak Guru", c.WaliName)
	assert.Equal(t, "0812", c.WaliPhone)

	// A non-teacher cannot be a wali.
	_, err = svc.SetClassWali(ctx, "admin", clsID, student.ID)
	assert.ErrorIs(t, err, service.ErrInvalidArgument)

	// Clearing removes the wali.
	c, err = svc.SetClassWali(ctx, "admin", clsID, "")
	require.NoError(t, err)
	assert.Equal(t, "", c.WaliTeacherID)
	assert.Equal(t, "", c.WaliName)

	// Missing class → not found.
	_, err = svc.SetClassWali(ctx, "admin", "no-such", teacher.ID)
	assert.ErrorIs(t, err, service.ErrClassNotFound)
}
