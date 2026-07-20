package middleware

import (
	"context"

	"connectrpc.com/connect"

	"lms/backend/internal/service"
)

// procedurePermissions maps an RPC procedure to the access-right key it requires.
// Procedures NOT listed are unguarded here: reads, student-facing actions, and
// the user service (which gates by the *target* account type inside the service,
// and the activity-log methods which check kelola_log there too).
//
// Admins bypass every check (service.HasPermission returns true for admins), so
// this map only restricts teachers who lack a specific permission.
var procedurePermissions = map[string]string{
	// Master Data — kelas / jurusan / sekolah & semester
	"/class.v1.ClassService/CreateClass":            service.PermKelolaSekolah,
	"/class.v1.ClassService/UpdateClass":            service.PermKelolaSekolah,
	"/class.v1.ClassService/DeleteClass":            service.PermKelolaSekolah,
	"/class.v1.ClassService/SetClassWali":           service.PermKelolaSekolah,
	"/jurusan.v1.JurusanService/CreateJurusan":      service.PermKelolaSekolah,
	"/jurusan.v1.JurusanService/UpdateJurusan":      service.PermKelolaSekolah,
	"/jurusan.v1.JurusanService/DeleteJurusan":      service.PermKelolaSekolah,
	"/school.v1.SchoolService/UpdateSchool":         service.PermKelolaSekolah,
	"/school.v1.SchoolService/CreateSemester":       service.PermKelolaSekolah,
	"/school.v1.SchoolService/SetActiveSemester":    service.PermKelolaSekolah,
	"/school.v1.SchoolService/DeleteSemester":       service.PermKelolaSekolah,
	"/school.v1.SchoolService/SetStaff":             service.PermKelolaSekolah,
	"/school.v1.SchoolService/SetContent":           service.PermKelolaSekolah,

	// Orang Tua
	"/parent.v1.ParentService/CreateParent": service.PermKelolaOrtu,
	"/parent.v1.ParentService/UpdateParent": service.PermKelolaOrtu,
	"/parent.v1.ParentService/DeleteParent": service.PermKelolaOrtu,

	// Absensi
	"/attendance.v1.AttendanceService/CreateSession":   service.PermKelolaAbsensi,
	"/attendance.v1.AttendanceService/RegenerateToken": service.PermKelolaAbsensi,
	"/attendance.v1.AttendanceService/SetRecordStatus": service.PermKelolaAbsensi,
	"/attendance.v1.AttendanceService/DeleteSession":   service.PermKelolaAbsensi,

	// Tugas / Kuis / Praktikum — authoring & block controls
	"/assignment.v1.AssignmentService/CreateAssignment":      service.PermKelolaTugas,
	"/assignment.v1.AssignmentService/UpdateAssignment":      service.PermKelolaTugas,
	"/assignment.v1.AssignmentService/DeleteAssignment":      service.PermKelolaTugas,
	"/assignment.v1.AssignmentService/SetAssignmentQuestions": service.PermKelolaTugas,
	"/assignment.v1.AssignmentService/SetAssignmentGroups":   service.PermKelolaTugas,
	"/assignment.v1.AssignmentService/BlockStudent":          service.PermKelolaTugas,
	"/assignment.v1.AssignmentService/UnblockStudent":        service.PermKelolaTugas,
	// Penilaian
	"/assignment.v1.AssignmentService/GradeSubmission":      service.PermKelolaNilai,
	"/assignment.v1.AssignmentService/GradeGroupSubmission": service.PermKelolaNilai,
	"/assignment.v1.AssignmentService/ListGrades":           service.PermKelolaNilai,

	// Materi & Mata Pelajaran
	"/material.v1.MaterialService/CreateMaterial":        service.PermKelolaMateri,
	"/material.v1.MaterialService/UpdateMaterial":        service.PermKelolaMateri,
	"/material.v1.MaterialService/DeleteMaterial":        service.PermKelolaMateri,
	"/material.v1.MaterialService/CreateQuestion":        service.PermKelolaMateri,
	"/material.v1.MaterialService/DeleteQuestion":        service.PermKelolaMateri,
	"/material.v1.MaterialService/CreateEssayQuestion":   service.PermKelolaMateri,
	"/material.v1.MaterialService/DeleteEssayQuestion":   service.PermKelolaMateri,
	"/material.v1.MaterialService/CreateCategory":        service.PermKelolaMateri,
	"/material.v1.MaterialService/DeleteCategory":        service.PermKelolaMateri,
	"/material.v1.MaterialService/ResetStudentProgress":  service.PermKelolaMateri,
	"/course.v1.CourseService/CreateCourse":              service.PermKelolaMateri,
	"/course.v1.CourseService/UpdateCourse":              service.PermKelolaMateri,
	"/course.v1.CourseService/DeleteCourse":              service.PermKelolaMateri,
	"/course.v1.CourseService/EnrollStudents":            service.PermKelolaMateri,
	"/course.v1.CourseService/UnenrollStudent":           service.PermKelolaMateri,

	// Mitra PKL
	"/pkl.v1.PklService/CreatePartner": service.PermKelolaPkl,
	"/pkl.v1.PklService/UpdatePartner": service.PermKelolaPkl,
	"/pkl.v1.PklService/DeletePartner": service.PermKelolaPkl,
}

// procedureCapabilities maps edit/delete procedures to a central capability key
// ("<resource>.edit" / "<resource>.delete"). These are controlled globally for
// teachers in Pengaturan → Hak Akses. Absent from this map = not restricted.
// Admins are never restricted. Default (key not in the denied set) = allowed.
var procedureCapabilities = map[string]string{
	"/material.v1.MaterialService/UpdateMaterial":            "materi.edit",
	"/material.v1.MaterialService/DeleteMaterial":            "materi.delete",
	"/course.v1.CourseService/UpdateCourse":                  "mapel.edit",
	"/course.v1.CourseService/DeleteCourse":                  "mapel.delete",
	"/assignment.v1.AssignmentService/UpdateAssignment":      "tugas.edit",
	"/assignment.v1.AssignmentService/DeleteAssignment":      "tugas.delete",
	"/assignment.v1.AssignmentService/GradeSubmission":       "nilai.edit",
	"/assignment.v1.AssignmentService/GradeGroupSubmission":  "nilai.edit",
	"/attendance.v1.AttendanceService/SetRecordStatus":       "absensi.edit",
	"/attendance.v1.AttendanceService/DeleteSession":         "absensi.delete",
	"/pkl.v1.PklService/UpdatePartner":                       "pkl.edit",
	"/pkl.v1.PklService/DeletePartner":                       "pkl.delete",
	// Deleting accounts in the Pengguna menu (murid/guru) and parents (ortu).
	// Admins can always restrict whether teachers may delete via Hak Akses.
	"/user.v1.UserService/DeleteUser":                        "pengguna.delete",
	"/parent.v1.ParentService/DeleteParent":                  "pengguna.delete",
}

// CapabilityChecker reports whether a capability key is globally denied to teachers.
type CapabilityChecker interface {
	IsCapabilityDenied(key string) bool
}

// NewPermissionInterceptor enforces per-procedure access rights. It must run
// AFTER the auth interceptor so claims are present in the context. The optional
// caps checker additionally enforces central edit/delete capabilities for teachers.
func NewPermissionInterceptor(caps CapabilityChecker) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			proc := req.Spec().Procedure
			_, guarded := procedurePermissions[proc]
			if !guarded && procedureCapabilities[proc] == "" {
				return next(ctx, req)
			}
			claims, ok := ClaimsFromContext(ctx)
			if !ok {
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}
			if !permitProcedure(proc, claims.Role, claims.Permissions, caps) {
				return nil, connect.NewError(connect.CodePermissionDenied, service.ErrPermissionDenied)
			}
			return next(ctx, req)
		}
	}
}

// permitProcedure decides whether a caller may invoke proc, applying both the
// per-permission gate and the central edit/delete capability gate for teachers.
// Admins are never blocked by capabilities. Default (capability not in the
// denied set) allows the action.
func permitProcedure(proc, role string, perms []string, caps CapabilityChecker) bool {
	if perm, guarded := procedurePermissions[proc]; guarded {
		if !service.HasPermission(role, perms, perm) {
			return false
		}
	}
	if capKey := procedureCapabilities[proc]; capKey != "" && role == "teacher" && caps != nil && caps.IsCapabilityDenied(capKey) {
		return false
	}
	return true
}
