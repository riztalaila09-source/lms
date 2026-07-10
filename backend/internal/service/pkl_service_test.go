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

func pklSetup(t *testing.T) (context.Context, *service.PklService, *repository.User, *repository.User, *repository.User) {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	svc := service.NewPklService(repository.NewPklRepository(db))
	now := time.Now().UTC().Truncate(time.Second)
	mk := func(name, role, kelas string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "p_" + name, Email: name + "@p.com", PasswordHash: "x",
			Role: role, FullName: name, IsActive: true, Kelas: kelas, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	return ctx, svc, mk("Guru", "teacher", ""), mk("Alice", "student", "X-TKJ-1"), mk("Bob", "student", "X-TKJ-1")
}

func mkPartner(t *testing.T, ctx context.Context, svc *service.PklService, teacherID string, kuota int) *repository.PklPartner {
	t.Helper()
	p, err := svc.CreatePartner(ctx, teacherID, "teacher", service.PklPartnerInput{Name: "PT Maju", Kuota: kuota, KontakWA: "628"})
	require.NoError(t, err)
	return p
}

func TestPklService_ApplyFlow(t *testing.T) {
	ctx, svc, teacher, alice, bob := pklSetup(t)
	p := mkPartner(t, ctx, svc, teacher.ID, 1)

	// Alice applies → fills the single slot.
	require.NoError(t, svc.Apply(ctx, alice.ID, "student", p.ID))

	// List reflects terisi + applied_by_me (for Alice).
	list, err := svc.ListPartners(ctx, alice.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, 1, list[0].Terisi)
	assert.True(t, list[0].AppliedByMe)

	// Bob can't apply — full.
	err = svc.Apply(ctx, bob.ID, "student", p.ID)
	assert.ErrorIs(t, err, service.ErrPklFull)

	// Alice can't apply again anywhere (one per student).
	p2 := mkPartner(t, ctx, svc, teacher.ID, 5)
	err = svc.Apply(ctx, alice.ID, "student", p2.ID)
	assert.ErrorIs(t, err, service.ErrAlreadyApplied)

	// Cancel frees the slot; Alice moves to p2.
	require.NoError(t, svc.CancelApply(ctx, alice.ID, "student"))
	require.NoError(t, svc.Apply(ctx, alice.ID, "student", p2.ID))
	mine, err := svc.MyApplication(ctx, alice.ID, "student")
	require.NoError(t, err)
	require.NotNil(t, mine)
	assert.Equal(t, p2.ID, mine.ID)

	// Now Bob can take p1.
	require.NoError(t, svc.Apply(ctx, bob.ID, "student", p.ID))
}

func TestPklService_Applicants(t *testing.T) {
	ctx, svc, teacher, alice, _ := pklSetup(t)
	p := mkPartner(t, ctx, svc, teacher.ID, 3)
	require.NoError(t, svc.Apply(ctx, alice.ID, "student", p.ID))

	apps, err := svc.GetApplicants(ctx, "teacher", p.ID)
	require.NoError(t, err)
	require.Len(t, apps, 1)
	assert.Equal(t, "Alice", apps[0].Name)
	assert.Equal(t, "X-TKJ-1", apps[0].Kelas)
}

func TestPklService_Permissions(t *testing.T) {
	ctx, svc, teacher, alice, _ := pklSetup(t)
	p := mkPartner(t, ctx, svc, teacher.ID, 1)

	// Students can't create partners.
	_, err := svc.CreatePartner(ctx, alice.ID, "student", service.PklPartnerInput{Name: "X"})
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Teachers can't apply.
	err = svc.Apply(ctx, teacher.ID, "teacher", p.ID)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Students can't view applicants.
	_, err = svc.GetApplicants(ctx, "student", p.ID)
	assert.ErrorIs(t, err, service.ErrPermissionDenied)
}
