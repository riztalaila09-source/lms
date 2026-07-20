package main

import (
	"context"
	"encoding/base64"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"lms/backend/gen/assignment/v1/assignmentv1connect"
	"lms/backend/gen/attendance/v1/attendancev1connect"
	"lms/backend/gen/class/v1/classv1connect"
	"lms/backend/gen/classroom/v1/classroomv1connect"
	"lms/backend/gen/jurusan/v1/jurusanv1connect"
	"lms/backend/gen/school/v1/schoolv1connect"
	"lms/backend/gen/course/v1/coursev1connect"
	"lms/backend/gen/dashboard/v1/dashboardv1connect"
	"lms/backend/gen/pkl/v1/pklv1connect"
	"lms/backend/gen/material/v1/materialv1connect"
	"lms/backend/gen/parent/v1/parentv1connect"
	"lms/backend/gen/user/v1/userv1connect"
	"lms/backend/internal/config"
	"lms/backend/internal/database"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var version = "dev"

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func main() {
	configPath := flag.String("config", "", "path to config.yaml (default: config.yaml beside the exe, else ../config.yaml)")
	flag.Parse()

	// Cari config.yaml. Bila -config tak diberi (mis. saat lms.exe diklik dua kali),
	// pakai config.yaml yang ada DI SAMPING exe; jika tak ada, jatuh ke ../config.yaml
	// (mode dev, folder kerja = backend/).
	exeDir := ""
	if exe, e := os.Executable(); e == nil {
		exeDir = filepath.Dir(exe)
	}
	path := *configPath
	usedExeConfig := false
	if path == "" {
		if exeDir != "" {
			if cand := filepath.Join(exeDir, "config.yaml"); fileExists(cand) {
				path, usedExeConfig = cand, true
			}
		}
		if path == "" {
			path = "../config.yaml"
		}
	}

	cfg, err := config.Load(path)
	if err != nil {
		log.Fatalf("load config (%s): %v", path, err)
	}

	// Mode terpaket (config di samping exe): buat path DB relatif menempel ke folder
	// exe, sehingga klik-dua-kali dari folder kerja mana pun tetap menemukan/menyimpan
	// database di samping lms.exe.
	if usedExeConfig && !filepath.IsAbs(cfg.Database.Path) {
		cfg.Database.Path = filepath.Join(exeDir, cfg.Database.Path)
		_ = os.MkdirAll(filepath.Dir(cfg.Database.Path), 0o755)
	}

	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	// Services
	jwtSvc := service.NewJWTService(cfg.JWT.Secret, cfg.JWT.ExpiryHours)

	// Repositories
	userRepo := repository.NewUserRepository(db)
	courseRepo := repository.NewCourseRepository(db)
	enrollmentRepo := repository.NewEnrollmentRepository(db)
	materialRepo := repository.NewMaterialRepository(db)
	questionRepo := repository.NewQuestionRepository(db)
	activityRepo := repository.NewActivityRepository(db)
	assignmentRepo := repository.NewAssignmentRepository(db)
	submissionRepo := repository.NewSubmissionRepository(db)
	assignmentQuestionRepo := repository.NewAssignmentQuestionRepository(db)
	assignmentGroupRepo := repository.NewAssignmentGroupRepository(db)
	dashboardRepo := repository.NewDashboardRepository(db)
	classRepo := repository.NewClassRepository(db)
	jurusanRepo := repository.NewJurusanRepository(db)
	schoolRepo := repository.NewSchoolRepository(db)
	completionRepo := repository.NewCompletionRepository(db)
	essayRepo := repository.NewEssayRepository(db)
	categoryRepo := repository.NewCategoryRepository(db)
	attendanceRepo := repository.NewAttendanceRepository(db)
	pklRepo := repository.NewPklRepository(db)
	classroomRepo := repository.NewClassroomRepository(db)
	parentRepo := repository.NewParentRepository(db)

	// Business logic
	userSvc := service.NewUserService(userRepo, jwtSvc, activityRepo)
	courseSvc := service.NewCourseService(courseRepo, enrollmentRepo, userRepo)
	materialSvc := service.NewMaterialService(materialRepo, enrollmentRepo, questionRepo, categoryRepo)
	completionSvc := service.NewCompletionService(completionRepo, essayRepo)
	essaySvc := service.NewEssayService(essayRepo, materialRepo)
	assignmentSvc := service.NewAssignmentService(assignmentRepo, submissionRepo, enrollmentRepo, courseRepo, assignmentQuestionRepo, assignmentGroupRepo)
	dashboardSvc := service.NewDashboardService(dashboardRepo)
	classSvc := service.NewClassService(classRepo, userRepo)
	jurusanSvc := service.NewJurusanService(jurusanRepo)
	schoolSvc := service.NewSchoolService(schoolRepo)
	attendanceSvc := service.NewAttendanceService(attendanceRepo, courseRepo)
	pklSvc := service.NewPklService(pklRepo)
	classroomSvc := service.NewClassroomService(classroomRepo)
	parentSvc := service.NewParentService(parentRepo, userRepo)

	// Handlers
	userHandler := handler.NewUserHandler(userSvc, courseSvc)
	courseHandler := handler.NewCourseHandler(courseSvc)
	materialHandler := handler.NewMaterialHandler(materialSvc, completionSvc, essaySvc)
	assignmentHandler := handler.NewAssignmentHandler(assignmentSvc)
	dashboardHandler := handler.NewDashboardHandler(dashboardSvc)
	classHandler := handler.NewClassHandler(classSvc)
	jurusanHandler := handler.NewJurusanHandler(jurusanSvc)
	schoolHandler := handler.NewSchoolHandler(schoolSvc)
	attendanceHandler := handler.NewAttendanceHandler(attendanceSvc)
	pklHandler := handler.NewPklHandler(pklSvc)
	classroomHandler := handler.NewClassroomHandler(classroomSvc)
	parentHandler := handler.NewParentHandler(parentSvc)

	// Load the central access policy (teacher edit/delete capabilities) into cache.
	if err := schoolSvc.LoadAccessPolicy(context.Background()); err != nil {
		log.Printf("warning: load access policy: %v", err)
	}

	// Auth first (populates claims), then per-procedure access-right enforcement.
	authInterceptor := middleware.NewAuthInterceptor(jwtSvc)
	permInterceptor := middleware.NewPermissionInterceptor(schoolSvc)
	interceptors := connect.WithInterceptors(authInterceptor, permInterceptor)

	mux := http.NewServeMux()

	userPath, userAPI := userv1connect.NewUserServiceHandler(userHandler, interceptors)
	coursePath, courseAPI := coursev1connect.NewCourseServiceHandler(courseHandler, interceptors)
	materialPath, materialAPI := materialv1connect.NewMaterialServiceHandler(materialHandler, interceptors)
	assignmentPath, assignmentAPI := assignmentv1connect.NewAssignmentServiceHandler(assignmentHandler, interceptors)
	dashboardPath, dashboardAPI := dashboardv1connect.NewDashboardServiceHandler(dashboardHandler, interceptors)
	classPath, classAPI := classv1connect.NewClassServiceHandler(classHandler, interceptors)
	jurusanPath, jurusanAPI := jurusanv1connect.NewJurusanServiceHandler(jurusanHandler, interceptors)
	schoolPath, schoolAPI := schoolv1connect.NewSchoolServiceHandler(schoolHandler, interceptors)
	attendancePath, attendanceAPI := attendancev1connect.NewAttendanceServiceHandler(attendanceHandler, interceptors)
	pklPath, pklAPI := pklv1connect.NewPklServiceHandler(pklHandler, interceptors)
	classroomPath, classroomAPI := classroomv1connect.NewClassroomServiceHandler(classroomHandler, interceptors)
	parentPath, parentAPI := parentv1connect.NewParentServiceHandler(parentHandler, interceptors)

	mux.Handle(userPath, userAPI)
	mux.Handle(coursePath, courseAPI)
	mux.Handle(materialPath, materialAPI)
	mux.Handle(assignmentPath, assignmentAPI)
	mux.Handle(dashboardPath, dashboardAPI)
	mux.Handle(classPath, classAPI)
	mux.Handle(jurusanPath, jurusanAPI)
	mux.Handle(schoolPath, schoolAPI)
	mux.Handle(attendancePath, attendanceAPI)
	mux.Handle(pklPath, pklAPI)
	mux.Handle(classroomPath, classroomAPI)
	mux.Handle(parentPath, parentAPI)

	// Serve material cover images as cacheable binary (NOT base64 in JSON), so
	// the materials list payload stays tiny and images load lazily/cached.
	mux.HandleFunc("/covers/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/covers/")
		if id == "" {
			http.NotFound(w, r)
			return
		}
		var dataURL string
		if err := db.QueryRowContext(r.Context(),
			`SELECT cover_image FROM course_materials WHERE id = ?`, id).Scan(&dataURL); err != nil || dataURL == "" {
			http.NotFound(w, r)
			return
		}
		comma := strings.IndexByte(dataURL, ',')
		if comma < 0 || !strings.HasPrefix(dataURL, "data:") {
			http.NotFound(w, r)
			return
		}
		mime := dataURL[len("data:"):comma]
		if semi := strings.IndexByte(mime, ';'); semi >= 0 {
			mime = mime[:semi]
		}
		raw, err := base64.StdEncoding.DecodeString(dataURL[comma+1:])
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "public, max-age=86400")
		_, _ = w.Write(raw)
	})

	// Serve frontend SPA (production build only; nil in dev mode via build tag)
	if frontendFS != nil {
		mux.Handle("/", spaHandler(frontendFS))
	}

	corsMiddleware := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{
			"Content-Type",
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"Connect-Accept-Encoding",
			"Connect-Content-Encoding",
			"Grpc-Timeout",
			"X-Grpc-Web",
			"X-User-Agent",
			"Authorization",
		},
		ExposedHeaders: []string{
			"Connect-Content-Encoding",
			"Grpc-Status",
			"Grpc-Message",
			"Grpc-Status-Details-Bin",
		},
	})

	finalHandler := corsMiddleware.Handler(h2c.NewHandler(mux, &http2.Server{}))

	server := &http.Server{
		Addr:    cfg.Server.Addr(),
		Handler: finalHandler,
	}

	fmt.Printf("LMS server %s listening on http://%s\n", version, cfg.Server.Addr())
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func spaHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if len(path) > 0 && path[0] == '/' {
			path = path[1:]
		}
		if _, err := fs.Stat(fsys, path); err != nil {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})
}
