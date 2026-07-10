package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	attendancev1 "lms/backend/gen/attendance/v1"
	"lms/backend/gen/attendance/v1/attendancev1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ attendancev1connect.AttendanceServiceHandler = (*AttendanceHandler)(nil)

type AttendanceHandler struct {
	svc *service.AttendanceService
	attendancev1connect.UnimplementedAttendanceServiceHandler
}

func NewAttendanceHandler(svc *service.AttendanceService) *AttendanceHandler {
	return &AttendanceHandler{svc: svc}
}

func attendanceError(err error) error {
	switch {
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrInvalidArgument):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, service.ErrTokenInvalid):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, service.ErrTokenExpired):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, service.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func sessionToProto(s *repository.AttendanceSession) *attendancev1.Session {
	out := &attendancev1.Session{
		Id: s.ID, CourseId: s.CourseID, Mapel: s.Mapel, Kelas: s.Kelas, Ruang: s.Ruang, Tanggal: s.Tanggal,
		JamKe: int32(s.JamKe), JamKeAkhir: int32(s.JamKeAkhir), StartTime: s.StartTime, EndTime: s.EndTime,
		CreatedByName: s.CreatedByName, HadirCount: int32(s.HadirCount),
	}
	if !s.CreatedAt.IsZero() {
		out.CreatedAt = timestamppb.New(s.CreatedAt)
	}
	return out
}

func recordToProto(r *repository.AttendanceRecord) *attendancev1.Record {
	out := &attendancev1.Record{
		StudentId: r.StudentID, StudentName: r.StudentName, StudentKelas: r.StudentKelas,
		Status: r.Status, Note: r.Note,
	}
	if !r.MarkedAt.IsZero() {
		out.MarkedAt = timestamppb.New(r.MarkedAt)
	}
	return out
}

func tokenToProto(t *service.TokenInfo) *attendancev1.TokenInfo {
	return &attendancev1.TokenInfo{Token: t.Token, Code: t.Code, ExpiresInSeconds: int32(t.ExpiresInSeconds)}
}

func claims(ctx context.Context) (*service.Claims, error) {
	c, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	return c, nil
}

func (h *AttendanceHandler) CreateSession(ctx context.Context, req *connect.Request[attendancev1.CreateSessionRequest]) (*connect.Response[attendancev1.CreateSessionResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	m := req.Msg
	sess, tok, err := h.svc.CreateSession(ctx, c.UserID, c.Role, service.CreateSessionInput{
		CourseID: m.CourseId, Mapel: m.Mapel, Kelas: m.Kelas, Ruang: m.Ruang, Tanggal: m.Tanggal,
		JamKe: int(m.JamKe), JamKeAkhir: int(m.JamKeAkhir), StartTime: m.StartTime, EndTime: m.EndTime,
	})
	if err != nil {
		return nil, attendanceError(err)
	}
	return connect.NewResponse(&attendancev1.CreateSessionResponse{
		Session: sessionToProto(sess), Token: tokenToProto(tok),
	}), nil
}

func (h *AttendanceHandler) RegenerateToken(ctx context.Context, req *connect.Request[attendancev1.RegenerateTokenRequest]) (*connect.Response[attendancev1.RegenerateTokenResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	tok, err := h.svc.RegenerateToken(ctx, c.UserID, c.Role, req.Msg.SessionId)
	if err != nil {
		return nil, attendanceError(err)
	}
	return connect.NewResponse(&attendancev1.RegenerateTokenResponse{Token: tokenToProto(tok)}), nil
}

func (h *AttendanceHandler) ListSessions(ctx context.Context, req *connect.Request[attendancev1.ListSessionsRequest]) (*connect.Response[attendancev1.ListSessionsResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	sessions, err := h.svc.ListSessions(ctx, c.UserID, c.Role, req.Msg.Tanggal)
	if err != nil {
		return nil, attendanceError(err)
	}
	out := &attendancev1.ListSessionsResponse{}
	for _, s := range sessions {
		out.Sessions = append(out.Sessions, sessionToProto(s))
	}
	return connect.NewResponse(out), nil
}

func (h *AttendanceHandler) GetSessionRecords(ctx context.Context, req *connect.Request[attendancev1.GetSessionRecordsRequest]) (*connect.Response[attendancev1.GetSessionRecordsResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	sess, recs, err := h.svc.GetSessionRecords(ctx, c.UserID, c.Role, req.Msg.SessionId)
	if err != nil {
		return nil, attendanceError(err)
	}
	out := &attendancev1.GetSessionRecordsResponse{Session: sessionToProto(sess)}
	for _, r := range recs {
		out.Records = append(out.Records, recordToProto(r))
	}
	return connect.NewResponse(out), nil
}

func (h *AttendanceHandler) SetRecordStatus(ctx context.Context, req *connect.Request[attendancev1.SetRecordStatusRequest]) (*connect.Response[attendancev1.SetRecordStatusResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	m := req.Msg
	rec, err := h.svc.SetRecordStatus(ctx, c.UserID, c.Role, m.SessionId, m.StudentId, m.Status, m.Note)
	if err != nil {
		return nil, attendanceError(err)
	}
	return connect.NewResponse(&attendancev1.SetRecordStatusResponse{Record: recordToProto(rec)}), nil
}

func (h *AttendanceHandler) DeleteSession(ctx context.Context, req *connect.Request[attendancev1.DeleteSessionRequest]) (*connect.Response[attendancev1.DeleteSessionResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.DeleteSession(ctx, c.UserID, c.Role, req.Msg.SessionId); err != nil {
		return nil, attendanceError(err)
	}
	return connect.NewResponse(&attendancev1.DeleteSessionResponse{}), nil
}

func (h *AttendanceHandler) ExportAttendance(ctx context.Context, req *connect.Request[attendancev1.ExportAttendanceRequest]) (*connect.Response[attendancev1.ExportAttendanceResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	m := req.Msg
	rows, err := h.svc.ExportAttendance(ctx, c.Role, m.Start, m.End, m.Kelas, m.Jurusan)
	if err != nil {
		return nil, attendanceError(err)
	}
	out := &attendancev1.ExportAttendanceResponse{}
	for _, e := range rows {
		out.Rows = append(out.Rows, &attendancev1.ExportRow{
			StudentName: e.StudentName, Kelas: e.Kelas, Jurusan: e.Jurusan,
			Hadir: int32(e.Hadir), Telat: int32(e.Telat), Sakit: int32(e.Sakit), Izin: int32(e.Izin), Alpa: int32(e.Alpa), Total: int32(e.Total),
		})
	}
	return connect.NewResponse(out), nil
}

func (h *AttendanceHandler) DayGrid(ctx context.Context, req *connect.Request[attendancev1.DayGridRequest]) (*connect.Response[attendancev1.DayGridResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	res, err := h.svc.DayGrid(ctx, c.Role, req.Msg.Tanggal, req.Msg.Kelas)
	if err != nil {
		return nil, attendanceError(err)
	}
	out := &attendancev1.DayGridResponse{}
	for _, s := range res.Sessions {
		out.Sessions = append(out.Sessions, &attendancev1.DaySession{
			Id: s.ID, Mapel: s.Mapel, JamKe: int32(s.JamKe), JamKeAkhir: int32(s.JamKeAkhir),
			StartTime: s.StartTime, EndTime: s.EndTime, Ruang: s.Ruang,
		})
	}
	for _, st := range res.Students {
		out.Students = append(out.Students, &attendancev1.DayStudent{Id: st.ID, Name: st.Name})
	}
	for _, cell := range res.Cells {
		out.Cells = append(out.Cells, &attendancev1.DayCell{SessionId: cell.SessionID, StudentId: cell.StudentID, Status: cell.Status})
	}
	return connect.NewResponse(out), nil
}

func (h *AttendanceHandler) Scan(ctx context.Context, req *connect.Request[attendancev1.ScanRequest]) (*connect.Response[attendancev1.ScanResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	sess, already, err := h.svc.Scan(ctx, c.UserID, c.Role, req.Msg.Token, req.Msg.Code)
	if err != nil {
		return nil, attendanceError(err)
	}
	return connect.NewResponse(&attendancev1.ScanResponse{
		Session: sessionToProto(sess), Status: "hadir", Already: already,
	}), nil
}

func (h *AttendanceHandler) MyToday(ctx context.Context, req *connect.Request[attendancev1.MyTodayRequest]) (*connect.Response[attendancev1.MyTodayResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	res, err := h.svc.MyToday(ctx, c.UserID, c.Role, req.Msg.Tanggal)
	if err != nil {
		return nil, attendanceError(err)
	}
	out := &attendancev1.MyTodayResponse{
		Tanggal: res.Tanggal, Hadir: int32(res.Hadir), Telat: int32(res.Telat), Sakit: int32(res.Sakit),
		Izin: int32(res.Izin), Alpa: int32(res.Alpa),
	}
	for _, e := range res.Entries {
		out.Entries = append(out.Entries, &attendancev1.TodayEntry{
			SessionId: e.SessionID, Mapel: e.Mapel, Kelas: e.Kelas, Ruang: e.Ruang, JamKe: int32(e.JamKe), JamKeAkhir: int32(e.JamKeAkhir),
			StartTime: e.StartTime, EndTime: e.EndTime, Status: e.Status,
		})
	}
	return connect.NewResponse(out), nil
}
