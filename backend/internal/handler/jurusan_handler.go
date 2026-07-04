package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	jurusanv1 "lms/backend/gen/jurusan/v1"
	"lms/backend/gen/jurusan/v1/jurusanv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ jurusanv1connect.JurusanServiceHandler = (*JurusanHandler)(nil)

type JurusanHandler struct {
	svc *service.JurusanService
	jurusanv1connect.UnimplementedJurusanServiceHandler
}

func NewJurusanHandler(svc *service.JurusanService) *JurusanHandler {
	return &JurusanHandler{svc: svc}
}

func (h *JurusanHandler) CreateJurusan(ctx context.Context, req *connect.Request[jurusanv1.CreateJurusanRequest]) (*connect.Response[jurusanv1.Jurusan], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	j, err := h.svc.CreateJurusan(ctx, claims.Role, req.Msg.Name)
	if err != nil {
		return nil, mapJurusanError(err)
	}
	return connect.NewResponse(jurusanToProto(j)), nil
}

func (h *JurusanHandler) UpdateJurusan(ctx context.Context, req *connect.Request[jurusanv1.UpdateJurusanRequest]) (*connect.Response[jurusanv1.Jurusan], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	j, err := h.svc.UpdateJurusan(ctx, claims.Role, req.Msg.Id, req.Msg.Name)
	if err != nil {
		return nil, mapJurusanError(err)
	}
	return connect.NewResponse(jurusanToProto(j)), nil
}

func (h *JurusanHandler) ListJurusans(ctx context.Context, _ *connect.Request[jurusanv1.ListJurusansRequest]) (*connect.Response[jurusanv1.ListJurusansResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	list, err := h.svc.ListJurusans(ctx, claims.Role)
	if err != nil {
		return nil, mapJurusanError(err)
	}
	out := make([]*jurusanv1.Jurusan, 0, len(list))
	for _, j := range list {
		out = append(out, jurusanToProto(j))
	}
	return connect.NewResponse(&jurusanv1.ListJurusansResponse{Jurusans: out}), nil
}

func (h *JurusanHandler) DeleteJurusan(ctx context.Context, req *connect.Request[jurusanv1.DeleteJurusanRequest]) (*connect.Response[jurusanv1.DeleteJurusanResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.DeleteJurusan(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapJurusanError(err)
	}
	return connect.NewResponse(&jurusanv1.DeleteJurusanResponse{}), nil
}

func jurusanToProto(j *repository.Jurusan) *jurusanv1.Jurusan {
	return &jurusanv1.Jurusan{
		Id:           j.ID,
		Name:         j.Name,
		StudentCount: int32(j.StudentCount),
		CreatedAt:    timestamppb.New(j.CreatedAt),
	}
}

func mapJurusanError(err error) error {
	switch {
	case errors.Is(err, service.ErrJurusanNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrJurusanDuplicate):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
