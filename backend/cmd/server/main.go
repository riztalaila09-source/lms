package main

import (
	"encoding/base64"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"lms/backend/gen/assignment/v1/assignmentv1connect"
	"lms/backend/gen/attendance/v1/attendancev1connect"
	"lms/backend/gen/class/v1/classv1connect"
	"lms/backend/gen/jurusan/v1/jurusanv1connect"
	"lms/backend/gen/school/v1/schoolv1connect"
	"lms/backend/gen/course/v1/coursev1connect"
	"lms/backend/gen/dashboard/v1/dashboardv1connect"
	"lms/backend/gen/pkl/v1/pklv1connect"
	"lms/backend/gen/material/v1/materialv1connect"
	"lms/backend/gen/user/v1/userv1connect"
	"lms/backend/internal/config"
	"lms/backend/internal/database"
	"lms/backend/internal/handler"
	"lms/backend/internal/middleware"
	"lms/backend/internal/repository"
	"lms/backend/internal/service"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "../config.yaml", "path to config.yaml")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
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
	dashboardRepo := repository.NewDashboardRepository(db)
	classRepo := repository.NewClassRepository(db)
	jurusanRepo := repository.NewJurusanRepository(db)
	schoolRepo := repository.NewSchoolRepository(db)
	completionRepo := repository.NewCompletionRepository(db)
	essayRepo := repository.NewEssayRepository(db)
	categoryRepo := repository.NewCategoryRepository(db)
	attendanceRepo := repository.NewAttendanceRepository(db)
	pklRepo := repository.NewPklRepository(db)

	// Business logic
	userSvc := service.NewUserService(userRepo, jwtSvc, activityRepo)
	courseSvc := service.NewCourseService(courseRepo, enrollmentRepo, userRepo)
	materialSvc := service.NewMaterialService(materialRepo, enrollmentRepo, questionRepo, categoryRepo)
	completionSvc := service.NewCompletionService(completionRepo, essayRepo)
	essaySvc := service.NewEssayService(essayRepo, materialRepo)
	assignmentSvc := service.NewAssignmentService(assignmentRepo, submissionRepo, enrollmentRepo, courseRepo, assignmentQuestionRepo)
	dashboardSvc := service.NewDashboardService(dashboardRepo)
	classSvc := service.NewClassService(classRepo)
	jurusanSvc := service.NewJurusanService(jurusanRepo)
	schoolSvc := service.NewSchoolService(schoolRepo)
	attendanceSvc := service.NewAttendanceService(attendanceRepo, courseRepo)
	pklSvc := service.NewPklService(pklRepo)

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

	// Auth interceptor applied to all handlers
	authInterceptor := middleware.NewAuthInterceptor(jwtSvc)
	interceptors := connect.WithInterceptors(authInterceptor)

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
