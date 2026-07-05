# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

Project documentation and development guides live in the [`docs/`](docs/) folder — consult them before making changes:
- [docs/readme.md](docs/readme.md) — project overview / documentation.
- [docs/frontend-devel-guideline.md](docs/frontend-devel-guideline.md) — frontend development guidelines.
- [docs/frontend-implementation.md](docs/frontend-implementation.md) — frontend implementation notes.

## Project Rules (hard rules)

- **Testing is mandatory.** Setiap kali selesai membuat fitur atau mengimplementasikan service/RPC baru, **buat unit test-nya juga** (jangan dianggap selesai tanpa test). Untuk kasus kompleks, tambahkan **integration test** dan **end-to-end test** bila diperlukan. Ikuti pola test yang sudah ada di `*_test.go` (lihat _Testing_ di bawah).
- **Icons must use Chakra UI.** Di frontend, semua icon memakai komponen Chakra `<Icon>` dengan glyph dari `react-icons` (set Lucide `Lu*`). **Jangan pakai emoji** sebagai elemen UI. Chakra UI v3 tidak punya paket icon bawaan; `react-icons` adalah cara resminya.

## Commands

The `Makefile` is the source of truth. Common targets:

| Task | Make target | Raw command |
| --- | --- | --- |
| Generate proto (Go + TS) | `make proto` | `buf generate` |
| Run backend (dev) | `make dev-backend` | `cd backend && go run -tags dev ./cmd/server` |
| Run frontend (dev) | `make dev-frontend` | `cd frontend && npm run dev` |
| Run all tests | `make test` | `cd backend && go test ./... -race -count=1` |
| Test coverage (HTML) | `make test-cover` | — |
| Production build | `make build` | see below |

**Run a single test:** `cd backend && go test ./internal/service/ -run TestUserService_Login -v`

**Frontend type-check / lint:** `cd frontend && npm run lint` (runs `tsc --noEmit`). `npm run build` also runs `tsc -b` first.

### Two run modes — important

- **Dev mode** (`-tags dev`): the Go binary does **not** embed the frontend. Vite dev server runs at `http://localhost:5173` and proxies RPC calls to the backend at `http://localhost:8080`. Use two terminals (`dev-backend` + `dev-frontend`).
- **Production / embedded mode** (default build, no `dev` tag): `npm run build` writes the frontend into `backend/cmd/server/frontend/`, which is embedded into the Go binary via `//go:embed` ([embed.go](backend/cmd/server/embed.go)). The single binary serves both the API and the SPA at `http://localhost:8080`.

> **Gotcha:** In embedded mode, UI changes are **not** visible until you rebuild **both**: `cd frontend && npm run build` **then** `cd backend/cmd/server && go build -o ../../server.exe .`, then restart the server. Editing frontend files and only restarting the Go server does nothing.

Server run (embedded): `server.exe --config <abs-path>/config.yaml` with working directory `backend/cmd/server/` (so the relative `database.path` in `config.yaml` resolves to `backend/cmd/server/data/lms.db`).

## Architecture

Monorepo with a **protobuf-first, single-binary** design: a Go backend and a React frontend that compiles into the backend binary for distribution.

### Protobuf / RPC layer
- `.proto` files in `protos/<service>/v1/` are the contract. `buf generate` ([buf.gen.yaml](buf.gen.yaml)) emits Go stubs to `backend/gen/` and TypeScript to `frontend/src/gen/` (both gitignored / regenerable). **Never edit generated code; edit the `.proto` and regenerate.**
- Transport is **ConnectRPC** using the **Connect protocol** (HTTP/1.1, JSON body) over `h2c` — not gRPC binary and not REST. Frontend calls services via typed clients in [client.ts](frontend/src/lib/client.ts).

### Backend layering (`backend/internal/`)
Strict one-way dependency: **handler → service → repository → SQLite**.
- `handler/` — ConnectRPC handlers. Translate proto ↔ domain, read auth via `middleware.ClaimsFromContext(ctx)`, map domain errors to `connect.Code*`. Thin; no business logic.
- `service/` — business logic, permission checks (`isManager`, role gates), orchestration across repositories.
- `repository/` — SQL against SQLite via `database/sql`. Returns domain structs.
- `cmd/server/main.go` — composition root: opens DB, runs migrations, wires repos → services → handlers, mounts each service, applies the auth interceptor + CORS.

### Auth
JWT bearer tokens. A single ConnectRPC interceptor ([auth.go](backend/internal/middleware/auth.go)) validates every call **except `/user.v1.UserService/Login`**, injects `*service.Claims` into context. Frontend stores the token in `localStorage` (`lms_token`) and attaches it via an interceptor in [transport.ts](frontend/src/lib/transport.ts).

### Database & migrations
- **SQLite via `modernc.org/sqlite`** (pure Go, **CGO-free**): `sql.Open` uses driver name `"sqlite"`; goose dialect is `"sqlite3"`.
- Migrations in `backend/internal/database/migrations/` run **automatically on startup** ([migrate.go](backend/internal/database/migrate.go)). SQL files are `//go:embed`-ed, so a new `.sql` migration only takes effect after the Go binary is rebuilt. Go-based seed migrations (e.g. `*_seed_demo.go`) register via `init()`.
- DB connection forces `foreign_keys(ON)` and `journal_mode(WAL)` ([db.go](backend/internal/database/db.go)); `SetMaxOpenConns(1)` (SQLite single-writer).
- **Table-name gotcha:** the materials table is `course_materials` (not `materials`) and enrollments is `course_enrollments` (not `enrollments`). Match existing migration names when writing new queries.

### Frontend
- React 18 + TypeScript + Vite + React Router v6. **Chakra UI v3** (`ChakraProvider value={defaultSystem}` in [provider.tsx](frontend/src/components/ui/provider.tsx)).
- Design tokens live in [theme/tokens.ts](frontend/src/theme/tokens.ts) (the `COLORS` object) — reuse these instead of hardcoding hex values.
- Pages in `src/pages/`, shared UI in `src/components/`, RPC clients in `src/lib/`.

### Testing
- Tests use `testify` and an **in-memory SQLite** DB seeded with all migrations via `testutil.SetupTestDB(t)` ([testutil.go](backend/internal/testutil/testutil.go)).
- Existing pattern covers all three layers per feature: `repository/*_test.go`, `service/*_test.go`, `handler/*_test.go`. Handler tests inject fake claims with `middleware.TestContextKey()`.
- Currently only the `user` feature has full coverage; new features (course, material, class, assignment, completion, essay, dashboard) are the place to apply the testing hard rule above.
