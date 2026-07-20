package handler

import (
	"context"
	"errors"
	"math"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	commonv1 "lms/backend/gen/common/v1"
	parentv1 "lms/backend/gen/parent/v1"
	"lms/backend/gen/parent/v1/parentv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ parentv1connect.ParentServiceHandler = (*ParentHandler)(nil)

type ParentHandler struct {
	svc *service.ParentService
	parentv1connect.UnimplementedParentServiceHandler
}

func NewParentHandler(svc *service.ParentService) *ParentHandler {
	return &ParentHandler{svc: svc}
}

func (h *ParentHandler) CreateParent(ctx context.Context, req *connect.Request[parentv1.CreateParentRequest]) (*connect.Response[parentv1.Parent], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	p, err := h.svc.CreateParent(ctx, claims.Role, service.ParentInput{
		NamaOrtu:   req.Msg.NamaOrtu,
		Hubungan:   req.Msg.Hubungan,
		Phone:      req.Msg.Phone,
		Alamat:     req.Msg.Alamat,
		StudentIDs: req.Msg.StudentIds,
	})
	if err != nil {
		return nil, mapParentError(err)
	}
	return connect.NewResponse(parentToProto(p)), nil
}

func (h *ParentHandler) GetParent(ctx context.Context, req *connect.Request[parentv1.GetParentRequest]) (*connect.Response[parentv1.Parent], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	p, err := h.svc.GetParent(ctx, claims.Role, req.Msg.Id)
	if err != nil {
		return nil, mapParentError(err)
	}
	return connect.NewResponse(parentToProto(p)), nil
}

func (h *ParentHandler) UpdateParent(ctx context.Context, req *connect.Request[parentv1.UpdateParentRequest]) (*connect.Response[parentv1.Parent], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	p, err := h.svc.UpdateParent(ctx, claims.Role, req.Msg.Id, service.ParentInput{
		NamaOrtu:   req.Msg.NamaOrtu,
		Hubungan:   req.Msg.Hubungan,
		Phone:      req.Msg.Phone,
		Alamat:     req.Msg.Alamat,
		StudentIDs: req.Msg.StudentIds,
	})
	if err != nil {
		return nil, mapParentError(err)
	}
	return connect.NewResponse(parentToProto(p)), nil
}

func (h *ParentHandler) ListParents(ctx context.Context, req *connect.Request[parentv1.ListParentsRequest]) (*connect.Response[parentv1.ListParentsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	page, pageSize := 1, 20
	if req.Msg.Pagination != nil {
		if req.Msg.Pagination.Page > 0 {
			page = int(req.Msg.Pagination.Page)
		}
		if req.Msg.Pagination.PageSize > 0 {
			pageSize = int(req.Msg.Pagination.PageSize)
		}
	}
	search := ""
	if req.Msg.Search != nil {
		search = *req.Msg.Search
	}
	parents, total, err := h.svc.ListParents(ctx, claims.Role, search, page, pageSize)
	if err != nil {
		return nil, mapParentError(err)
	}
	out := make([]*parentv1.Parent, 0, len(parents))
	for _, p := range parents {
		out = append(out, parentToProto(p))
	}
	totalPages := int32(math.Ceil(float64(total) / float64(pageSize)))
	return connect.NewResponse(&parentv1.ListParentsResponse{
		Parents: out,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(total),
			Page:       int32(page),
			PageSize:   int32(pageSize),
			TotalPages: totalPages,
		},
	}), nil
}

func (h *ParentHandler) DeleteParent(ctx context.Context, req *connect.Request[parentv1.DeleteParentRequest]) (*connect.Response[parentv1.DeleteParentResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.DeleteParent(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapParentError(err)
	}
	return connect.NewResponse(&parentv1.DeleteParentResponse{}), nil
}

func parentToProto(p *repository.Parent) *parentv1.Parent {
	children := make([]*parentv1.ChildRef, 0, len(p.Children))
	for _, c := range p.Children {
		children = append(children, &parentv1.ChildRef{
			StudentId: c.StudentID,
			FullName:  c.FullName,
			Kelas:     c.Kelas,
		})
	}
	return &parentv1.Parent{
		Id:        p.ID,
		NamaOrtu:  p.NamaOrtu,
		Hubungan:  p.Hubungan,
		Phone:     p.Phone,
		Alamat:    p.Alamat,
		Children:  children,
		CreatedAt: timestamppb.New(p.CreatedAt),
		UpdatedAt: timestamppb.New(p.UpdatedAt),
	}
}

func mapParentError(err error) error {
	switch {
	case errors.Is(err, service.ErrParentNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrInvalidArgument):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
