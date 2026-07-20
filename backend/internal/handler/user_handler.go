package handler

import (
	"context"
	"errors"
	"math"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	commonv1 "lms/backend/gen/common/v1"
	userv1 "lms/backend/gen/user/v1"
	"lms/backend/gen/user/v1/userv1connect"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

// Ensure UserHandler implements the generated interface at compile time.
var _ userv1connect.UserServiceHandler = (*UserHandler)(nil)

type UserHandler struct {
	userSvc   *service.UserService
	courseSvc *service.CourseService
	userv1connect.UnimplementedUserServiceHandler
}

func NewUserHandler(userSvc *service.UserService, courseSvc *service.CourseService) *UserHandler {
	return &UserHandler{userSvc: userSvc, courseSvc: courseSvc}
}

func (h *UserHandler) Login(
	ctx context.Context,
	req *connect.Request[userv1.LoginRequest],
) (*connect.Response[userv1.LoginResponse], error) {
	result, err := h.userSvc.Login(ctx, req.Msg.Email, req.Msg.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return nil, connect.NewError(connect.CodeUnauthenticated, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&userv1.LoginResponse{
		Token: result.Token,
		User:  domainToProto(result.User),
	}), nil
}

func (h *UserHandler) CreateUser(
	ctx context.Context,
	req *connect.Request[userv1.CreateUserRequest],
) (*connect.Response[userv1.User], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	role := protoRoleToString(req.Msg.Role)
	u, err := h.userSvc.CreateUser(ctx, claims.Role, claims.Permissions, req.Msg.Username, req.Msg.Email, req.Msg.Password, req.Msg.FullName, role, req.Msg.Kelas, req.Msg.Jurusan, req.Msg.Mapel, req.Msg.Gender, req.Msg.Phone, req.Msg.Permissions)
	if err != nil {
		return nil, mapServiceError(err)
	}

	// Auto-enroll new student in courses whose kelas matches
	if role == "student" && req.Msg.Kelas != "" {
		h.courseSvc.AutoEnrollStudentByKelas(ctx, u.ID, req.Msg.Kelas)
	}

	return connect.NewResponse(domainToProto(u)), nil
}

func (h *UserHandler) GetUser(
	ctx context.Context,
	req *connect.Request[userv1.GetUserRequest],
) (*connect.Response[userv1.User], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	u, err := h.userSvc.GetUser(ctx, claims.UserID, claims.Role, req.Msg.Id)
	if err != nil {
		return nil, mapServiceError(err)
	}

	return connect.NewResponse(domainToProto(u)), nil
}

func (h *UserHandler) UpdateUser(
	ctx context.Context,
	req *connect.Request[userv1.UpdateUserRequest],
) (*connect.Response[userv1.User], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	input := service.UpdateUserInput{}
	if req.Msg.FullName != nil {
		input.FullName = req.Msg.FullName
	}
	if req.Msg.Email != nil {
		input.Email = req.Msg.Email
	}
	if req.Msg.Role != nil {
		roleStr := protoRoleToString(*req.Msg.Role)
		input.Role = &roleStr
	}
	if req.Msg.IsActive != nil {
		input.IsActive = req.Msg.IsActive
	}
	if req.Msg.Username != nil {
		input.Username = req.Msg.Username
	}
	if req.Msg.Kelas != nil {
		input.Kelas = req.Msg.Kelas
	}
	if req.Msg.Jurusan != nil {
		input.Jurusan = req.Msg.Jurusan
	}
	if req.Msg.Password != nil {
		input.Password = req.Msg.Password
	}
	if req.Msg.Mapel != nil {
		input.Mapel = req.Msg.Mapel
	}
	if req.Msg.Gender != nil {
		input.Gender = req.Msg.Gender
	}
	if req.Msg.Phone != nil {
		input.Phone = req.Msg.Phone
	}
	// Access rights are only touched when the caller explicitly submits them.
	if req.Msg.SetPermissions {
		perms := req.Msg.Permissions
		input.Permissions = &perms
	}

	u, err := h.userSvc.UpdateUser(ctx, claims.Role, claims.Permissions, req.Msg.Id, input)
	if err != nil {
		return nil, mapServiceError(err)
	}

	// When a student's class changes, re-sync their course/assignment access.
	if u.Role == "student" && req.Msg.Kelas != nil {
		h.courseSvc.SyncStudentEnrollments(ctx, u.ID, u.Kelas)
	}

	return connect.NewResponse(domainToProto(u)), nil
}

func (h *UserHandler) UpdateProfile(
	ctx context.Context,
	req *connect.Request[userv1.UpdateProfileRequest],
) (*connect.Response[userv1.User], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	input := service.UpdateProfileInput{
		FullName: req.Msg.FullName,
		Username: req.Msg.Username,
		Email:    req.Msg.Email,
		PhotoURL: req.Msg.PhotoUrl,
		Story:    req.Msg.Story,
		Phone:    req.Msg.Phone,
		Gender:   req.Msg.Gender,
	}
	u, err := h.userSvc.UpdateProfile(ctx, claims.UserID, input)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return connect.NewResponse(domainToProto(u)), nil
}

func (h *UserHandler) ListStories(
	ctx context.Context,
	req *connect.Request[userv1.ListStoriesRequest],
) (*connect.Response[userv1.ListStoriesResponse], error) {
	if _, ok := middleware.ClaimsFromContext(ctx); !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	stories, err := h.userSvc.ListStories(ctx)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := make([]*userv1.StoryEntry, 0, len(stories))
	for _, s := range stories {
		out = append(out, &userv1.StoryEntry{
			UserId:   s.UserID,
			FullName: s.FullName,
			Role:     s.Role,
			Kelas:    s.Kelas,
			Jurusan:  s.Jurusan,
			PhotoUrl: s.PhotoURL,
			Story:    s.Story,
		})
	}
	return connect.NewResponse(&userv1.ListStoriesResponse{Stories: out}), nil
}

func (h *UserHandler) ListActivityLogs(
	ctx context.Context,
	req *connect.Request[userv1.ListActivityLogsRequest],
) (*connect.Response[userv1.ListActivityLogsResponse], error) {
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
	userID := ""
	if req.Msg.UserId != nil {
		userID = *req.Msg.UserId
	}
	entries, total, err := h.userSvc.ListActivityLogs(ctx, claims.Role, claims.Permissions, userID, page, pageSize)
	if err != nil {
		return nil, mapServiceError(err)
	}
	protoEntries := make([]*userv1.ActivityLogEntry, 0, len(entries))
	for _, e := range entries {
		protoEntries = append(protoEntries, &userv1.ActivityLogEntry{
			UserId:     e.UserID,
			FullName:   e.FullName,
			Username:   e.Username,
			Role:       e.Role,
			Kelas:      e.Kelas,
			LoginCount: int32(e.LoginCount),
			LastLogin:  timestamppb.New(e.LastLogin),
			FirstLogin: timestamppb.New(e.FirstLogin),
		})
	}
	totalPages := int32(math.Ceil(float64(total) / float64(pageSize)))
	return connect.NewResponse(&userv1.ListActivityLogsResponse{
		Entries: protoEntries,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(total),
			Page:       int32(page),
			PageSize:   int32(pageSize),
			TotalPages: totalPages,
		},
	}), nil
}

func (h *UserHandler) ResetActivityLogs(
	ctx context.Context,
	_ *connect.Request[userv1.ResetActivityLogsRequest],
) (*connect.Response[userv1.ResetActivityLogsResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	if err := h.userSvc.ResetActivityLogs(ctx, claims.Role, claims.Permissions); err != nil {
		return nil, mapServiceError(err)
	}
	return connect.NewResponse(&userv1.ResetActivityLogsResponse{}), nil
}

func (h *UserHandler) DeleteUser(
	ctx context.Context,
	req *connect.Request[userv1.DeleteUserRequest],
) (*connect.Response[userv1.DeleteUserResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	if err := h.userSvc.DeleteUser(ctx, claims.Role, claims.Permissions, req.Msg.Id); err != nil {
		return nil, mapServiceError(err)
	}

	return connect.NewResponse(&userv1.DeleteUserResponse{}), nil
}

func (h *UserHandler) MutateClass(
	ctx context.Context,
	req *connect.Request[userv1.MutateClassRequest],
) (*connect.Response[userv1.MutateClassResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}
	fromKelas := ""
	if req.Msg.FromKelas != nil {
		fromKelas = *req.Msg.FromKelas
	}
	moved, err := h.userSvc.MutateClass(ctx, claims.Role, claims.Permissions, req.Msg.ToKelas, fromKelas, req.Msg.StudentIds)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return connect.NewResponse(&userv1.MutateClassResponse{Moved: int32(moved)}), nil
}

func (h *UserHandler) ListUsers(
	ctx context.Context,
	req *connect.Request[userv1.ListUsersRequest],
) (*connect.Response[userv1.ListUsersResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	f := repository.ListFilter{Page: 1, PageSize: 20}
	if req.Msg.Pagination != nil {
		if req.Msg.Pagination.Page > 0 {
			f.Page = int(req.Msg.Pagination.Page)
		}
		if req.Msg.Pagination.PageSize > 0 {
			f.PageSize = int(req.Msg.Pagination.PageSize)
		}
	}
	if req.Msg.RoleFilter != nil {
		f.RoleFilter = protoRoleToString(*req.Msg.RoleFilter)
	}
	if req.Msg.Kelas != nil {
		f.Kelas = *req.Msg.Kelas
	}
	if req.Msg.Jurusan != nil {
		f.Jurusan = *req.Msg.Jurusan
	}
	if req.Msg.Search != nil {
		f.Search = *req.Msg.Search
	}

	users, total, err := h.userSvc.ListUsers(ctx, claims.Role, f)
	if err != nil {
		return nil, mapServiceError(err)
	}

	protoUsers := make([]*userv1.User, 0, len(users))
	for _, u := range users {
		p := domainToProto(u)
		// Plaintext password is exposed only here (ListUsers is manager-only),
		// never in login / profile responses.
		p.PasswordPlain = u.PasswordPlain
		protoUsers = append(protoUsers, p)
	}

	totalPages := int32(math.Ceil(float64(total) / float64(f.PageSize)))
	return connect.NewResponse(&userv1.ListUsersResponse{
		Users: protoUsers,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(total),
			Page:       int32(f.Page),
			PageSize:   int32(f.PageSize),
			TotalPages: totalPages,
		},
	}), nil
}

func (h *UserHandler) GetProfile(
	ctx context.Context,
	req *connect.Request[userv1.GetProfileRequest],
) (*connect.Response[userv1.User], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	u, err := h.userSvc.GetProfile(ctx, claims.UserID)
	if err != nil {
		return nil, mapServiceError(err)
	}

	return connect.NewResponse(domainToProto(u)), nil
}

func (h *UserHandler) ChangePassword(
	ctx context.Context,
	req *connect.Request[userv1.ChangePasswordRequest],
) (*connect.Response[userv1.ChangePasswordResponse], error) {
	claims, ok := middleware.ClaimsFromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, nil)
	}

	if err := h.userSvc.ChangePassword(ctx, claims.UserID, req.Msg.CurrentPassword, req.Msg.NewPassword); err != nil {
		return nil, mapServiceError(err)
	}

	return connect.NewResponse(&userv1.ChangePasswordResponse{}), nil
}

// domainToProto converts a domain User to a protobuf User message.
func domainToProto(u *repository.User) *userv1.User {
	return &userv1.User{
		Id:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		FullName:  u.FullName,
		Role:      stringToProtoRole(u.Role),
		IsActive:  u.IsActive,
		Kelas:     u.Kelas,
		Jurusan:   u.Jurusan,
		PhotoUrl:  u.PhotoURL,
		Story:     u.Story,
		Mapel:       u.Mapel,
		Gender:      u.Gender,
		Phone:       u.Phone,
		Permissions: u.Permissions,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		UpdatedAt: timestamppb.New(u.UpdatedAt),
	}
}

func stringToProtoRole(role string) userv1.Role {
	switch role {
	case "admin":
		return userv1.Role_ROLE_ADMIN
	case "teacher":
		return userv1.Role_ROLE_TEACHER
	case "student":
		return userv1.Role_ROLE_STUDENT
	}
	return userv1.Role_ROLE_UNSPECIFIED
}

func protoRoleToString(role userv1.Role) string {
	switch role {
	case userv1.Role_ROLE_ADMIN:
		return "admin"
	case userv1.Role_ROLE_TEACHER:
		return "teacher"
	case userv1.Role_ROLE_STUDENT:
		return "student"
	}
	return ""
}

func mapServiceError(err error) error {
	switch {
	case errors.Is(err, service.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrInvalidCredentials):
		return connect.NewError(connect.CodeUnauthenticated, err)
	case errors.Is(err, service.ErrDuplicate):
		return connect.NewError(connect.CodeAlreadyExists, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
