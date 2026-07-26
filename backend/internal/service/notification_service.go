package service

import (
	"context"

	"lms/backend/internal/repository"
)

type NotificationService struct {
	repo repository.NotificationRepository
}

func NewNotificationService(repo repository.NotificationRepository) *NotificationService {
	return &NotificationService{repo: repo}
}

// List returns the caller's notifications (own + broadcast) plus the unread count.
func (s *NotificationService) List(ctx context.Context, userID string, limit int) ([]*repository.Notification, int, error) {
	items, err := s.repo.ListForUser(ctx, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	unread, err := s.repo.UnreadCount(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	return items, unread, nil
}

// MarkAllRead advances the caller's last-seen marker so everything current reads as read.
func (s *NotificationService) MarkAllRead(ctx context.Context, userID string) error {
	return s.repo.MarkSeen(ctx, userID)
}

// Notifier is the cross-service hook for emitting notifications. Emitting
// services hold an optional Notifier (nil = no-op) so their constructors don't
// change and their existing tests keep passing. Calls are best-effort: a failure
// to notify must never fail the primary action.
type Notifier interface {
	NotifyUsers(ctx context.Context, userIDs []string, typ, title, body, link string)
	Broadcast(ctx context.Context, typ, title, body, link string)
}

// repoNotifier is the concrete Notifier backed by the notification repository.
type repoNotifier struct {
	repo repository.NotificationRepository
}

// NewNotifier builds a Notifier that persists notifications via the repo.
func NewNotifier(repo repository.NotificationRepository) Notifier {
	return &repoNotifier{repo: repo}
}

func (n *repoNotifier) NotifyUsers(ctx context.Context, userIDs []string, typ, title, body, link string) {
	if len(userIDs) == 0 {
		return
	}
	_ = n.repo.Add(ctx, userIDs, typ, title, body, link) // best-effort
}

func (n *repoNotifier) Broadcast(ctx context.Context, typ, title, body, link string) {
	_ = n.repo.Add(ctx, nil, typ, title, body, link) // best-effort
}
