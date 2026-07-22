package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	gamev1 "lms/backend/gen/game/v1"
	"lms/backend/gen/game/v1/gamev1connect"
	"lms/backend/internal/service"
)

var _ gamev1connect.GameServiceHandler = (*GameHandler)(nil)

type GameHandler struct {
	svc *service.GameService
	gamev1connect.UnimplementedGameServiceHandler
}

func NewGameHandler(svc *service.GameService) *GameHandler { return &GameHandler{svc: svc} }

func gameError(err error) error {
	switch {
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrInvalidArgument):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, service.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func (h *GameHandler) CreateGame(ctx context.Context, req *connect.Request[gamev1.CreateGameRequest]) (*connect.Response[gamev1.CreateGameResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	sess, err := h.svc.CreateGame(ctx, c.UserID, c.Role, req.Msg.AssignmentId, int(req.Msg.DurationSeconds))
	if err != nil {
		return nil, gameError(err)
	}
	return connect.NewResponse(&gamev1.CreateGameResponse{
		SessionId: sess.ID, Pin: sess.PIN, QuestionCount: int32(sess.QuestionCount),
	}), nil
}

func (h *GameHandler) JoinGame(ctx context.Context, req *connect.Request[gamev1.JoinGameRequest]) (*connect.Response[gamev1.JoinGameResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	res, err := h.svc.JoinGame(ctx, c.UserID, req.Msg.Pin, req.Msg.Nickname)
	if err != nil {
		return nil, gameError(err)
	}
	return connect.NewResponse(&gamev1.JoinGameResponse{
		SessionId: res.Session.ID, PlayerId: res.PlayerID, QuestionCount: int32(res.Session.QuestionCount),
		HostName: res.HostName, AssignmentTitle: res.AssignmentTitle,
	}), nil
}

func (h *GameHandler) StartQuestion(ctx context.Context, req *connect.Request[gamev1.StartQuestionRequest]) (*connect.Response[gamev1.StartQuestionResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.StartQuestion(ctx, c.UserID, c.Role, req.Msg.SessionId, int(req.Msg.Index)); err != nil {
		return nil, gameError(err)
	}
	return connect.NewResponse(&gamev1.StartQuestionResponse{}), nil
}

func (h *GameHandler) RevealQuestion(ctx context.Context, req *connect.Request[gamev1.RevealQuestionRequest]) (*connect.Response[gamev1.RevealQuestionResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.RevealQuestion(ctx, c.UserID, c.Role, req.Msg.SessionId); err != nil {
		return nil, gameError(err)
	}
	return connect.NewResponse(&gamev1.RevealQuestionResponse{}), nil
}

func (h *GameHandler) EndGame(ctx context.Context, req *connect.Request[gamev1.EndGameRequest]) (*connect.Response[gamev1.EndGameResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.EndGame(ctx, c.UserID, c.Role, req.Msg.SessionId); err != nil {
		return nil, gameError(err)
	}
	return connect.NewResponse(&gamev1.EndGameResponse{}), nil
}

func (h *GameHandler) SubmitGameAnswer(ctx context.Context, req *connect.Request[gamev1.SubmitGameAnswerRequest]) (*connect.Response[gamev1.SubmitGameAnswerResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	accepted, err := h.svc.SubmitGameAnswer(ctx, c.UserID, req.Msg.SessionId, int(req.Msg.QuestionIndex), int(req.Msg.OptionIndex))
	if err != nil {
		return nil, gameError(err)
	}
	return connect.NewResponse(&gamev1.SubmitGameAnswerResponse{Accepted: accepted}), nil
}

func (h *GameHandler) GetGameState(ctx context.Context, req *connect.Request[gamev1.GetGameStateRequest]) (*connect.Response[gamev1.GetGameStateResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	st, err := h.svc.GetGameState(ctx, c.UserID, c.Role, req.Msg.SessionId)
	if err != nil {
		return nil, gameError(err)
	}
	sess := st.Session
	out := &gamev1.GetGameStateResponse{
		Status: sess.Status, CurrentIndex: int32(sess.CurrentIndex), QuestionCount: int32(sess.QuestionCount),
		IsHost: st.IsHost, ServerTime: timestamppb.New(st.ServerTime), DurationSeconds: int32(sess.DurationSeconds),
		PlayerCount: int32(len(st.Players)), AssignmentTitle: st.AssignmentTitle, HostName: st.HostName,
		Question: st.Question, Options: st.Options, Image: st.Image, CorrectIndex: int32(st.CorrectIndex),
		AnswerDistribution: int32s(st.AnswerDistribution), AnsweredCount: int32(st.AnsweredCount),
	}
	if sess.CurrentStartedAt.Valid {
		out.CurrentStartedAt = timestamppb.New(sess.CurrentStartedAt.Time)
	}
	for i, p := range st.Players {
		out.Leaderboard = append(out.Leaderboard, &gamev1.PlayerScore{
			PlayerId: p.ID, Nickname: p.Nickname, Score: int32(p.Score), Rank: int32(i + 1), Avatar: p.Avatar,
		})
	}
	if !st.IsHost {
		out.MyResult = &gamev1.MyResult{
			Answered: st.MyAnswered, OptionIndex: int32(st.MyOptionIndex), IsCorrect: st.MyIsCorrect,
			Points: int32(st.MyPoints), Streak: int32(st.MyStreak), TotalScore: int32(st.MyTotalScore), Rank: int32(st.MyRank),
		}
	}
	return connect.NewResponse(out), nil
}

func int32s(in []int) []int32 {
	if in == nil {
		return nil
	}
	out := make([]int32, len(in))
	for i, v := range in {
		out[i] = int32(v)
	}
	return out
}
