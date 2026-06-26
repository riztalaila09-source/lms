package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"

	"connectrpc.com/connect"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

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
	configPath := flag.String("config", "../../config.yaml", "path to config.yaml")
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

	jwtSvc := service.NewJWTService(cfg.JWT.Secret, cfg.JWT.ExpiryHours)
	userRepo := repository.NewUserRepository(db)
	userSvc := service.NewUserService(userRepo, jwtSvc)
	userHandler := handler.NewUserHandler(userSvc)

	authInterceptor := middleware.NewAuthInterceptor(jwtSvc)
	interceptors := connect.WithInterceptors(authInterceptor)

	mux := http.NewServeMux()

	path, apiHandler := userv1connect.NewUserServiceHandler(userHandler, interceptors)
	mux.Handle(path, apiHandler)

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

// spaHandler serves a Single Page Application: known files from the FS,
// everything else falls back to index.html for client-side routing.
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
