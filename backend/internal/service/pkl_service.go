package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"lms/backend/internal/repository"
)

var (
	ErrPklFull        = errors.New("kuota tempat PKL sudah penuh")
	ErrAlreadyApplied = errors.New("kamu sudah memilih tempat PKL — batalkan dulu")
)

type PklService struct {
	repo repository.PklRepository
}

func NewPklService(repo repository.PklRepository) *PklService { return &PklService{repo: repo} }

type PklPartnerInput struct {
	Name           string
	Alamat         string
	Deskripsi      string
	MapsURL        string
	Lat            float64
	Lng            float64
	KontakWA       string
	BidangUsaha    string
	JobRequirement string
	Logo           string
	Kuota          int
}

func (s *PklService) CreatePartner(ctx context.Context, callerID, callerRole string, in PklPartnerInput) (*repository.PklPartner, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if in.Name == "" {
		return nil, fmt.Errorf("%w: nama tempat PKL wajib", ErrInvalidArgument)
	}
	if in.Kuota < 1 {
		in.Kuota = 1
	}
	now := time.Now().UTC()
	p := &repository.PklPartner{
		ID: uuid.New().String(), Name: in.Name, Alamat: in.Alamat, Deskripsi: in.Deskripsi,
		MapsURL: in.MapsURL, Lat: in.Lat, Lng: in.Lng, KontakWA: in.KontakWA,
		BidangUsaha: in.BidangUsaha, JobRequirement: in.JobRequirement, Logo: in.Logo, Kuota: in.Kuota,
		CreatedBy: callerID, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.repo.Create(ctx, p); err != nil {
		return nil, fmt.Errorf("create partner: %w", err)
	}
	return s.repo.GetByID(ctx, p.ID, callerID)
}

func (s *PklService) UpdatePartner(ctx context.Context, callerID, callerRole, id string, in PklPartnerInput) (*repository.PklPartner, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	if in.Kuota < 1 {
		in.Kuota = 1
	}
	p := &repository.PklPartner{
		ID: id, Name: in.Name, Alamat: in.Alamat, Deskripsi: in.Deskripsi, MapsURL: in.MapsURL,
		Lat: in.Lat, Lng: in.Lng, KontakWA: in.KontakWA, BidangUsaha: in.BidangUsaha,
		JobRequirement: in.JobRequirement, Logo: in.Logo, Kuota: in.Kuota,
	}
	if err := s.repo.Update(ctx, p); err != nil {
		if errors.Is(err, repository.ErrPklNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return s.repo.GetByID(ctx, id, callerID)
}

func (s *PklService) DeletePartner(ctx context.Context, callerRole, id string) error {
	if !isManager(callerRole) {
		return ErrPermissionDenied
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrPklNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *PklService) ListPartners(ctx context.Context, callerID string) ([]*repository.PklPartner, error) {
	return s.repo.List(ctx, callerID)
}

func (s *PklService) GetApplicants(ctx context.Context, callerRole, partnerID string) ([]*repository.PklApplicant, error) {
	if !isManager(callerRole) {
		return nil, ErrPermissionDenied
	}
	return s.repo.ListApplicants(ctx, partnerID)
}

func (s *PklService) Apply(ctx context.Context, callerID, callerRole, partnerID string) error {
	if callerRole != "student" {
		return ErrPermissionDenied
	}
	partner, err := s.repo.GetByID(ctx, partnerID, callerID)
	if err != nil {
		if errors.Is(err, repository.ErrPklNotFound) {
			return ErrNotFound
		}
		return err
	}
	has, err := s.repo.HasApplication(ctx, callerID)
	if err != nil {
		return err
	}
	if has {
		return ErrAlreadyApplied
	}
	count, err := s.repo.CountApplications(ctx, partnerID)
	if err != nil {
		return err
	}
	if count >= partner.Kuota {
		return ErrPklFull
	}
	if err := s.repo.Apply(ctx, partnerID, callerID); err != nil {
		if errors.Is(err, repository.ErrPklDuplicate) {
			return ErrAlreadyApplied
		}
		return err
	}
	return nil
}

func (s *PklService) CancelApply(ctx context.Context, callerID, callerRole string) error {
	if callerRole != "student" {
		return ErrPermissionDenied
	}
	return s.repo.CancelApply(ctx, callerID)
}

func (s *PklService) MyApplication(ctx context.Context, callerID, callerRole string) (*repository.PklPartner, error) {
	if callerRole != "student" {
		return nil, ErrPermissionDenied
	}
	pid, has, err := s.repo.MyApplicationPartnerID(ctx, callerID)
	if err != nil {
		return nil, err
	}
	if !has {
		return nil, nil
	}
	p, err := s.repo.GetByID(ctx, pid, callerID)
	if err != nil {
		if errors.Is(err, repository.ErrPklNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}
