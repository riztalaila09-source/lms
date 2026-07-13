package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	classroomv1 "lms/backend/gen/classroom/v1"
	"lms/backend/gen/classroom/v1/classroomv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

type ClassroomHandler struct {
	svc *service.ClassroomService
	classroomv1connect.UnimplementedClassroomServiceHandler
}

func NewClassroomHandler(svc *service.ClassroomService) *ClassroomHandler {
	return &ClassroomHandler{svc: svc}
}

func mapClassroomError(err error) error {
	switch {
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrClassroomInvalid):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, service.ErrClassroomNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func scheduleToProto(s *repository.Schedule) *classroomv1.ScheduleEntry {
	return &classroomv1.ScheduleEntry{
		Id: s.ID, CourseId: s.CourseID, DayOfWeek: int32(s.DayOfWeek),
		JamKeMulai: int32(s.JamKeMulai), JamKeAkhir: int32(s.JamKeAkhir), Kelas: s.Kelas, Ruang: s.Ruang,
	}
}

func lessonPlanToProto(p *repository.LessonPlan) *classroomv1.LessonPlan {
	return &classroomv1.LessonPlan{
		Id: p.ID, CourseId: p.CourseID, Tanggal: p.Tanggal, Title: p.Title,
		MaterialId: p.MaterialID, MaterialTitle: p.MaterialTitle, Note: p.Note,
	}
}

func leaderboardToProto(e *repository.LeaderboardEntry) *classroomv1.LeaderboardEntry {
	return &classroomv1.LeaderboardEntry{
		StudentId: e.StudentID, StudentName: e.StudentName, StudentKelas: e.StudentKelas,
		Points: int32(e.Points), EntryCount: int32(e.EntryCount),
	}
}

func classroomClaims(ctx context.Context) (string, string, error) {
	c, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return "", "", connect.NewError(connect.CodeUnauthenticated, nil)
	}
	return c.UserID, c.Role, nil
}

// ── Jadwal ──

func (h *ClassroomHandler) ListSchedules(ctx context.Context, req *connect.Request[classroomv1.ListSchedulesRequest]) (*connect.Response[classroomv1.ListSchedulesResponse], error) {
	if _, _, err := classroomClaims(ctx); err != nil {
		return nil, err
	}
	list, err := h.svc.ListSchedules(ctx, req.Msg.CourseId)
	if err != nil {
		return nil, mapClassroomError(err)
	}
	out := make([]*classroomv1.ScheduleEntry, 0, len(list))
	for _, s := range list {
		out = append(out, scheduleToProto(s))
	}
	return connect.NewResponse(&classroomv1.ListSchedulesResponse{Entries: out}), nil
}

func (h *ClassroomHandler) CreateSchedule(ctx context.Context, req *connect.Request[classroomv1.CreateScheduleRequest]) (*connect.Response[classroomv1.ScheduleEntry], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	s, err := h.svc.CreateSchedule(ctx, role, &repository.Schedule{
		CourseID: req.Msg.CourseId, DayOfWeek: int(req.Msg.DayOfWeek), JamKeMulai: int(req.Msg.JamKeMulai),
		JamKeAkhir: int(req.Msg.JamKeAkhir), Kelas: req.Msg.Kelas, Ruang: req.Msg.Ruang,
	})
	if err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(scheduleToProto(s)), nil
}

func (h *ClassroomHandler) UpdateSchedule(ctx context.Context, req *connect.Request[classroomv1.UpdateScheduleRequest]) (*connect.Response[classroomv1.ScheduleEntry], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	s, err := h.svc.UpdateSchedule(ctx, role, &repository.Schedule{
		ID: req.Msg.Id, DayOfWeek: int(req.Msg.DayOfWeek), JamKeMulai: int(req.Msg.JamKeMulai),
		JamKeAkhir: int(req.Msg.JamKeAkhir), Kelas: req.Msg.Kelas, Ruang: req.Msg.Ruang,
	})
	if err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(scheduleToProto(s)), nil
}

func (h *ClassroomHandler) DeleteSchedule(ctx context.Context, req *connect.Request[classroomv1.DeleteScheduleRequest]) (*connect.Response[classroomv1.DeleteScheduleResponse], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.DeleteSchedule(ctx, role, req.Msg.Id); err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(&classroomv1.DeleteScheduleResponse{}), nil
}

// ── Kalender ──

func (h *ClassroomHandler) ListLessonPlans(ctx context.Context, req *connect.Request[classroomv1.ListLessonPlansRequest]) (*connect.Response[classroomv1.ListLessonPlansResponse], error) {
	if _, _, err := classroomClaims(ctx); err != nil {
		return nil, err
	}
	list, err := h.svc.ListLessonPlans(ctx, req.Msg.CourseId)
	if err != nil {
		return nil, mapClassroomError(err)
	}
	out := make([]*classroomv1.LessonPlan, 0, len(list))
	for _, p := range list {
		out = append(out, lessonPlanToProto(p))
	}
	return connect.NewResponse(&classroomv1.ListLessonPlansResponse{Plans: out}), nil
}

func (h *ClassroomHandler) CreateLessonPlan(ctx context.Context, req *connect.Request[classroomv1.CreateLessonPlanRequest]) (*connect.Response[classroomv1.LessonPlan], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.svc.CreateLessonPlan(ctx, role, &repository.LessonPlan{
		CourseID: req.Msg.CourseId, Tanggal: req.Msg.Tanggal, Title: req.Msg.Title,
		MaterialID: req.Msg.MaterialId, Note: req.Msg.Note,
	})
	if err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(lessonPlanToProto(p)), nil
}

func (h *ClassroomHandler) UpdateLessonPlan(ctx context.Context, req *connect.Request[classroomv1.UpdateLessonPlanRequest]) (*connect.Response[classroomv1.LessonPlan], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.svc.UpdateLessonPlan(ctx, role, &repository.LessonPlan{
		ID: req.Msg.Id, Tanggal: req.Msg.Tanggal, Title: req.Msg.Title,
		MaterialID: req.Msg.MaterialId, Note: req.Msg.Note,
	})
	if err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(lessonPlanToProto(p)), nil
}

func (h *ClassroomHandler) DeleteLessonPlan(ctx context.Context, req *connect.Request[classroomv1.DeleteLessonPlanRequest]) (*connect.Response[classroomv1.DeleteLessonPlanResponse], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.DeleteLessonPlan(ctx, role, req.Msg.Id); err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(&classroomv1.DeleteLessonPlanResponse{}), nil
}

// ── Keaktifan (poin kumulatif) ──

func (h *ClassroomHandler) AddActivityPoint(ctx context.Context, req *connect.Request[classroomv1.AddActivityPointRequest]) (*connect.Response[classroomv1.AddActivityPointResponse], error) {
	_, role, err := classroomClaims(ctx)
	if err != nil {
		return nil, err
	}
	total, day, err := h.svc.AddActivityPoint(ctx, role, &repository.ActivityPoint{
		CourseID: req.Msg.CourseId, StudentID: req.Msg.StudentId, Tanggal: req.Msg.Tanggal, Points: int(req.Msg.Points),
	})
	if err != nil {
		return nil, mapClassroomError(err)
	}
	return connect.NewResponse(&classroomv1.AddActivityPointResponse{TotalPoints: int32(total), DayPoints: int32(day)}), nil
}

func (h *ClassroomHandler) ListLeaderboard(ctx context.Context, req *connect.Request[classroomv1.ListLeaderboardRequest]) (*connect.Response[classroomv1.ListLeaderboardResponse], error) {
	if _, _, err := classroomClaims(ctx); err != nil {
		return nil, err
	}
	list, err := h.svc.Leaderboard(ctx, req.Msg.CourseId, req.Msg.Tanggal)
	if err != nil {
		return nil, mapClassroomError(err)
	}
	out := make([]*classroomv1.LeaderboardEntry, 0, len(list))
	for _, e := range list {
		out = append(out, leaderboardToProto(e))
	}
	return connect.NewResponse(&classroomv1.ListLeaderboardResponse{Entries: out}), nil
}
