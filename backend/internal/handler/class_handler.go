package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	classv1 "lms/backend/gen/class/v1"
	"lms/backend/gen/class/v1/classv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ classv1connect.ClassServiceHandler = (*ClassHandler)(nil)

type ClassHandler struct {
	svc *service.ClassService
	classv1connect.UnimplementedClassServiceHandler
}

func NewClassHandler(svc *service.ClassService) *ClassHandler {
	return &ClassHandler{svc: svc}
}

func (h *ClassHandler) CreateClass(ctx context.Context, req *connect.Request[classv1.CreateClassRequest]) (*connect.Response[classv1.Class], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	c, err := h.svc.CreateClass(ctx, claims.Role, req.Msg.Name)
	if err != nil {
		return nil, mapClassError(err)
	}
	return connect.NewResponse(classToProto(c)), nil
}

func (h *ClassHandler) UpdateClass(ctx context.Context, req *connect.Request[classv1.UpdateClassRequest]) (*connect.Response[classv1.Class], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	c, err := h.svc.UpdateClass(ctx, claims.Role, req.Msg.Id, req.Msg.Name)
	if err != nil {
		return nil, mapClassError(err)
	}
	return connect.NewResponse(classToProto(c)), nil
}

func (h *ClassHandler) ListClasses(ctx context.Context, _ *connect.Request[classv1.ListClassesRequest]) (*connect.Response[classv1.ListClassesResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	list, err := h.svc.ListClasses(ctx, claims.Role)
	if err != nil {
		return nil, mapClassError(err)
	}
	out := make([]*classv1.Class, 0, len(list))
	for _, c := range list {
		out = append(out, classToProto(c))
	}
	return connect.NewResponse(&classv1.ListClassesResponse{Classes: out}), nil
}

func (h *ClassHandler) DeleteClass(ctx context.Context, req *connect.Request[classv1.DeleteClassRequest]) (*connect.Response[classv1.DeleteClassResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.DeleteClass(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapClassError(err)
	}
	return connect.NewResponse(&classv1.DeleteClassResponse{}), nil
}

func classToProto(c *repository.Class) *classv1.Class {
	return &classv1.Class{
		Id:           c.ID,
		Name:         c.Name,
		StudentCount: int32(c.StudentCount),
		CreatedAt:    timestamppb.New(c.CreatedAt),
	}
}

func mapClassError(err error) error {
	switch {
	case errors.Is(err, service.ErrClassNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrClassDuplicate):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
