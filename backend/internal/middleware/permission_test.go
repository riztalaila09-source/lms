package middleware

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"lms/backend/internal/service"
)

// fakeCaps denies the capability keys it was given.
type fakeCaps struct{ denied map[string]bool }

func (f fakeCaps) IsCapabilityDenied(key string) bool { return f.denied[key] }

func TestPermitProcedure_Capabilities(t *testing.T) {
	teacher := []string{service.PermKelolaMateri} // teacher may manage materi
	caps := fakeCaps{denied: map[string]bool{"materi.delete": true}}

	const update = "/material.v1.MaterialService/UpdateMaterial"
	const del = "/material.v1.MaterialService/DeleteMaterial"

	// Teacher with the kelola permission: edit allowed, delete denied centrally.
	assert.True(t, permitProcedure(update, "teacher", teacher, caps), "edit allowed (not denied)")
	assert.False(t, permitProcedure(del, "teacher", teacher, caps), "delete denied by central policy")

	// Admin bypasses the central capability gate entirely.
	assert.True(t, permitProcedure(del, "admin", nil, caps), "admin never blocked by capabilities")

	// Without the underlying kelola permission the teacher is blocked regardless.
	assert.False(t, permitProcedure(update, "teacher", nil, caps), "no kelola_materi -> blocked")

	// Nil caps checker = nothing denied.
	assert.True(t, permitProcedure(del, "teacher", teacher, nil), "nil checker allows")

	// A procedure with no permission/capability mapping is always allowed.
	assert.True(t, permitProcedure("/dashboard.v1.DashboardService/GetStudentHome", "teacher", nil, caps))
}
