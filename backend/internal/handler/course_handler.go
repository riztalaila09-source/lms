package handler

import (
	"context"
	"errors"
	"math"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	commonv1 "lms/backend/gen/common/v1"
	coursev1 "lms/backend/gen/course/v1"
	"lms/backend/gen/course/v1/coursev1connect"
	userv1 "lms/backend/gen/user/v1"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ coursev1connect.CourseServiceHandler = (*CourseHandler)(nil)

type CourseHandler struct {
	courseSvc *service.CourseService
	coursev1connect.UnimplementedCourseServiceHandler
}

func NewCourseHandler(courseSvc *service.CourseService) *CourseHandler {
	return &CourseHandler{courseSvc: courseSvc}
}

func (h *CourseHandler) CreateCourse(ctx context.Context, req *connect.Request[coursev1.CreateCourseRequest]) (*connect.Response[coursev1.Course], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	c, err := h.courseSvc.CreateCourse(ctx, claims.Role, req.Msg.Code, req.Msg.Name, req.Msg.Description, req.Msg.TeacherId, req.Msg.BackgroundImage, req.Msg.ClassIds)
	if err != nil {
		return nil, mapCourseServiceError(err)
	}
	return connect.NewResponse(courseToProto(c)), nil
}

func (h *CourseHandler) GetCourse(ctx context.Context, req *connect.Request[coursev1.GetCourseRequest]) (*connect.Response[coursev1.Course], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	c, err := h.courseSvc.GetCourse(ctx, claims.UserID, claims.Role, req.Msg.Id)
	if err != nil {
		return nil, mapCourseServiceError(err)
	}
	return connect.NewResponse(courseToProto(c)), nil
}

func (h *CourseHandler) UpdateCourse(ctx context.Context, req *connect.Request[coursev1.UpdateCourseRequest]) (*connect.Response[coursev1.Course], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	input := service.UpdateCourseInput{
		Code:            req.Msg.Code,
		Name:            req.Msg.Name,
		Description:     req.Msg.Description,
		TeacherID:       req.Msg.TeacherId,
		IsActive:        req.Msg.IsActive,
		BackgroundImage: req.Msg.BackgroundImage,
	}

	c, err := h.courseSvc.UpdateCourse(ctx, claims.Role, req.Msg.Id, input, req.Msg.ClassIds, true)
	if err != nil {
		return nil, mapCourseServiceError(err)
	}
	return connect.NewResponse(courseToProto(c)), nil
}

func (h *CourseHandler) DeleteCourse(ctx context.Context, req *connect.Request[coursev1.DeleteCourseRequest]) (*connect.Response[coursev1.DeleteCourseResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	if err := h.courseSvc.DeleteCourse(ctx, claims.Role, req.Msg.Id); err != nil {
		return nil, mapCourseServiceError(err)
	}
	return connect.NewResponse(&coursev1.DeleteCourseResponse{}), nil
}

func (h *CourseHandler) ListCourses(ctx context.Context, req *connect.Request[coursev1.ListCoursesRequest]) (*connect.Response[coursev1.ListCoursesResponse], error) {
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

	courses, total, err := h.courseSvc.ListCourses(ctx, claims.UserID, claims.Role, page, pageSize)
	if err != nil {
		return nil, mapCourseServiceError(err)
	}

	protoCourses := make([]*coursev1.Course, 0, len(courses))
	for _, c := range courses {
		protoCourses = append(protoCourses, courseToProto(c))
	}

	totalPages := int32(math.Ceil(float64(total) / float64(pageSize)))
	return connect.NewResponse(&coursev1.ListCoursesResponse{
		Courses: protoCourses,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(total),
			Page:       int32(page),
			PageSize:   int32(pageSize),
			TotalPages: totalPages,
		},
	}), nil
}

func (h *CourseHandler) EnrollStudents(ctx context.Context, req *connect.Request[coursev1.EnrollStudentsRequest]) (*connect.Response[coursev1.EnrollStudentsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	count, err := h.courseSvc.EnrollStudents(ctx, claims.Role, req.Msg.CourseId, req.Msg.StudentIds)
	if err != nil {
		return nil, mapCourseServiceError(err)
	}
	return connect.NewResponse(&coursev1.EnrollStudentsResponse{EnrolledCount: int32(count)}), nil
}

func (h *CourseHandler) UnenrollStudent(ctx context.Context, req *connect.Request[coursev1.UnenrollStudentRequest]) (*connect.Response[coursev1.UnenrollStudentResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	if err := h.courseSvc.UnenrollStudent(ctx, claims.Role, req.Msg.CourseId, req.Msg.StudentId); err != nil {
		return nil, mapCourseServiceError(err)
	}
	return connect.NewResponse(&coursev1.UnenrollStudentResponse{}), nil
}

func (h *CourseHandler) GetCourseStudents(ctx context.Context, req *connect.Request[coursev1.GetCourseStudentsRequest]) (*connect.Response[coursev1.GetCourseStudentsResponse], error) {
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

	enrollments, total, err := h.courseSvc.GetCourseStudents(ctx, claims.UserID, claims.Role, req.Msg.CourseId, page, pageSize)
	if err != nil {
		return nil, mapCourseServiceError(err)
	}

	protoEnrollments := make([]*coursev1.Enrollment, 0, len(enrollments))
	for _, e := range enrollments {
		protoEnrollments = append(protoEnrollments, enrollmentToProto(e))
	}

	totalPages := int32(math.Ceil(float64(total) / float64(pageSize)))
	return connect.NewResponse(&coursev1.GetCourseStudentsResponse{
		Enrollments: protoEnrollments,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(total),
			Page:       int32(page),
			PageSize:   int32(pageSize),
			TotalPages: totalPages,
		},
	}), nil
}

func courseToProto(c *repository.Course) *coursev1.Course {
	return &coursev1.Course{
		Id:           c.ID,
		Code:         c.Code,
		Name:         c.Name,
		Description:  c.Description,
		IsActive:     c.IsActive,
		StudentCount:    int32(c.StudentCount),
		Kelas:           c.Kelas,
		BackgroundImage: c.BackgroundImage,
		CreatedAt:       timestamppb.New(c.CreatedAt),
		UpdatedAt:       timestamppb.New(c.UpdatedAt),
		Teacher: &userv1.User{
			Id:       c.TeacherID,
			FullName: c.TeacherName,
			Email:    c.TeacherEmail,
		},
	}
}

func enrollmentToProto(e *repository.Enrollment) *coursev1.Enrollment {
	return &coursev1.Enrollment{
		Id:       e.ID,
		CourseId: e.CourseID,
		Student: &userv1.User{
			Id:       e.StudentID,
			FullName: e.StudentName,
			Email:    e.StudentEmail,
			Kelas:    e.StudentKelas,
			Jurusan:  e.StudentJurusan,
			IsActive: e.StudentIsActive,
		},
		EnrolledAt: timestamppb.New(e.EnrolledAt),
	}
}

func mapCourseServiceError(err error) error {
	switch {
	case errors.Is(err, service.ErrCourseNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrCourseDuplicate):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrAlreadyEnrolled):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, service.ErrNotEnrolled):
		return connect.NewError(connect.CodeNotFound, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
