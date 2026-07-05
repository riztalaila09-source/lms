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

func (h *SchoolHandler) GetSchool(ctx context.Context, _ *connect.Request[schoolv1.GetSchoolRequest]) (*connect.Response[schoolv1.School], error) {
	if _, ok := middleware.ClaimsFromContext(ctx); !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	s, err := h.svc.GetSchool(ctx)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.School{Name: s.Name, Address: s.Address}), nil
}

func (h *SchoolHandler) UpdateSchool(ctx context.Context, req *connect.Request[schoolv1.UpdateSchoolRequest]) (*connect.Response[schoolv1.School], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	s, err := h.svc.UpdateSchool(ctx, claims.Role, req.Msg.Name, req.Msg.Address)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.School{Name: s.Name, Address: s.Address}), nil
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
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
