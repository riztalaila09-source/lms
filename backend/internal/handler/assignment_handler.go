package handler

import (
	"context"
	"errors"
	"math"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	assignmentv1 "lms/backend/gen/assignment/v1"
	"lms/backend/gen/assignment/v1/assignmentv1connect"
	commonv1 "lms/backend/gen/common/v1"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ assignmentv1connect.AssignmentServiceHandler = (*AssignmentHandler)(nil)

type AssignmentHandler struct {
	svc *service.AssignmentService
	assignmentv1connect.UnimplementedAssignmentServiceHandler
}

func NewAssignmentHandler(svc *service.AssignmentService) *AssignmentHandler {
	return &AssignmentHandler{svc: svc}
}

func (h *AssignmentHandler) CreateAssignment(ctx context.Context, req *connect.Request[assignmentv1.CreateAssignmentRequest]) (*connect.Response[assignmentv1.Assignment], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	in := service.CreateAssignmentInput{
		CourseID:    req.Msg.CourseId,
		Title:       req.Msg.Title,
		Description: req.Msg.Description,
		MaxScore:    int(req.Msg.MaxScore),
		Type:        req.Msg.Type,
	}
	if req.Msg.Deadline != nil {
		t := req.Msg.Deadline.AsTime()
		in.Deadline = &t
	}
	a, err := h.svc.CreateAssignment(ctx, claims.UserID, claims.Role, in)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(assignmentToProto(a)), nil
}

func (h *AssignmentHandler) GetAssignment(ctx context.Context, req *connect.Request[assignmentv1.GetAssignmentRequest]) (*connect.Response[assignmentv1.Assignment], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	a, err := h.svc.GetAssignment(ctx, claims.UserID, claims.Role, req.Msg.Id)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(assignmentToProto(a)), nil
}

func (h *AssignmentHandler) UpdateAssignment(ctx context.Context, req *connect.Request[assignmentv1.UpdateAssignmentRequest]) (*connect.Response[assignmentv1.Assignment], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	in := service.UpdateAssignmentInput{
		Title:       req.Msg.Title,
		Description: req.Msg.Description,
		IsActive:    req.Msg.IsActive,
	}
	if req.Msg.MaxScore != nil {
		ms := int(*req.Msg.MaxScore)
		in.MaxScore = &ms
	}
	if req.Msg.Deadline != nil {
		t := req.Msg.Deadline.AsTime()
		in.Deadline = &t
	}
	a, err := h.svc.UpdateAssignment(ctx, claims.UserID, claims.Role, req.Msg.Id, in)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(assignmentToProto(a)), nil
}

func (h *AssignmentHandler) DeleteAssignment(ctx context.Context, req *connect.Request[assignmentv1.DeleteAssignmentRequest]) (*connect.Response[assignmentv1.DeleteAssignmentResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.DeleteAssignment(ctx, claims.UserID, claims.Role, req.Msg.Id); err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(&assignmentv1.DeleteAssignmentResponse{}), nil
}

func (h *AssignmentHandler) ListAssignments(ctx context.Context, req *connect.Request[assignmentv1.ListAssignmentsRequest]) (*connect.Response[assignmentv1.ListAssignmentsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	page, pageSize := 1, 100
	if req.Msg.Pagination != nil {
		if req.Msg.Pagination.Page > 0 {
			page = int(req.Msg.Pagination.Page)
		}
		if req.Msg.Pagination.PageSize > 0 {
			pageSize = int(req.Msg.Pagination.PageSize)
		}
	}
	courseID := ""
	if req.Msg.CourseId != nil {
		courseID = *req.Msg.CourseId
	}
	list, total, err := h.svc.ListAssignments(ctx, claims.UserID, claims.Role, courseID, page, pageSize)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	out := make([]*assignmentv1.Assignment, 0, len(list))
	for _, a := range list {
		out = append(out, assignmentToProto(a))
	}
	totalPages := int32(math.Ceil(float64(total) / float64(pageSize)))
	return connect.NewResponse(&assignmentv1.ListAssignmentsResponse{
		Assignments: out,
		Pagination: &commonv1.PaginationResponse{
			Total: int32(total), Page: int32(page), PageSize: int32(pageSize), TotalPages: totalPages,
		},
	}), nil
}

func (h *AssignmentHandler) SubmitAssignment(ctx context.Context, req *connect.Request[assignmentv1.SubmitAssignmentRequest]) (*connect.Response[assignmentv1.Submission], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	sub, err := h.svc.SubmitAssignment(ctx, claims.UserID, claims.Role, req.Msg.AssignmentId, req.Msg.Content, req.Msg.FileUrl)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(submissionToProto(sub)), nil
}

func (h *AssignmentHandler) ListSubmissions(ctx context.Context, req *connect.Request[assignmentv1.ListSubmissionsRequest]) (*connect.Response[assignmentv1.ListSubmissionsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	subs, err := h.svc.ListSubmissions(ctx, claims.UserID, claims.Role, req.Msg.AssignmentId)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	out := make([]*assignmentv1.Submission, 0, len(subs))
	for _, s := range subs {
		out = append(out, submissionToProto(s))
	}
	return connect.NewResponse(&assignmentv1.ListSubmissionsResponse{Submissions: out}), nil
}

func (h *AssignmentHandler) GradeSubmission(ctx context.Context, req *connect.Request[assignmentv1.GradeSubmissionRequest]) (*connect.Response[assignmentv1.Submission], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	sub, err := h.svc.GradeSubmission(ctx, claims.UserID, claims.Role, req.Msg.SubmissionId, int(req.Msg.Score), req.Msg.Feedback)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(submissionToProto(sub)), nil
}

func (h *AssignmentHandler) ListGrades(ctx context.Context, req *connect.Request[assignmentv1.ListGradesRequest]) (*connect.Response[assignmentv1.ListGradesResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	courseID, kelas, search := "", "", ""
	if req.Msg.CourseId != nil {
		courseID = *req.Msg.CourseId
	}
	if req.Msg.Kelas != nil {
		kelas = *req.Msg.Kelas
	}
	if req.Msg.Search != nil {
		search = *req.Msg.Search
	}
	grid, err := h.svc.ListGrades(ctx, claims.UserID, claims.Role, courseID, kelas, search)
	if err != nil {
		return nil, mapAssignmentError(err)
	}

	columns := make([]*assignmentv1.GradeCell, 0, len(grid.Columns))
	for _, c := range grid.Columns {
		columns = append(columns, &assignmentv1.GradeCell{
			AssignmentId: c.AssignmentID, AssignmentTitle: c.AssignmentTitle, MaxScore: int32(c.MaxScore),
		})
	}
	rows := make([]*assignmentv1.GradeRow, 0, len(grid.Rows))
	for _, r := range grid.Rows {
		cells := make([]*assignmentv1.GradeCell, 0, len(grid.Columns))
		for _, c := range grid.Columns {
			score, has := r.Cells[c.AssignmentID]
			cells = append(cells, &assignmentv1.GradeCell{
				AssignmentId:    c.AssignmentID,
				AssignmentTitle: c.AssignmentTitle,
				HasScore:        has,
				Score:           int32(score),
				MaxScore:        int32(c.MaxScore),
			})
		}
		rows = append(rows, &assignmentv1.GradeRow{
			StudentId:   r.StudentID,
			StudentName: r.StudentName,
			Kelas:       r.Kelas,
			Jurusan:     r.Jurusan,
			Cells:       cells,
			Average:     r.Average,
		})
	}
	return connect.NewResponse(&assignmentv1.ListGradesResponse{Rows: rows, Columns: columns}), nil
}

func (h *AssignmentHandler) ListMyGrades(ctx context.Context, req *connect.Request[assignmentv1.ListMyGradesRequest]) (*connect.Response[assignmentv1.ListMyGradesResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	g, err := h.svc.ListMyGrades(ctx, claims.UserID)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	subjects := make([]*assignmentv1.SubjectGrade, 0, len(g.Subjects))
	for _, s := range g.Subjects {
		subjects = append(subjects, &assignmentv1.SubjectGrade{
			CourseId:        s.CourseID,
			CourseName:      s.CourseName,
			GradedCount:     int32(s.GradedCount),
			AssignmentCount: int32(s.AssignmentCount),
			Average:         s.Average,
			HasGrade:        s.HasGrade,
		})
	}
	return connect.NewResponse(&assignmentv1.ListMyGradesResponse{
		Subjects:       subjects,
		OverallAverage: g.OverallAverage,
		HasGrade:       g.HasGrade,
	}), nil
}

func (h *AssignmentHandler) BlockStudent(ctx context.Context, req *connect.Request[assignmentv1.BlockStudentRequest]) (*connect.Response[assignmentv1.BlockStudentResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.BlockStudent(ctx, claims.UserID, claims.Role, req.Msg.AssignmentId, req.Msg.StudentId); err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(&assignmentv1.BlockStudentResponse{}), nil
}

func (h *AssignmentHandler) UnblockStudent(ctx context.Context, req *connect.Request[assignmentv1.UnblockStudentRequest]) (*connect.Response[assignmentv1.UnblockStudentResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.svc.UnblockStudent(ctx, claims.UserID, claims.Role, req.Msg.AssignmentId, req.Msg.StudentId); err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(&assignmentv1.UnblockStudentResponse{}), nil
}

func (h *AssignmentHandler) ListBlockedStudents(ctx context.Context, req *connect.Request[assignmentv1.ListBlockedStudentsRequest]) (*connect.Response[assignmentv1.ListBlockedStudentsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	ids, err := h.svc.ListBlockedStudents(ctx, claims.Role, req.Msg.AssignmentId)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(&assignmentv1.ListBlockedStudentsResponse{StudentIds: ids}), nil
}

func (h *AssignmentHandler) SetAssignmentQuestions(ctx context.Context, req *connect.Request[assignmentv1.SetAssignmentQuestionsRequest]) (*connect.Response[assignmentv1.SetAssignmentQuestionsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	qs := make([]*repository.AssignmentQuestion, 0, len(req.Msg.Questions))
	for _, q := range req.Msg.Questions {
		qs = append(qs, &repository.AssignmentQuestion{
			Question: q.Question, Options: q.Options, CorrectIndex: int(q.CorrectIndex), Image: q.Image,
		})
	}
	if err := h.svc.SetAssignmentQuestions(ctx, claims.Role, req.Msg.AssignmentId, qs); err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(&assignmentv1.SetAssignmentQuestionsResponse{}), nil
}

func (h *AssignmentHandler) ListAssignmentQuestions(ctx context.Context, req *connect.Request[assignmentv1.ListAssignmentQuestionsRequest]) (*connect.Response[assignmentv1.ListAssignmentQuestionsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	qs, err := h.svc.ListAssignmentQuestions(ctx, claims.UserID, claims.Role, req.Msg.AssignmentId)
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	out := make([]*assignmentv1.AssignmentQuestion, 0, len(qs))
	for _, q := range qs {
		out = append(out, &assignmentv1.AssignmentQuestion{
			Id: q.ID, AssignmentId: q.AssignmentID, Question: q.Question,
			Options: q.Options, CorrectIndex: int32(q.CorrectIndex), OrderIndex: int32(q.OrderIndex), Image: q.Image,
		})
	}
	return connect.NewResponse(&assignmentv1.ListAssignmentQuestionsResponse{Questions: out}), nil
}

func (h *AssignmentHandler) SubmitQuiz(ctx context.Context, req *connect.Request[assignmentv1.SubmitQuizRequest]) (*connect.Response[assignmentv1.SubmitQuizResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	answers := make(map[string]int, len(req.Msg.Answers))
	for _, ans := range req.Msg.Answers {
		answers[ans.QuestionId] = int(ans.OptionIndex)
	}
	accepted, correct, total, score, err := h.svc.SubmitQuiz(ctx, claims.UserID, claims.Role, req.Msg.AssignmentId, answers, int(req.Msg.TimeTakenSeconds))
	if err != nil {
		return nil, mapAssignmentError(err)
	}
	return connect.NewResponse(&assignmentv1.SubmitQuizResponse{
		Accepted: accepted, Correct: int32(correct), Total: int32(total), Score: int32(score),
	}), nil
}

func assignmentToProto(a *repository.Assignment) *assignmentv1.Assignment {
	out := &assignmentv1.Assignment{
		Id:              a.ID,
		CourseId:        a.CourseID,
		CourseName:      a.CourseName,
		Title:           a.Title,
		Description:     a.Description,
		MaxScore:        int32(a.MaxScore),
		IsActive:        a.IsActive,
		CreatedById:     a.CreatedByID,
		SubmissionCount: int32(a.SubmissionCount),
		Submitted:       a.Submitted,
		Blocked:         a.Blocked,
		CreatedByName:   a.CreatedByName,
		Type:            a.Type,
		CreatedAt:       timestamppb.New(a.CreatedAt),
		UpdatedAt:       timestamppb.New(a.UpdatedAt),
	}
	if a.Deadline.Valid {
		out.Deadline = timestamppb.New(a.Deadline.Time)
	}
	return out
}

func submissionToProto(s *repository.Submission) *assignmentv1.Submission {
	out := &assignmentv1.Submission{
		Id:           s.ID,
		AssignmentId: s.AssignmentID,
		StudentId:    s.StudentID,
		StudentName:  s.StudentName,
		StudentKelas: s.StudentKelas,
		Content:      s.Content,
		FileUrl:      s.FileURL,
		Submitted:        s.Submitted,
		Feedback:         s.Feedback,
		TimeTakenSeconds: int32(s.TimeTakenSeconds),
	}
	if s.SubmittedAt.Valid {
		out.SubmittedAt = timestamppb.New(s.SubmittedAt.Time)
	}
	if s.Score.Valid {
		out.Graded = true
		out.Score = int32(s.Score.Int64)
	}
	if s.GradedAt.Valid {
		out.GradedAt = timestamppb.New(s.GradedAt.Time)
	}
	return out
}

func mapAssignmentError(err error) error {
	switch {
	case errors.Is(err, service.ErrAssignmentNotFound), errors.Is(err, service.ErrSubmissionNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
