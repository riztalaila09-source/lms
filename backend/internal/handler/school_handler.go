package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	schoolv1 "lms/backend/gen/school/v1"
	"lms/backend/gen/school/v1/schoolv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ schoolv1connect.SchoolServiceHandler = (*SchoolHandler)(nil)

type SchoolHandler struct {
	svc *service.SchoolService
	schoolv1connect.UnimplementedSchoolServiceHandler
}

func NewSchoolHandler(svc *service.SchoolService) *SchoolHandler {
	return &SchoolHandler{svc: svc}
}

// GetSchool is public (exempt from auth) so the landing page can render it.
func (h *SchoolHandler) GetSchool(ctx context.Context, _ *connect.Request[schoolv1.GetSchoolRequest]) (*connect.Response[schoolv1.School], error) {
	s, err := h.svc.GetSchool(ctx)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(schoolToProto(s)), nil
}

func (h *SchoolHandler) UpdateSchool(ctx context.Context, req *connect.Request[schoolv1.UpdateSchoolRequest]) (*connect.Response[schoolv1.School], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	m := req.Msg
	s, err := h.svc.UpdateSchool(ctx, claims.Role, service.UpdateSchoolInput{
		Name: m.Name, Address: m.Address, AppName: m.AppName, Logo: m.Logo, Profil: m.Profil,
		Visi: m.Visi, Misi: m.Misi, KepalaSekolah: m.KepalaSekolah, TahunBerdiri: m.TahunBerdiri,
		Email: m.Email, Whatsapp: m.Whatsapp, Npsn: m.Npsn, Status: m.Status, Akreditasi: m.Akreditasi, Jenjang: m.Jenjang,
		ProfilImage: m.ProfilImage, ProfilVideo: m.ProfilVideo, MapsURL: m.MapsUrl, PpdbAktif: m.PpdbAktif,
		PpdbInfo: m.PpdbInfo, PpdbBrosur: m.PpdbBrosur, PpdbDaftarURL: m.PpdbDaftarUrl, PpdbPengumuman: m.PpdbPengumuman,
		KepalaSekolahFoto: m.KepalaSekolahFoto,
	})
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(schoolToProto(s)), nil
}

func schoolToProto(s *repository.School) *schoolv1.School {
	return &schoolv1.School{
		Name: s.Name, Address: s.Address, AppName: s.AppName, Logo: s.Logo, Profil: s.Profil,
		Visi: s.Visi, Misi: s.Misi, KepalaSekolah: s.KepalaSekolah, TahunBerdiri: s.TahunBerdiri,
		Email: s.Email, Whatsapp: s.Whatsapp, Npsn: s.Npsn, Status: s.Status, Akreditasi: s.Akreditasi, Jenjang: s.Jenjang,
		ProfilImage: s.ProfilImage, ProfilVideo: s.ProfilVideo, MapsUrl: s.MapsURL, PpdbAktif: s.PpdbAktif,
		PpdbInfo: s.PpdbInfo, PpdbBrosur: s.PpdbBrosur, PpdbDaftarUrl: s.PpdbDaftarURL, PpdbPengumuman: s.PpdbPengumuman,
		KepalaSekolahFoto: s.KepalaSekolahFoto,
	}
}

// ListStaff is public (landing page directory).
func (h *SchoolHandler) ListStaff(ctx context.Context, _ *connect.Request[schoolv1.ListStaffRequest]) (*connect.Response[schoolv1.ListStaffResponse], error) {
	list, err := h.svc.ListStaff(ctx)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.ListStaffResponse{Staff: staffToProto(list)}), nil
}

func (h *SchoolHandler) SetStaff(ctx context.Context, req *connect.Request[schoolv1.SetStaffRequest]) (*connect.Response[schoolv1.ListStaffResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	in := make([]*repository.Staff, 0, len(req.Msg.Staff))
	for _, st := range req.Msg.Staff {
		in = append(in, &repository.Staff{Nama: st.Nama, Jabatan: st.Jabatan, Foto: st.Foto})
	}
	list, err := h.svc.SetStaff(ctx, claims.Role, in)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.ListStaffResponse{Staff: staffToProto(list)}), nil
}

func staffToProto(list []*repository.Staff) []*schoolv1.Staff {
	out := make([]*schoolv1.Staff, 0, len(list))
	for _, st := range list {
		out = append(out, &schoolv1.Staff{Id: st.ID, Nama: st.Nama, Jabatan: st.Jabatan, Foto: st.Foto})
	}
	return out
}

// ListContent is public (landing page reads galeri/jurusan/berita/…).
func (h *SchoolHandler) ListContent(ctx context.Context, req *connect.Request[schoolv1.ListContentRequest]) (*connect.Response[schoolv1.ListContentResponse], error) {
	list, err := h.svc.ListContent(ctx, req.Msg.Type)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.ListContentResponse{Items: contentToProto(list)}), nil
}

func (h *SchoolHandler) SetContent(ctx context.Context, req *connect.Request[schoolv1.SetContentRequest]) (*connect.Response[schoolv1.ListContentResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	in := make([]*repository.ContentItem, 0, len(req.Msg.Items))
	for _, it := range req.Msg.Items {
		in = append(in, &repository.ContentItem{Title: it.Title, Subtitle: it.Subtitle, Body: it.Body, Image: it.Image, URL: it.Url})
	}
	list, err := h.svc.SetContent(ctx, claims.Role, req.Msg.Type, in)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.ListContentResponse{Items: contentToProto(list)}), nil
}

func contentToProto(list []*repository.ContentItem) []*schoolv1.ContentItem {
	out := make([]*schoolv1.ContentItem, 0, len(list))
	for _, c := range list {
		out = append(out, &schoolv1.ContentItem{Id: c.ID, Type: c.Type, Title: c.Title, Subtitle: c.Subtitle, Body: c.Body, Image: c.Image, Url: c.URL})
	}
	return out
}

// GetAccessPolicy / SetAccessPolicy / ExportBackup are admin-only (enforced in the service).
func (h *SchoolHandler) GetAccessPolicy(ctx context.Context, _ *connect.Request[schoolv1.GetAccessPolicyRequest]) (*connect.Response[schoolv1.AccessPolicyResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	keys, err := h.svc.GetAccessPolicy(ctx, claims.Role)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.AccessPolicyResponse{DeniedKeys: keys}), nil
}

func (h *SchoolHandler) SetAccessPolicy(ctx context.Context, req *connect.Request[schoolv1.SetAccessPolicyRequest]) (*connect.Response[schoolv1.AccessPolicyResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	keys, err := h.svc.SetAccessPolicy(ctx, claims.Role, req.Msg.DeniedKeys)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.AccessPolicyResponse{DeniedKeys: keys}), nil
}

func (h *SchoolHandler) ExportBackup(ctx context.Context, _ *connect.Request[schoolv1.ExportBackupRequest]) (*connect.Response[schoolv1.ExportBackupResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	data, filename, err := h.svc.ExportBackup(ctx, claims.Role)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.ExportBackupResponse{Data: data, Filename: filename}), nil
}

func (h *SchoolHandler) CreateSemester(ctx context.Context, req *connect.Request[schoolv1.CreateSemesterRequest]) (*connect.Response[schoolv1.Semester], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	sem, err := h.svc.CreateSemester(ctx, claims.Role, req.Msg.Semester, req.Msg.TahunAjaran)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(semesterToProto(sem)), nil
}

func (h *SchoolHandler) ListSemesters(ctx context.Context, _ *connect.Request[schoolv1.ListSemestersRequest]) (*connect.Response[schoolv1.ListSemestersResponse], error) {
	if _, ok := middleware.ClaimsFromContext(ctx); !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	list, err := h.svc.ListSemesters(ctx)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := make([]*schoolv1.Semester, 0, len(list))
	for _, s := range list {
		out = append(out, semesterToProto(s))
	}
	return connect.NewResponse(&schoolv1.ListSemestersResponse{Semesters: out}), nil
}

func (h *SchoolHandler) SetActiveSemester(ctx context.Context, req *connect.Request[schoolv1.SetActiveSemesterRequest]) (*connect.Response[schoolv1.Semester], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	sem, err := h.svc.SetActiveSemester(ctx, claims.Role, req.Msg.Id)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(semesterToProto(sem)), nil
}

func (h *SchoolHandler) DeleteSemester(ctx context.Context, req *connect.Request[schoolv1.DeleteSemesterRequest]) (*connect.Response[schoolv1.DeleteSemesterResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.DeleteSemester(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.DeleteSemesterResponse{}), nil
}

func semesterToProto(s *repository.Semester) *schoolv1.Semester {
	return &schoolv1.Semester{
		Id:          s.ID,
		Semester:    s.Semester,
		TahunAjaran: s.TahunAjaran,
		IsActive:    s.IsActive,
		CreatedAt:   timestamppb.New(s.CreatedAt),
	}
}

func mapSchoolError(err error) error {
	switch {
	case errors.Is(err, service.ErrSemesterNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrSemesterDuplicate):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrInvalidArgument):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
