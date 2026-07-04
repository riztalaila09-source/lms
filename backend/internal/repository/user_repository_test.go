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

func newTestUser(suffix string) *repository.User {
	now := time.Now().UTC().Truncate(time.Second)
	return &repository.User{
		ID:           testutil.NewUserID(),
		Username:     "user_" + suffix,
		Email:        "user_" + suffix + "@test.com",
		PasswordHash: "$2a$10$testhash" + suffix,
		Role:         "student",
		FullName:     "Test User " + suffix,
		IsActive:     true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

func TestUserRepository_PasswordPlainAndMutateClass(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	// Unique class names so demo-seed students don't pollute the counts.
	const from, to, to2 = "MUT-FROM", "MUT-TO", "MUT-TO2"

	// password_plain round-trips through create/get.
	u := newTestUser("plain")
	u.PasswordPlain = "Rahasia123"
	u.Kelas = from
	require.NoError(t, repo.Create(ctx, u))
	got, err := repo.GetByID(ctx, u.ID)
	require.NoError(t, err)
	assert.Equal(t, "Rahasia123", got.PasswordPlain)

	// Two more students in `from`, plus one already in `to`.
	s2 := newTestUser("plain2"); s2.Kelas = from
	s3 := newTestUser("plain3"); s3.Kelas = from
	other := newTestUser("plainother"); other.Kelas = to
	for _, s := range []*repository.User{s2, s3, other} {
		require.NoError(t, repo.Create(ctx, s))
	}

	// Bulk move: everyone in `from` → `to` (3 students), not the existing `to` one.
	n, err := repo.MoveStudentsByClass(ctx, from, to)
	require.NoError(t, err)
	assert.Equal(t, int64(3), n)
	after, _ := repo.GetByID(ctx, u.ID)
	assert.Equal(t, to, after.Kelas)

	// Per-id move: send two of them to `to2`.
	n2, err := repo.MoveStudentsByIDs(ctx, []string{u.ID, s2.ID}, to2)
	require.NoError(t, err)
	assert.Equal(t, int64(2), n2)
	a1, _ := repo.GetByID(ctx, u.ID)
	a2, _ := repo.GetByID(ctx, s3.ID)
	assert.Equal(t, to2, a1.Kelas)
	assert.Equal(t, to, a2.Kelas, "untouched student stays")
}

func TestUserRepository_StoryAndListStories(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	withStory := newTestUser("story1")
	withStory.Story = "Belajar di sini sangat membantu!"
	require.NoError(t, repo.Create(ctx, withStory))

	noStory := newTestUser("story2")
	require.NoError(t, repo.Create(ctx, noStory))

	inactive := newTestUser("story3")
	inactive.Story = "Cerita tapi nonaktif"
	inactive.IsActive = false
	require.NoError(t, repo.Create(ctx, inactive))

	// Story round-trips.
	got, err := repo.GetByID(ctx, withStory.ID)
	require.NoError(t, err)
	assert.Equal(t, "Belajar di sini sangat membantu!", got.Story)

	// ListStories returns only active users with a non-empty story.
	stories, err := repo.ListStories(ctx, 50)
	require.NoError(t, err)
	ids := map[string]string{}
	for _, s := range stories {
		ids[s.UserID] = s.Story
	}
	assert.Contains(t, ids, withStory.ID)
	assert.NotContains(t, ids, noStory.ID, "empty story excluded")
	assert.NotContains(t, ids, inactive.ID, "inactive user excluded")
}

func TestUserRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	u := newTestUser("create")
	require.NoError(t, repo.Create(ctx, u))

	t.Run("duplicate email returns ErrDuplicate", func(t *testing.T) {
		dup := newTestUser("create")
		dup.ID = testutil.NewUserID()
		dup.Username = "different_username"
		err := repo.Create(ctx, dup)
		assert.ErrorIs(t, err, repository.ErrDuplicate)
	})

	t.Run("duplicate username returns ErrDuplicate", func(t *testing.T) {
		dup := newTestUser("create")
		dup.ID = testutil.NewUserID()
		dup.Email = "unique@test.com"
		err := repo.Create(ctx, dup)
		assert.ErrorIs(t, err, repository.ErrDuplicate)
	})
}

func TestUserRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	u := newTestUser("getbyid")
	require.NoError(t, repo.Create(ctx, u))

	t.Run("found", func(t *testing.T) {
		got, err := repo.GetByID(ctx, u.ID)
		require.NoError(t, err)
		assert.Equal(t, u.ID, got.ID)
		assert.Equal(t, u.Email, got.Email)
		assert.Equal(t, u.Role, got.Role)
	})

	t.Run("not found returns ErrNotFound", func(t *testing.T) {
		_, err := repo.GetByID(ctx, "nonexistent-id")
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func TestUserRepository_GetByEmail(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	u := newTestUser("getbyemail")
	require.NoError(t, repo.Create(ctx, u))

	t.Run("found", func(t *testing.T) {
		got, err := repo.GetByEmail(ctx, u.Email)
		require.NoError(t, err)
		assert.Equal(t, u.ID, got.ID)
	})

	t.Run("not found returns ErrNotFound", func(t *testing.T) {
		_, err := repo.GetByEmail(ctx, "nope@nope.com")
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func TestUserRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	u := newTestUser("update")
	require.NoError(t, repo.Create(ctx, u))

	u.FullName = "Updated Name"
	u.Role = "teacher"
	require.NoError(t, repo.Update(ctx, u))

	got, err := repo.GetByID(ctx, u.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", got.FullName)
	assert.Equal(t, "teacher", got.Role)

	t.Run("not found returns ErrNotFound", func(t *testing.T) {
		ghost := newTestUser("ghost")
		ghost.ID = "nonexistent-id"
		err := repo.Update(ctx, ghost)
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func TestUserRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	u := newTestUser("delete")
	require.NoError(t, repo.Create(ctx, u))

	require.NoError(t, repo.Delete(ctx, u.ID))

	_, err := repo.GetByID(ctx, u.ID)
	assert.ErrorIs(t, err, repository.ErrNotFound)

	t.Run("delete nonexistent returns ErrNotFound", func(t *testing.T) {
		err := repo.Delete(ctx, "nonexistent-id")
		assert.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func TestUserRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	roles := []string{"student", "student", "teacher", "teacher", "admin"}
	for i, role := range roles {
		u := newTestUser(string(rune('a' + i)))
		u.Role = role
		require.NoError(t, repo.Create(ctx, u))
	}

	t.Run("list all", func(t *testing.T) {
		// seed admin already created, so we have 5 new + 1 seed = 6 total
		users, total, err := repo.List(ctx, repository.ListFilter{Page: 1, PageSize: 20})
		require.NoError(t, err)
		assert.GreaterOrEqual(t, total, 5)
		assert.NotEmpty(t, users)
	})

	t.Run("filter by role", func(t *testing.T) {
		// at least the 2 students created above (demo seed may add more)
		users, total, err := repo.List(ctx, repository.ListFilter{Page: 1, PageSize: 20, RoleFilter: "student"})
		require.NoError(t, err)
		assert.GreaterOrEqual(t, total, 2)
		for _, u := range users {
			assert.Equal(t, "student", u.Role)
		}
	})

	t.Run("pagination", func(t *testing.T) {
		page1, _, err := repo.List(ctx, repository.ListFilter{Page: 1, PageSize: 2})
		require.NoError(t, err)
		assert.Len(t, page1, 2)

		page2, _, err := repo.List(ctx, repository.ListFilter{Page: 2, PageSize: 2})
		require.NoError(t, err)
		assert.Len(t, page2, 2)

		assert.NotEqual(t, page1[0].ID, page2[0].ID)
	})
}
