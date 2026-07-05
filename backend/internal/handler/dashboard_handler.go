package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	dashboardv1 "lms/backend/gen/dashboard/v1"
	"lms/backend/gen/dashboard/v1/dashboardv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/service"
)

var _ dashboardv1connect.DashboardServiceHandler = (*DashboardHandler)(nil)

type DashboardHandler struct {
	svc *service.DashboardService
	dashboardv1connect.UnimplementedDashboardServiceHandler
}

func NewDashboardHandler(svc *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{svc: svc}
}

func (h *DashboardHandler) GetTeacherDashboard(ctx context.Context, _ *connect.Request[dashboardv1.GetTeacherDashboardRequest]) (*connect.Response[dashboardv1.TeacherDashboard], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	d, err := h.svc.GetTeacherDashboard(ctx, claims.Role)
	if err != nil {
		if errors.Is(err, service.ErrPermissionDenied) {
			return nil, connect.NewError(connect.CodePermissionDenied, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	out := &dashboardv1.TeacherDashboard{
		TotalKelas:       int32(d.TotalKelas),
		TotalSiswa:       int32(d.TotalSiswa),
		TotalMateri:      int32(d.TotalMateri),
		TotalTugas:       int32(d.TotalTugas),
		TotalPengumpulan: int32(d.TotalPengumpulan),
		BelumKumpul:      int32(d.BelumKumpul),
		PerluDinilai:     int32(d.PerluDinilai),
		MateriPublikasi:  int32(d.MateriPublikasi),
		MateriDraft:      int32(d.MateriDraft),
		RataRataNilai:    d.RataRataNilai,
		TotalGuru:        int32(d.TotalGuru),
	}
	for _, jc := range d.SiswaPerJurusan {
		out.SiswaPerJurusan = append(out.SiswaPerJurusan, &dashboardv1.JurusanCount{
			Jurusan: jc.Jurusan, Count: int32(jc.Count),
		})
	}
	for _, kc := range d.SiswaPerKelas {
		out.SiswaPerKelas = append(out.SiswaPerKelas, &dashboardv1.KelasCount{
			Kelas: kc.Kelas, Count: int32(kc.Count),
		})
	}
	for _, ra := range d.TugasTerbaru {
		item := &dashboardv1.RecentAssignment{
			Id: ra.ID, Title: ra.Title, CourseName: ra.CourseName, SubmissionCount: int32(ra.SubmissionCount),
		}
		if ra.Deadline.Valid {
			item.Deadline = timestamppb.New(ra.Deadline.Time)
		}
		out.TugasTerbaru = append(out.TugasTerbaru, item)
	}
	for _, rs := range d.PengumpulanTerbaru {
		item := &dashboardv1.RecentSubmission{
			StudentName: rs.StudentName, Kelas: rs.Kelas, AssignmentTitle: rs.AssignmentTitle, Graded: rs.Graded,
		}
		if !rs.SubmittedAt.IsZero() {
			item.SubmittedAt = timestamppb.New(rs.SubmittedAt)
		}
		out.PengumpulanTerbaru = append(out.PengumpulanTerbaru, item)
	}
	return connect.NewResponse(out), nil
}
