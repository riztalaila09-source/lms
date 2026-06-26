BINARY_NAME  = lms
VERSION      ?= 0.1.0
BACKEND_DIR  = backend
FRONTEND_DIR = frontend
DIST_DIR     = dist
EMBED_DIR    = $(BACKEND_DIR)/cmd/server/frontend

.PHONY: proto migrate-up migrate-down dev-backend dev-frontend dev \
        build build-frontend build-backend test test-cover dist clean install-tools

# ── Code generation ──────────────────────────────────────────────────────────
proto:
	buf generate

# ── Database migrations ──────────────────────────────────────────────────────
migrate-up:
	cd $(BACKEND_DIR) && go run -tags dev ./cmd/server -migrate-only

migrate-down:
	@echo "Use goose CLI: cd $(BACKEND_DIR) && goose -dir internal/database/migrations sqlite3 <db-path> down"

# ── Development ──────────────────────────────────────────────────────────────
dev-backend:
	cd $(BACKEND_DIR) && go run -tags dev ./cmd/server

dev-frontend:
	cd $(FRONTEND_DIR) && npm run dev

# Run both servers in parallel (requires GNU Make with job support)
# On Windows: open two terminals and run dev-backend / dev-frontend separately
dev:
	$(MAKE) -j2 dev-backend dev-frontend

# ── Testing ──────────────────────────────────────────────────────────────────
test:
	cd $(BACKEND_DIR) && go test ./... -v -race -count=1

test-cover:
	cd $(BACKEND_DIR) && go test ./... -coverprofile=coverage.out
	cd $(BACKEND_DIR) && go tool cover -html=coverage.out

# ── Production build ─────────────────────────────────────────────────────────
build-frontend:
	cd $(FRONTEND_DIR) && npm run build

build-backend: build-frontend
	cd $(BACKEND_DIR) && go build \
		-ldflags="-s -w -X main.version=$(VERSION)" \
		-o ../$(DIST_DIR)/$(BINARY_NAME) \
		./cmd/server

build: build-backend

# ── Distribution archive ─────────────────────────────────────────────────────
dist: build
	@mkdir -p $(DIST_DIR)
	cp config.yaml $(DIST_DIR)/config.yaml
	cd $(DIST_DIR) && zip -9 $(BINARY_NAME)-$(VERSION).zip $(BINARY_NAME) config.yaml
	@echo "Distribution archive: $(DIST_DIR)/$(BINARY_NAME)-$(VERSION).zip"

# ── Cleanup ──────────────────────────────────────────────────────────────────
clean:
	rm -rf $(EMBED_DIR)
	rm -f  $(DIST_DIR)/$(BINARY_NAME)
	rm -f  $(DIST_DIR)/*.zip
	rm -rf $(BACKEND_DIR)/gen
	rm -rf $(FRONTEND_DIR)/src/gen
	rm -f  $(BACKEND_DIR)/coverage.out

# ── Tool installation ────────────────────────────────────────────────────────
install-tools:
	go install github.com/pressly/goose/v3/cmd/goose@latest
	npm install -g @bufbuild/buf
