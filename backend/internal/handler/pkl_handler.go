package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	pklv1 "lms/backend/gen/pkl/v1"
	"lms/backend/gen/pkl/v1/pklv1connect"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var _ pklv1connect.PklServiceHandler = (*PklHandler)(nil)

type PklHandler struct {
	svc *service.PklService
	pklv1connect.UnimplementedPklServiceHandler
}

func NewPklHandler(svc *service.PklService) *PklHandler { return &PklHandler{svc: svc} }

func pklError(err error) error {
	switch {
	case errors.Is(err, service.ErrPermissionDenied):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, service.ErrInvalidArgument):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, service.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, service.ErrPklFull), errors.Is(err, service.ErrAlreadyApplied):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func partnerToProto(p *repository.PklPartner) *pklv1.Partner {
	out := &pklv1.Partner{
		Id: p.ID, Name: p.Name, Alamat: p.Alamat, Deskripsi: p.Deskripsi, MapsUrl: p.MapsURL,
		Lat: p.Lat, Lng: p.Lng, KontakWa: p.KontakWA, BidangUsaha: p.BidangUsaha,
		JobRequirement: p.JobRequirement, Logo: p.Logo, Kuota: int32(p.Kuota), Terisi: int32(p.Terisi),
		IsFull: p.Terisi >= p.Kuota, AppliedByMe: p.AppliedByMe, CreatedByName: p.CreatedByName,
	}
	if !p.CreatedAt.IsZero() {
		out.CreatedAt = timestamppb.New(p.CreatedAt)
	}
	return out
}

func pklInput(m interface {
	GetName() string
	GetAlamat() string
	GetDeskripsi() string
	GetMapsUrl() string
	GetLat() float64
	GetLng() float64
	GetKontakWa() string
	GetBidangUsaha() string
	GetJobRequirement() string
	GetLogo() string
	GetKuota() int32
}) service.PklPartnerInput {
	return service.PklPartnerInput{
		Name: m.GetName(), Alamat: m.GetAlamat(), Deskripsi: m.GetDeskripsi(), MapsURL: m.GetMapsUrl(),
		Lat: m.GetLat(), Lng: m.GetLng(), KontakWA: m.GetKontakWa(), BidangUsaha: m.GetBidangUsaha(),
		JobRequirement: m.GetJobRequirement(), Logo: m.GetLogo(), Kuota: int(m.GetKuota()),
	}
}

func (h *PklHandler) CreatePartner(ctx context.Context, req *connect.Request[pklv1.CreatePartnerRequest]) (*connect.Response[pklv1.Partner], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.svc.CreatePartner(ctx, c.UserID, c.Role, pklInput(req.Msg))
	if err != nil {
		return nil, pklError(err)
	}
	return connect.NewResponse(partnerToProto(p)), nil
}

func (h *PklHandler) UpdatePartner(ctx context.Context, req *connect.Request[pklv1.UpdatePartnerRequest]) (*connect.Response[pklv1.Partner], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.svc.UpdatePartner(ctx, c.UserID, c.Role, req.Msg.Id, pklInput(req.Msg))
	if err != nil {
		return nil, pklError(err)
	}
	return connect.NewResponse(partnerToProto(p)), nil
}

func (h *PklHandler) DeletePartner(ctx context.Context, req *connect.Request[pklv1.DeletePartnerRequest]) (*connect.Response[pklv1.DeletePartnerResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.DeletePartner(ctx, c.Role, req.Msg.Id); err != nil {
		return nil, pklError(err)
	}
	return connect.NewResponse(&pklv1.DeletePartnerResponse{}), nil
}

func (h *PklHandler) ListPartners(ctx context.Context, _ *connect.Request[pklv1.ListPartnersRequest]) (*connect.Response[pklv1.ListPartnersResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	partners, err := h.svc.ListPartners(ctx, c.UserID)
	if err != nil {
		return nil, pklError(err)
	}
	out := &pklv1.ListPartnersResponse{}
	for _, p := range partners {
		out.Partners = append(out.Partners, partnerToProto(p))
	}
	return connect.NewResponse(out), nil
}

func (h *PklHandler) GetApplicants(ctx context.Context, req *connect.Request[pklv1.GetApplicantsRequest]) (*connect.Response[pklv1.GetApplicantsResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	apps, err := h.svc.GetApplicants(ctx, c.Role, req.Msg.PartnerId)
	if err != nil {
		return nil, pklError(err)
	}
	out := &pklv1.GetApplicantsResponse{}
	for _, a := range apps {
		item := &pklv1.Applicant{StudentId: a.StudentID, Name: a.Name, Kelas: a.Kelas}
		if !a.AppliedAt.IsZero() {
			item.AppliedAt = timestamppb.New(a.AppliedAt)
		}
		out.Applicants = append(out.Applicants, item)
	}
	return connect.NewResponse(out), nil
}

func (h *PklHandler) Apply(ctx context.Context, req *connect.Request[pklv1.ApplyRequest]) (*connect.Response[pklv1.ApplyResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.Apply(ctx, c.UserID, c.Role, req.Msg.PartnerId); err != nil {
		return nil, pklError(err)
	}
	return connect.NewResponse(&pklv1.ApplyResponse{}), nil
}

func (h *PklHandler) CancelApply(ctx context.Context, _ *connect.Request[pklv1.CancelApplyRequest]) (*connect.Response[pklv1.CancelApplyResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.svc.CancelApply(ctx, c.UserID, c.Role); err != nil {
		return nil, pklError(err)
	}
	return connect.NewResponse(&pklv1.CancelApplyResponse{}), nil
}

func (h *PklHandler) MyApplication(ctx context.Context, _ *connect.Request[pklv1.MyApplicationRequest]) (*connect.Response[pklv1.MyApplicationResponse], error) {
	c, err := claims(ctx)
	if err != nil {
		return nil, err
	}
	p, err := h.svc.MyApplication(ctx, c.UserID, c.Role)
	if err != nil {
		return nil, pklError(err)
	}
	out := &pklv1.MyApplicationResponse{Has: p != nil}
	if p != nil {
		out.Partner = partnerToProto(p)
	}
	return connect.NewResponse(out), nil
}
