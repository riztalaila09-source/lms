package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	schoolv1 "lms/backend/gen/school/v1"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

func batchToProto(b *repository.PpdbBatch) *schoolv1.PpdbBatch {
	return &schoolv1.PpdbBatch{
		Id: b.ID, TahunAjaran: b.TahunAjaran, Gelombang: int32(b.Gelombang), Nama: b.Nama, IsActive: b.IsActive,
		Buka: b.Buka, Tutup: b.Tutup, HasBrosur: b.HasBrosur, DriveLink: b.DriveLink, Panduan: b.Panduan,
		RequiredDocs: b.RequiredDocs, Kuota: b.Kuota, TestActive: b.TestActive,
		TestDurationMinutes: int32(b.TestDurationMinutes), PendaftarCount: int32(b.PendaftarCount),
	}
}

func ppdbQuestionToProto(q *repository.PpdbQuestion, hideCorrect bool) *schoolv1.PpdbQuestion {
	ci := int32(q.CorrectIndex)
	if hideCorrect {
		ci = -1
	}
	return &schoolv1.PpdbQuestion{Id: q.ID, Question: q.Question, Options: q.Options, CorrectIndex: ci}
}

func schoolRole(ctx context.Context) (string, string, error) {
	c, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return "", "", connect.NewError(connect.CodeUnauthenticated, nil)
	}
	return c.Role, c.UserID, nil
}

// GetActivePpdbBatch is public (landing page). Empty id means none open.
func (h *SchoolHandler) GetActivePpdbBatch(ctx context.Context, _ *connect.Request[schoolv1.GetActivePpdbBatchRequest]) (*connect.Response[schoolv1.PpdbBatch], error) {
	b, err := h.svc.GetActivePpdbBatch(ctx)
	if err != nil {
		if errors.Is(err, repository.ErrPpdbNotFound) {
			return connect.NewResponse(&schoolv1.PpdbBatch{}), nil
		}
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(batchToProto(b)), nil
}

func (h *SchoolHandler) ListPpdbBatches(ctx context.Context, _ *connect.Request[schoolv1.ListPpdbBatchesRequest]) (*connect.Response[schoolv1.ListPpdbBatchesResponse], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	list, err := h.svc.ListPpdbBatches(ctx, role)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := &schoolv1.ListPpdbBatchesResponse{}
	for _, b := range list {
		out.Batches = append(out.Batches, batchToProto(b))
	}
	return connect.NewResponse(out), nil
}

func (h *SchoolHandler) CreatePpdbBatch(ctx context.Context, req *connect.Request[schoolv1.CreatePpdbBatchRequest]) (*connect.Response[schoolv1.PpdbBatch], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	b, err := h.svc.CreatePpdbBatch(ctx, role, req.Msg.TahunAjaran, int(req.Msg.Gelombang))
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(batchToProto(b)), nil
}

func (h *SchoolHandler) UpdatePpdbBatch(ctx context.Context, req *connect.Request[schoolv1.UpdatePpdbBatchRequest]) (*connect.Response[schoolv1.PpdbBatch], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	m := req.Msg
	in := service.PpdbBatchUpdate{
		ID: m.Id, Nama: m.Nama, Buka: m.Buka, Tutup: m.Tutup, Brosur: m.Brosur, DriveLink: m.DriveLink,
		Panduan: m.Panduan, RequiredDocs: m.RequiredDocs, Kuota: m.Kuota, TestActive: m.TestActive,
	}
	if m.TestDurationMinutes != nil {
		d := int(*m.TestDurationMinutes)
		in.TestDurationMinutes = &d
	}
	b, err := h.svc.UpdatePpdbBatch(ctx, role, in)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(batchToProto(b)), nil
}

func (h *SchoolHandler) SetActivePpdbBatch(ctx context.Context, req *connect.Request[schoolv1.SetActivePpdbBatchRequest]) (*connect.Response[schoolv1.PpdbBatch], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	b, err := h.svc.SetActivePpdbBatch(ctx, role, req.Msg.Id)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(batchToProto(b)), nil
}

func (h *SchoolHandler) DeletePpdbBatch(ctx context.Context, req *connect.Request[schoolv1.DeletePpdbBatchRequest]) (*connect.Response[schoolv1.DeletePpdbBatchResponse], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.DeletePpdbBatch(ctx, role, req.Msg.Id); err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.DeletePpdbBatchResponse{}), nil
}

func (h *SchoolHandler) ListPpdbQuestions(ctx context.Context, req *connect.Request[schoolv1.ListPpdbQuestionsRequest]) (*connect.Response[schoolv1.ListPpdbQuestionsResponse], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	qs, err := h.svc.ListPpdbQuestions(ctx, role, req.Msg.BatchId)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := &schoolv1.ListPpdbQuestionsResponse{}
	for _, q := range qs {
		out.Questions = append(out.Questions, ppdbQuestionToProto(q, false))
	}
	return connect.NewResponse(out), nil
}

func (h *SchoolHandler) SetPpdbQuestions(ctx context.Context, req *connect.Request[schoolv1.SetPpdbQuestionsRequest]) (*connect.Response[schoolv1.SetPpdbQuestionsResponse], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	qs := make([]*repository.PpdbQuestion, 0, len(req.Msg.Questions))
	for _, q := range req.Msg.Questions {
		qs = append(qs, &repository.PpdbQuestion{Question: q.Question, Options: q.Options, CorrectIndex: int(q.CorrectIndex)})
	}
	if err := h.svc.SetPpdbQuestions(ctx, role, req.Msg.BatchId, qs); err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.SetPpdbQuestionsResponse{}), nil
}

// PpdbLogin is public (applicant enters printed credentials to sit the exam).
func (h *SchoolHandler) PpdbLogin(ctx context.Context, req *connect.Request[schoolv1.PpdbLoginRequest]) (*connect.Response[schoolv1.PpdbLoginResponse], error) {
	res, err := h.svc.PpdbLogin(ctx, req.Msg.NoPendaftaran, req.Msg.Password)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := &schoolv1.PpdbLoginResponse{Token: res.Token, Nama: res.Reg.Nama, TestSubmitted: res.Reg.TestSubmitted}
	if res.Batch != nil {
		out.TestActive = res.Batch.TestActive
		out.DurationMinutes = int32(res.Batch.TestDurationMinutes)
	}
	return connect.NewResponse(out), nil
}

func (h *SchoolHandler) GetPpdbTest(ctx context.Context, _ *connect.Request[schoolv1.GetPpdbTestRequest]) (*connect.Response[schoolv1.GetPpdbTestResponse], error) {
	role, regID, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	qs, dur, submitted, err := h.svc.GetPpdbTest(ctx, role, regID)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := &schoolv1.GetPpdbTestResponse{DurationMinutes: int32(dur), Submitted: submitted}
	for _, q := range qs {
		out.Questions = append(out.Questions, ppdbQuestionToProto(q, true)) // hide correct answer
	}
	return connect.NewResponse(out), nil
}

func (h *SchoolHandler) SubmitPpdbTest(ctx context.Context, req *connect.Request[schoolv1.SubmitPpdbTestRequest]) (*connect.Response[schoolv1.SubmitPpdbTestResponse], error) {
	role, regID, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	answers := make(map[int]int, len(req.Msg.Answers))
	for _, a := range req.Msg.Answers {
		answers[int(a.QuestionIndex)] = int(a.OptionIndex)
	}
	score, correct, total, err := h.svc.SubmitPpdbTest(ctx, role, regID, answers)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.SubmitPpdbTestResponse{Score: int32(score), Correct: int32(correct), Total: int32(total)}), nil
}

// SubmitPpdbDocuments is public (applicant submits their doc link / uploads).
func (h *SchoolHandler) SubmitPpdbDocuments(ctx context.Context, req *connect.Request[schoolv1.SubmitPpdbDocumentsRequest]) (*connect.Response[schoolv1.SubmitPpdbDocumentsResponse], error) {
	files := make([]service.PpdbDocFile, 0, len(req.Msg.Files))
	for _, f := range req.Msg.Files {
		files = append(files, service.PpdbDocFile{Name: f.Name, Data: f.Data})
	}
	n, err := h.svc.SubmitPpdbDocuments(ctx, req.Msg.RegistrationId, req.Msg.DocLink, files)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	return connect.NewResponse(&schoolv1.SubmitPpdbDocumentsResponse{Uploaded: int32(n)}), nil
}

func (h *SchoolHandler) ListPpdbDocuments(ctx context.Context, req *connect.Request[schoolv1.ListPpdbDocumentsRequest]) (*connect.Response[schoolv1.ListPpdbDocumentsResponse], error) {
	role, _, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	docs, err := h.svc.ListPpdbDocuments(ctx, role, req.Msg.RegistrationId)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := &schoolv1.ListPpdbDocumentsResponse{}
	for _, d := range docs {
		out.Docs = append(out.Docs, &schoolv1.PpdbDoc{Id: d.ID, Name: d.Name})
	}
	return connect.NewResponse(out), nil
}

func (h *SchoolHandler) GetMyPpdb(ctx context.Context, _ *connect.Request[schoolv1.GetMyPpdbRequest]) (*connect.Response[schoolv1.PpdbRegistration], error) {
	role, regID, err := schoolRole(ctx)
	if err != nil {
		return nil, err
	}
	reg, err := h.svc.GetMyPpdb(ctx, role, regID)
	if err != nil {
		return nil, mapSchoolError(err)
	}
	out := ppdbToProto(reg)
	out.Password = "" // applicant sees their own status but not the raw password
	return connect.NewResponse(out), nil
}
