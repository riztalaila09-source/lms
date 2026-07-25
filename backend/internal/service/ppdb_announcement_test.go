package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"lms/backend/internal/repository"
	"lms/backend/internal/service"
	"lms/backend/internal/testutil"
)

// helper: create+activate a gelombang, register an applicant, take the exam.
// answers correct count controls the score (2 soal → 100/50/0).
func seedPpdbApplicant(t *testing.T, svc *service.SchoolService, ctx context.Context, batchID, nama, jurusan string, correct2 int) *repository.PpdbRegistration {
	t.Helper()
	reg, err := svc.SubmitPpdbRegistration(ctx, &repository.PpdbRegistration{Nama: nama, Jurusan: jurusan})
	require.NoError(t, err)
	ans := map[int]int{0: 1, 1: 0} // both wrong by default
	if correct2 >= 1 {
		ans[0] = 0
	}
	if correct2 >= 2 {
		ans[1] = 1
	}
	_, _, _, err = svc.SubmitPpdbTest(ctx, "ppdb", reg.ID, ans)
	require.NoError(t, err)
	return reg
}

func TestSchoolService_PublishPpdbAnnouncement(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	questions := []*repository.PpdbQuestion{
		{Question: "1+1?", Options: []string{"2", "3"}, CorrectIndex: 0},
		{Question: "Ibukota?", Options: []string{"Bandung", "Jakarta"}, CorrectIndex: 1},
	}

	// Two gelombang of the SAME school year; exams open on both.
	g1, err := svc.CreatePpdbBatch(ctx, "admin", "2026/2027", 1)
	require.NoError(t, err)
	g2, err := svc.CreatePpdbBatch(ctx, "admin", "2026/2027", 2)
	require.NoError(t, err)
	for _, b := range []*repository.PpdbBatch{g1, g2} {
		require.NoError(t, svc.SetPpdbQuestions(ctx, "admin", b.ID, questions))
		_, err = svc.UpdatePpdbBatch(ctx, "admin", service.PpdbBatchUpdate{ID: b.ID, TestActive: ptrBool(true)})
		require.NoError(t, err)
	}

	// Gelombang 1: Budi 100 (TKJ), Ani 50 (TKR).
	_, err = svc.SetActivePpdbBatch(ctx, "admin", g1.ID)
	require.NoError(t, err)
	budi := seedPpdbApplicant(t, svc, ctx, g1.ID, "Budi", "TKJ", 2)
	ani := seedPpdbApplicant(t, svc, ctx, g1.ID, "Ani", "TKR", 1)

	// Gelombang 2: Citra 100 (TPM) — different gelombang, must mix in.
	_, err = svc.SetActivePpdbBatch(ctx, "admin", g2.ID)
	require.NoError(t, err)
	citra := seedPpdbApplicant(t, svc, ctx, g2.ID, "Citra", "TPM", 2)

	// Accept Budi + Ani; leave Citra "baru" (not yet in announcement).
	_, err = svc.UpdatePpdbStatus(ctx, "admin", budi.ID, "diterima", "")
	require.NoError(t, err)
	_, err = svc.UpdatePpdbStatus(ctx, "admin", ani.ID, "diterima", "")
	require.NoError(t, err)

	// A manual pengumuman item exists and must survive publishing.
	_, err = svc.SetContent(ctx, "admin", "pengumuman", []*repository.ContentItem{{Title: "Libur Semester", Body: "info"}})
	require.NoError(t, err)

	// Non-admin cannot publish.
	_, err = svc.PublishPpdbAnnouncement(ctx, "student", "2026/2027")
	assert.ErrorIs(t, err, service.ErrPermissionDenied)

	// Publish: only accepted+scored (Budi, Ani) → 2 peserta.
	n, err := svc.PublishPpdbAnnouncement(ctx, "admin", "2026/2027")
	require.NoError(t, err)
	assert.Equal(t, 2, n)

	items, err := svc.ListContent(ctx, "pengumuman")
	require.NoError(t, err)
	require.Len(t, items, 2, "auto announcement prepended, manual item kept")
	ann := items[0]
	assert.Equal(t, "Hasil Seleksi PPDB — TA 2026/2027", ann.Title)
	assert.Equal(t, "Libur Semester", items[1].Title, "manual item preserved")
	// Budi (100) ranks above Ani (50); Citra (not accepted) absent.
	assert.True(t, strings.Index(ann.Body, "Budi") < strings.Index(ann.Body, "Ani"), "highest score first")
	assert.NotContains(t, ann.Body, "Citra", "not-yet-accepted excluded")
	assert.Contains(t, ann.Body, "TKJ")
	assert.Empty(t, ann.URL, "no Selengkapnya link")

	// AUTO-REFRESH: accept Citra (score 100, registered latest) → she joins the
	// ranking automatically without a second Publish call.
	_, err = svc.UpdatePpdbStatus(ctx, "admin", citra.ID, "diterima", "")
	require.NoError(t, err)
	items, err = svc.ListContent(ctx, "pengumuman")
	require.NoError(t, err)
	require.Len(t, items, 2)
	ann = items[0]
	assert.Contains(t, ann.Body, "Citra", "auto-refreshed after acceptance")
	// Budi & Citra both 100 (Budi earlier) rank above Ani 50.
	assert.True(t, strings.Index(ann.Body, "Citra") < strings.Index(ann.Body, "Ani"))
	assert.Contains(t, ann.Subtitle, "3 peserta diterima")
}

func TestSchoolService_RefreshNoopBeforePublish(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	svc := service.NewSchoolService(repository.NewSchoolRepository(db), service.NewJWTService("test-secret", 24))

	g1, err := svc.CreatePpdbBatch(ctx, "admin", "2026/2027", 1)
	require.NoError(t, err)
	require.NoError(t, svc.SetPpdbQuestions(ctx, "admin", g1.ID, []*repository.PpdbQuestion{
		{Question: "1+1?", Options: []string{"2", "3"}, CorrectIndex: 0},
		{Question: "Ibukota?", Options: []string{"Bandung", "Jakarta"}, CorrectIndex: 1},
	}))
	_, err = svc.UpdatePpdbBatch(ctx, "admin", service.PpdbBatchUpdate{ID: g1.ID, TestActive: ptrBool(true)})
	require.NoError(t, err)
	_, err = svc.SetActivePpdbBatch(ctx, "admin", g1.ID)
	require.NoError(t, err)

	reg := seedPpdbApplicant(t, svc, ctx, g1.ID, "Budi", "TKJ", 2)
	// Accepting before any Publish must NOT create the announcement content.
	_, err = svc.UpdatePpdbStatus(ctx, "admin", reg.ID, "diterima", "")
	require.NoError(t, err)
	items, err := svc.ListContent(ctx, "pengumuman")
	require.NoError(t, err)
	assert.Empty(t, items, "no announcement until admin publishes once")
}
