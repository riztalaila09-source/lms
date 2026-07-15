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

func TestClassRepository_RenameCascades(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	classRepo := repository.NewClassRepository(db)
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "CLS-A", CreatedAt: now}))
	var clsID string
	list, _ := classRepo.List(ctx)
	for _, c := range list {
		if c.Name == "CLS-A" {
			clsID = c.ID
		}
	}
	require.NotEmpty(t, clsID)

	mkStudent := func(s, kelas string) *repository.User {
		u := &repository.User{ID: testutil.NewUserID(), Username: "cr_" + s, Email: s + "@cr.com", PasswordHash: "x", Role: "student", FullName: "S " + s, IsActive: true, Kelas: kelas, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, userRepo.Create(ctx, u))
		return u
	}
	in1 := mkStudent("in1", "CLS-A")
	in2 := mkStudent("in2", "CLS-A")
	other := mkStudent("other", "CLS-B")

	// Rename cascades to students' kelas.
	renamed, err := classRepo.Rename(ctx, clsID, "X TKJ 1")
	require.NoError(t, err)
	assert.Equal(t, "X TKJ 1", renamed.Name)

	g1, _ := userRepo.GetByID(ctx, in1.ID)
	g2, _ := userRepo.GetByID(ctx, in2.ID)
	go2, _ := userRepo.GetByID(ctx, other.ID)
	assert.Equal(t, "X TKJ 1", g1.Kelas)
	assert.Equal(t, "X TKJ 1", g2.Kelas)
	assert.Equal(t, "CLS-B", go2.Kelas, "students in other classes are untouched")

	// studentCount tracks the new name.
	list, _ = classRepo.List(ctx)
	for _, c := range list {
		if c.ID == clsID {
			assert.Equal(t, "X TKJ 1", c.Name)
			assert.Equal(t, 2, c.StudentCount)
		}
	}

	// Renaming to an existing class name is rejected.
	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "X TKR 1", CreatedAt: now}))
	_, err = classRepo.Rename(ctx, clsID, "X TKR 1")
	assert.ErrorIs(t, err, repository.ErrClassDuplicate)
}

// mkUser is a small helper for the cascade tests below.
func mkUser(t *testing.T, userRepo repository.UserRepository, ctx context.Context, role, kelas string) *repository.User {
	now := time.Now().UTC().Truncate(time.Second)
	suffix := testutil.NewUserID()[:8]
	u := &repository.User{ID: testutil.NewUserID(), Username: "cc_" + suffix, Email: suffix + "@cc.com",
		PasswordHash: "x", Role: role, FullName: "U " + suffix, IsActive: true, Kelas: kelas, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, u))
	return u
}

func classID(t *testing.T, classRepo repository.ClassRepository, ctx context.Context, name string) string {
	list, _ := classRepo.List(ctx)
	for _, c := range list {
		if c.Name == name {
			return c.ID
		}
	}
	t.Fatalf("class %q not found", name)
	return ""
}

// Deleting a class must clear it from students (→ "-") and drop just that class
// from any teacher's comma-joined list, keeping the teacher's other classes.
func TestClassRepository_DeleteCascades(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	classRepo := repository.NewClassRepository(db)
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "ZDEL-1", CreatedAt: now}))
	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "ZDEL-2", CreatedAt: now}))
	del1 := classID(t, classRepo, ctx, "ZDEL-1")

	sIn := mkUser(t, userRepo, ctx, "student", "ZDEL-1")  // in deleted class
	sOut := mkUser(t, userRepo, ctx, "student", "ZDEL-2") // untouched
	tMulti := mkUser(t, userRepo, ctx, "teacher", "ZDEL-1, ZDEL-2")
	tOnly := mkUser(t, userRepo, ctx, "teacher", "ZDEL-1")

	require.NoError(t, classRepo.Delete(ctx, del1))

	gIn, _ := userRepo.GetByID(ctx, sIn.ID)
	gOut, _ := userRepo.GetByID(ctx, sOut.ID)
	assert.Equal(t, "", gIn.Kelas, "student in deleted class is cleared")
	assert.Equal(t, "", gIn.Jurusan, "derived jurusan cleared too")
	assert.Equal(t, "ZDEL-2", gOut.Kelas, "student in other class untouched")

	gMulti, _ := userRepo.GetByID(ctx, tMulti.ID)
	gOnly, _ := userRepo.GetByID(ctx, tOnly.ID)
	assert.Equal(t, "ZDEL-2", gMulti.Kelas, "only the deleted class is dropped from the teacher")
	assert.Equal(t, "", gOnly.Kelas, "teacher who only taught it now has none")

	// Class is really gone.
	list, _ := classRepo.List(ctx)
	for _, c := range list {
		assert.NotEqual(t, "ZDEL-1", c.Name)
	}

	// Deleting a missing class reports not-found.
	assert.ErrorIs(t, classRepo.Delete(ctx, "no-such-id"), repository.ErrClassNotFound)
}

// Renaming a class also rewrites the token inside teachers' comma-joined lists.
func TestClassRepository_RenameCascadesTeachers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	classRepo := repository.NewClassRepository(db)
	userRepo := repository.NewUserRepository(db)
	now := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, classRepo.Create(ctx, &repository.Class{ID: testutil.NewUserID(), Name: "ZREN-1", CreatedAt: now}))
	id := classID(t, classRepo, ctx, "ZREN-1")
	tch := mkUser(t, userRepo, ctx, "teacher", "ZREN-1, ZKEEP-1")

	_, err := classRepo.Rename(ctx, id, "ZREN-2")
	require.NoError(t, err)

	g, _ := userRepo.GetByID(ctx, tch.ID)
	assert.Equal(t, "ZREN-2, ZKEEP-1", g.Kelas)
}
