package handler

import (
	"context"
	"errors"
	"math"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	commonv1 "lms/backend/gen/common/v1"
	materialv1 "lms/backend/gen/material/v1"
	"lms/backend/gen/material/v1/materialv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ materialv1connect.MaterialServiceHandler = (*MaterialHandler)(nil)

type MaterialHandler struct {
	materialSvc    *service.MaterialService
	completionSvc  *service.CompletionService
	essaySvc       *service.EssayService
	materialv1connect.UnimplementedMaterialServiceHandler
}

func NewMaterialHandler(materialSvc *service.MaterialService, completionSvc *service.CompletionService, essaySvc *service.EssayService) *MaterialHandler {
	return &MaterialHandler{materialSvc: materialSvc, completionSvc: completionSvc, essaySvc: essaySvc}
}

func (h *MaterialHandler) CreateMaterial(ctx context.Context, req *connect.Request[materialv1.CreateMaterialRequest]) (*connect.Response[materialv1.Material], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	contentType := protoContentTypeToString(req.Msg.ContentType)
	m, err := h.materialSvc.CreateMaterial(ctx, claims.UserID, claims.Role,
		req.Msg.CourseId, req.Msg.Title, req.Msg.Description,
		contentType, req.Msg.ContentUrl, req.Msg.ContentText, int(req.Msg.OrderIndex), req.Msg.CategoryId, req.Msg.CoverImage)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(materialToProto(m)), nil
}

func (h *MaterialHandler) GetMaterial(ctx context.Context, req *connect.Request[materialv1.GetMaterialRequest]) (*connect.Response[materialv1.Material], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	m, err := h.materialSvc.GetMaterial(ctx, claims.UserID, claims.Role, req.Msg.Id)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(materialToProto(m)), nil
}

func (h *MaterialHandler) UpdateMaterial(ctx context.Context, req *connect.Request[materialv1.UpdateMaterialRequest]) (*connect.Response[materialv1.Material], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	input := service.UpdateMaterialInput{
		Title:       req.Msg.Title,
		Description: req.Msg.Description,
		ContentURL:  req.Msg.ContentUrl,
		ContentText: req.Msg.ContentText,
		IsPublished: req.Msg.IsPublished,
		CategoryID:  req.Msg.CategoryId,
		CoverImage:  req.Msg.CoverImage,
	}
	if req.Msg.ContentType != nil {
		ct := protoContentTypeToString(*req.Msg.ContentType)
		input.ContentType = &ct
	}
	if req.Msg.OrderIndex != nil {
		oi := int(*req.Msg.OrderIndex)
		input.OrderIndex = &oi
	}

	m, err := h.materialSvc.UpdateMaterial(ctx, claims.UserID, claims.Role, req.Msg.Id, input)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(materialToProto(m)), nil
}

func (h *MaterialHandler) DeleteMaterial(ctx context.Context, req *connect.Request[materialv1.DeleteMaterialRequest]) (*connect.Response[materialv1.DeleteMaterialResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	if err := h.materialSvc.DeleteMaterial(ctx, claims.UserID, claims.Role, req.Msg.Id); err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(&materialv1.DeleteMaterialResponse{}), nil
}

func (h *MaterialHandler) ListMaterials(ctx context.Context, req *connect.Request[materialv1.ListMaterialsRequest]) (*connect.Response[materialv1.ListMaterialsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	page, pageSize := 1, 50
	if req.Msg.Pagination != nil {
		if req.Msg.Pagination.Page > 0 {
			page = int(req.Msg.Pagination.Page)
		}
		if req.Msg.Pagination.PageSize > 0 {
			pageSize = int(req.Msg.Pagination.PageSize)
		}
	}

	materials, total, err := h.materialSvc.ListMaterials(ctx, claims.UserID, claims.Role, req.Msg.CourseId, page, pageSize)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}

	protoMaterials := make([]*materialv1.Material, 0, len(materials))
	for _, m := range materials {
		protoMaterials = append(protoMaterials, materialToProto(m))
	}

	totalPages := int32(math.Ceil(float64(total) / float64(pageSize)))
	return connect.NewResponse(&materialv1.ListMaterialsResponse{
		Materials: protoMaterials,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(total),
			Page:       int32(page),
			PageSize:   int32(pageSize),
			TotalPages: totalPages,
		},
	}), nil
}

func (h *MaterialHandler) SearchMaterials(ctx context.Context, req *connect.Request[materialv1.SearchMaterialsRequest]) (*connect.Response[materialv1.SearchMaterialsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	results, err := h.materialSvc.SearchMaterials(ctx, claims.UserID, claims.Role, req.Msg.Query)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	hits := make([]*materialv1.MaterialSearchHit, 0, len(results))
	for _, r := range results {
		hits = append(hits, &materialv1.MaterialSearchHit{
			Material:   materialToProto(r.Material),
			CourseId:   r.CourseID,
			CourseName: r.CourseName,
		})
	}
	return connect.NewResponse(&materialv1.SearchMaterialsResponse{Hits: hits}), nil
}

func (h *MaterialHandler) ExploreMaterials(ctx context.Context, _ *connect.Request[materialv1.ExploreMaterialsRequest]) (*connect.Response[materialv1.ExploreMaterialsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	mats, err := h.materialSvc.ExploreMaterials(ctx, claims.UserID, claims.Role)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	out := make([]*materialv1.Material, 0, len(mats))
	for _, m := range mats {
		out = append(out, materialToProto(m))
	}
	return connect.NewResponse(&materialv1.ExploreMaterialsResponse{Materials: out}), nil
}

func (h *MaterialHandler) RateMaterial(ctx context.Context, req *connect.Request[materialv1.RateMaterialRequest]) (*connect.Response[materialv1.RateMaterialResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	avg, count, my, err := h.materialSvc.RateMaterial(ctx, claims.UserID, claims.Role, req.Msg.MaterialId, int(req.Msg.Stars))
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(&materialv1.RateMaterialResponse{
		AvgRating:   avg,
		RatingCount: int32(count),
		MyRating:    int32(my),
	}), nil
}

func (h *MaterialHandler) CreateQuestion(ctx context.Context, req *connect.Request[materialv1.CreateQuestionRequest]) (*connect.Response[materialv1.Question], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	q, err := h.materialSvc.CreateQuestion(ctx, claims.UserID, claims.Role, req.Msg.MaterialId, req.Msg.Question, req.Msg.Options, int(req.Msg.CorrectIndex), req.Msg.Image)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(questionToProto(q)), nil
}

func (h *MaterialHandler) ListQuestions(ctx context.Context, req *connect.Request[materialv1.ListQuestionsRequest]) (*connect.Response[materialv1.ListQuestionsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	qs, err := h.materialSvc.ListQuestions(ctx, claims.UserID, claims.Role, req.Msg.MaterialId)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	out := make([]*materialv1.Question, 0, len(qs))
	for _, q := range qs {
		out = append(out, questionToProto(q))
	}
	return connect.NewResponse(&materialv1.ListQuestionsResponse{Questions: out}), nil
}

func (h *MaterialHandler) DeleteQuestion(ctx context.Context, req *connect.Request[materialv1.DeleteQuestionRequest]) (*connect.Response[materialv1.DeleteQuestionResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.materialSvc.DeleteQuestion(ctx, claims.UserID, claims.Role, req.Msg.Id); err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(&materialv1.DeleteQuestionResponse{}), nil
}

func (h *MaterialHandler) MarkComplete(ctx context.Context, req *connect.Request[materialv1.MarkCompleteRequest]) (*connect.Response[materialv1.MaterialCompletion], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	c, err := h.completionSvc.MarkComplete(ctx, claims.UserID, req.Msg.MaterialId, int(req.Msg.ReadPercent), req.Msg.QuizPassed)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(completionToProto(c)), nil
}

func (h *MaterialHandler) GetMyCompletion(ctx context.Context, req *connect.Request[materialv1.GetMyCompletionRequest]) (*connect.Response[materialv1.MaterialCompletion], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	c, err := h.completionSvc.GetMyCompletion(ctx, claims.UserID, req.Msg.MaterialId)
	if err != nil {
		if errors.Is(err, service.ErrCompletionNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, err)
		}
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(completionToProto(c)), nil
}

func (h *MaterialHandler) ListCompletions(ctx context.Context, req *connect.Request[materialv1.ListCompletionsRequest]) (*connect.Response[materialv1.ListCompletionsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	summaries, err := h.completionSvc.ListCompletions(ctx, claims.Role, req.Msg.CourseId)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	out := make([]*materialv1.StudentCompletionSummary, 0, len(summaries))
	for _, s := range summaries {
		out = append(out, &materialv1.StudentCompletionSummary{
			StudentId:      s.StudentID,
			StudentName:    s.StudentName,
			StudentKelas:   s.StudentKelas,
			CompletedCount: int32(s.CompletedCount),
			TotalMaterials: int32(s.TotalMaterials),
			Percent:        int32(s.Percent),
		})
	}
	return connect.NewResponse(&materialv1.ListCompletionsResponse{Students: out}), nil
}

func (h *MaterialHandler) ResetStudentProgress(ctx context.Context, req *connect.Request[materialv1.ResetStudentProgressRequest]) (*connect.Response[materialv1.ResetStudentProgressResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.completionSvc.ResetStudentProgress(ctx, claims.Role, req.Msg.CourseId, req.Msg.StudentId); err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(&materialv1.ResetStudentProgressResponse{}), nil
}

func (h *MaterialHandler) CreateEssayQuestion(ctx context.Context, req *connect.Request[materialv1.CreateEssayQuestionRequest]) (*connect.Response[materialv1.EssayQuestion], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	q, err := h.essaySvc.CreateQuestion(ctx, claims.Role, req.Msg.MaterialId, req.Msg.Question, int(req.Msg.OrderIndex))
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(essayQuestionToProto(q)), nil
}

func (h *MaterialHandler) ListEssayQuestions(ctx context.Context, req *connect.Request[materialv1.ListEssayQuestionsRequest]) (*connect.Response[materialv1.ListEssayQuestionsResponse], error) {
	_, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	qs, err := h.essaySvc.ListQuestions(ctx, req.Msg.MaterialId)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	out := make([]*materialv1.EssayQuestion, 0, len(qs))
	for _, q := range qs {
		out = append(out, essayQuestionToProto(q))
	}
	return connect.NewResponse(&materialv1.ListEssayQuestionsResponse{Questions: out}), nil
}

func (h *MaterialHandler) DeleteEssayQuestion(ctx context.Context, req *connect.Request[materialv1.DeleteEssayQuestionRequest]) (*connect.Response[materialv1.DeleteEssayQuestionResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.essaySvc.DeleteQuestion(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(&materialv1.DeleteEssayQuestionResponse{}), nil
}

func (h *MaterialHandler) AddEssayComment(ctx context.Context, req *connect.Request[materialv1.AddEssayCommentRequest]) (*connect.Response[materialv1.EssayComment], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	c, err := h.essaySvc.AddComment(ctx, claims.UserID, claims.Role, req.Msg.EssayQuestionId, req.Msg.Content)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(essayCommentToProto(c)), nil
}

func (h *MaterialHandler) ListEssayComments(ctx context.Context, req *connect.Request[materialv1.ListEssayCommentsRequest]) (*connect.Response[materialv1.ListEssayCommentsResponse], error) {
	_, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	cs, err := h.essaySvc.ListComments(ctx, req.Msg.EssayQuestionId)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	out := make([]*materialv1.EssayComment, 0, len(cs))
	for _, c := range cs {
		out = append(out, essayCommentToProto(c))
	}
	return connect.NewResponse(&materialv1.ListEssayCommentsResponse{Comments: out}), nil
}

func essayQuestionToProto(q *repository.EssayQuestion) *materialv1.EssayQuestion {
	return &materialv1.EssayQuestion{
		Id:         q.ID,
		MaterialId: q.MaterialID,
		Question:   q.Question,
		OrderIndex: int32(q.OrderIndex),
	}
}

func essayCommentToProto(c *repository.EssayComment) *materialv1.EssayComment {
	return &materialv1.EssayComment{
		Id:              c.ID,
		EssayQuestionId: c.EssayQuestionID,
		AuthorId:        c.AuthorID,
		AuthorName:      c.AuthorName,
		AuthorRole:      c.AuthorRole,
		Content:         c.Content,
		CreatedAt:       timestamppb.New(c.CreatedAt),
	}
}

func completionToProto(c *repository.Completion) *materialv1.MaterialCompletion {
	return &materialv1.MaterialCompletion{
		Id:           c.ID,
		MaterialId:   c.MaterialID,
		StudentId:    c.StudentID,
		StudentName:  c.StudentName,
		StudentKelas: c.StudentKelas,
		ReadPercent:  int32(c.ReadPercent),
		QuizPassed:   c.QuizPassed,
		CompletedAt:  timestamppb.New(c.CompletedAt),
	}
}

func questionToProto(q *repository.Question) *materialv1.Question {
	return &materialv1.Question{
		Id:           q.ID,
		MaterialId:   q.MaterialID,
		Question:     q.Question,
		Options:      q.Options,
		CorrectIndex: int32(q.CorrectIndex),
		OrderIndex:   int32(q.OrderIndex),
		Image:        q.Image,
	}
}

func (h *MaterialHandler) CreateCategory(ctx context.Context, req *connect.Request[materialv1.CreateCategoryRequest]) (*connect.Response[materialv1.Category], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	c, err := h.materialSvc.CreateCategory(ctx, claims.Role, req.Msg.Code, req.Msg.Name)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(categoryToProto(c)), nil
}

func (h *MaterialHandler) ListCategories(ctx context.Context, req *connect.Request[materialv1.ListCategoriesRequest]) (*connect.Response[materialv1.ListCategoriesResponse], error) {
	if _, ok := middleware.ClaimsFromContext(ctx); !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	cats, err := h.materialSvc.ListCategories(ctx)
	if err != nil {
		return nil, mapMaterialServiceError(err)
	}
	out := make([]*materialv1.Category, 0, len(cats))
	for _, c := range cats {
		out = append(out, categoryToProto(c))
	}
	return connect.NewResponse(&materialv1.ListCategoriesResponse{Categories: out}), nil
}

func (h *MaterialHandler) DeleteCategory(ctx context.Context, req *connect.Request[materialv1.DeleteCategoryRequest]) (*connect.Response[materialv1.DeleteCategoryResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.materialSvc.DeleteCategory(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapMaterialServiceError(err)
	}
	return connect.NewResponse(&materialv1.DeleteCategoryResponse{}), nil
}

func materialToProto(m *repository.Material) *materialv1.Material {
	return &materialv1.Material{
		Id:          m.ID,
		CourseId:    m.CourseID,
		Title:       m.Title,
		Description: m.Description,
		ContentType: stringToProtoContentType(m.ContentType),
		ContentUrl:  m.ContentURL,
		ContentText: m.ContentText,
		OrderIndex:  int32(m.OrderIndex),
		IsPublished: m.IsPublished,
		CreatedById: m.CreatedByID,
		CreatedAt:   timestamppb.New(m.CreatedAt),
		UpdatedAt:   timestamppb.New(m.UpdatedAt),
		CategoryId:    m.CategoryID,
		CategoryCode:  m.CategoryCode,
		CategoryName:  m.CategoryName,
		CreatedByName: m.CreatedByName,
		UpdatedById:   m.UpdatedByID,
		UpdatedByName: m.UpdatedByName,
		CoverImage:    m.CoverImage,
		AvgRating:     m.AvgRating,
		RatingCount:   int32(m.RatingCount),
	}
}

func categoryToProto(c *repository.Category) *materialv1.Category {
	return &materialv1.Category{Id: c.ID, Code: c.Code, Name: c.Name}
}

func stringToProtoContentType(ct string) materialv1.ContentType {
	switch ct {
	case "link":
		return materialv1.ContentType_CONTENT_TYPE_LINK
	case "document":
		return materialv1.ContentType_CONTENT_TYPE_DOCUMENT
	case "video":
		return materialv1.ContentType_CONTENT_TYPE_VIDEO
	case "text":
		return materialv1.ContentType_CONTENT_TYPE_TEXT
	}
	return materialv1.ContentType_CONTENT_TYPE_UNSPECIFIED
}

func protoContentTypeToString(ct materialv1.ContentType) string {
	switch ct {
	case materialv1.ContentType_CONTENT_TYPE_LINK:
		return "link"
	case materialv1.ContentType_CONTENT_TYPE_DOCUMENT:
		return "document"
	case materialv1.ContentType_CONTENT_TYPE_VIDEO:
		return "video"
	case materialv1.ContentType_CONTENT_TYPE_TEXT:
		return "text"
	}
	return "link"
}

func mapMaterialServiceError(err error) error {
	switch {
	case errors.Is(err, service.ErrMaterialNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
