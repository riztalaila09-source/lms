package handler

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	notificationv1 "lms/backend/gen/notification/v1"
	"lms/backend/gen/notification/v1/notificationv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ notificationv1connect.NotificationServiceHandler = (*NotificationHandler)(nil)

type NotificationHandler struct {
	svc *service.NotificationService
	notificationv1connect.UnimplementedNotificationServiceHandler
}

func NewNotificationHandler(svc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

func notificationToProto(n *repository.Notification) *notificationv1.Notification {
	out := &notificationv1.Notification{
		Id: n.ID, Type: n.Type, Title: n.Title, Body: n.Body, Link: n.Link, Read: n.Read,
	}
	if !n.CreatedAt.IsZero() {
		out.CreatedAt = timestamppb.New(n.CreatedAt)
	}
	return out
}

func (h *NotificationHandler) ListNotifications(ctx context.Context, req *connect.Request[notificationv1.ListNotificationsRequest]) (*connect.Response[notificationv1.ListNotificationsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	items, unread, err := h.svc.List(ctx, claims.UserID, int(req.Msg.Limit))
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	res := &notificationv1.ListNotificationsResponse{UnreadCount: int32(unread)}
	for _, n := range items {
		res.Items = append(res.Items, notificationToProto(n))
	}
	return connect.NewResponse(res), nil
}

func (h *NotificationHandler) MarkAllRead(ctx context.Context, _ *connect.Request[notificationv1.MarkAllReadRequest]) (*connect.Response[notificationv1.MarkAllReadResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.MarkAllRead(ctx, claims.UserID); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&notificationv1.MarkAllReadResponse{}), nil
}
