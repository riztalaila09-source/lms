package migrations_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/database/migrations"
	"lms/backend/internal/repository"
	"lms/backend/internal/testutil"
)

// The one-time cleanup must Title-Case existing names (keeping academic titles)
// and restore a leading 0 on phones — for both users and parents.
func TestNormalizePeople(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	// Insert messy rows via the repositories (raw persistence, no normalization).
	userRepo := repository.NewUserRepository(db)
	u := &repository.User{ID: testutil.NewUserID(), Username: "nx_msgy", Email: "msgy@x.com", PasswordHash: "x",
		Role: "student", FullName: "lucky ardiansyah sakti", IsActive: true, Phone: "81234567890",
		CreatedAt: now, UpdatedAt: now}
	require.NoError(t, userRepo.Create(ctx, u))

	parentRepo := repository.NewParentRepository(db)
	p := &repository.Parent{ID: testutil.NewUserID(), NamaOrtu: "budi santoso, S.Pd", Hubungan: "Ayah", Phone: "6281299000", Alamat: "Jl"}
	require.NoError(t, parentRepo.Create(ctx, p))

	n, err := migrations.NormalizePeople(ctx, db)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, n, 2)

	var name, phone string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT full_name, phone FROM users WHERE id = ?`, u.ID).Scan(&name, &phone))
	assert.Equal(t, "Lucky Ardiansyah Sakti", name)
	assert.Equal(t, "081234567890", phone)

	require.NoError(t, db.QueryRowContext(ctx, `SELECT nama_ortu, phone FROM parents WHERE id = ?`, p.ID).Scan(&name, &phone))
	assert.Equal(t, "Budi Santoso, S.Pd", name, "academic title preserved")
	assert.Equal(t, "081299000", phone)

	// Idempotent: a second run changes nothing.
	n2, err := migrations.NormalizePeople(ctx, db)
	require.NoError(t, err)
	assert.Equal(t, 0, n2)
}
