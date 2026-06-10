# Argus Monitor

Argus Monitor is a blockchain monitoring SaaS application. It allows users to set up monitors for various blockchain events and receive notifications.

## Features

- **React Frontend** — Vite + React 18 + TypeScript + Tailwind CSS with auth pages (Login, Register), wallet dashboard with balances and transactions, and alert rules management
- **Wallet Dashboard** — wallet list with add/remove, SOL balance displayed as ◎ with lamports formatted via BigInt (no float), SPL token balances (USDC, mSOL) with USD values, recent transactions table with type/amount/signature/status/time
- **Socket.io Live Updates** — authenticated WebSocket connection handling `wallet_update`, `balance_update`, and `new_transaction` events with animated notification banner
- **JWT Authentication** — register, login, refresh tokens, logout, profile endpoint. Short-lived access tokens (15 min) with httpOnly refresh token cookies (7 days) for secure session management.
- **Wallet Management** — add, list, view, and delete blockchain wallet addresses
- **Alert Rules** — create, list, view, and delete alert rules per wallet
- **Telegram Notifications** — BullMQ consumer dispatches triggered alerts via Telegram Bot API with exponential backoff retry (5 attempts, 2s initial delay)
- **Real-time WebSocket Gateway** — authenticated connections, wallet updates, alert triggers (Socket.io with auto-reconnect)
- **Chain Management** — admin CRUD for supported blockchain networks
- **Solana Blockchain Adapter** — Helius RPC integration with rate limiter, circuit breaker, and periodic RPC health monitoring (latency, block height, status change events via RxJS)
- **Strict Input Validation** — all endpoints validate input with whitelist (unknown props rejected) + type coercion (string to number for query params)
- **Health Checks** — `/api/health` endpoint for all services
- **Global Exception Filter** — In production, unhandled errors return only `{statusCode, message}` (no stack traces, timestamp, or path). In development, responses include `timestamp`, `path`, and `stack` for debugging. Prisma errors are mapped to specific HTTP status codes: `P2002` (unique constraint) to 409 Conflict, `P2025` (record not found) to 404 Not Found, `P2003` (foreign key constraint) to 400 Bad Request, and other unexpected Prisma errors to 500 Internal Server Error. The filter extends `BaseExceptionFilter` from `@nestjs/core` and is registered via `HttpAdapterHost` in `main.ts`.
- **Rate Limiting** — global 100 req/60s per IP, stricter 10 req/60s on auth endpoints, health endpoint exempt. Auth rate limiting validated via supertest integration test (`auth.controller.spec.ts`) that proves the `@Throttle()` decorator enforces the 10-request cap through the full NestJS HTTP pipeline.
- **Secret Redaction** — all log calls use NestJS `Logger` (not `console.log`); a `redact()` utility masks passwords, tokens, API keys, and PII before logging; a linting test (`log-secrets-lint.spec.ts`) enforces no secret env vars in log calls
- **Prisma Error Handling** — all repository methods wrap Prisma calls with `try/catch` using a shared `handlePrismaError()` utility that maps `P2002` (unique constraint) → 409, `P2025` (not found) → 404, `P2003` (foreign key) → 400, and unexpected errors → 500
- **Comprehensive Test Suite** — 273 unit + integration tests across all 6 microservices (53 test suites), with 70% coverage threshold enforced via Jest project references. CI pipeline runs tests with PostgreSQL + Redis on every PR.
- **Playwright E2E Tests** — browser-based end-to-end tests for auth flow, wallet management, alert rules CRUD, wallet dashboard (balances, transactions), and WebSocket connectivity using MSW (Mock Service Worker) for API mocking — no backend needed in CI.

## Development

Argus Monitor includes a `Makefile` with common development commands to streamline local workflows. All commands run via Docker Compose for consistency.

For a one-command local environment setup, run:

```bash
bash scripts/setup.sh
```

This checks prerequisites (Node.js >= 18, Docker running), installs npm dependencies, creates a `.env` file from `.env.example`, pulls Docker images, and runs Prisma migrations.

### Available Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all targets with descriptions |
| `make up` | Start all services in background (`docker compose up -d`) |
| `make down` | Stop all services (`docker compose down`) |
| `make migrate` | Run Prisma migrations (development — `migrate dev`) |
| `make migrate-prod` | Run Prisma migrations (production-style — `migrate deploy`) |
| `make seed` | Seed the database with test data |
| `make check` | TypeScript type-check (all apps) — runs inside Docker for consistency |
| `make test` | Run all workspace tests |
| `make test-local` | Full stack smoke test: reset stack, migrate, seed, health checks, type-check, unit tests |
| `make test-local-e2e` | Full stack smoke test + e2e tests (same as test-local, then runs e2e) |
| `make logs` | Tail all container logs |
| `make psql` | Open psql shell in postgres (requires running containers) |
| `make redis-cli` | Open redis-cli in redis (requires running containers) |
| `make reset` | Full reset: down -v, start infra, migrate, seed, start all |
| `make e2e-setup` | Install Playwright browsers (chromium) for E2E tests |
| `make e2e` | Run Playwright E2E tests (requires stack running — `make up`) |
| `bash scripts/setup.sh` | One-command local dev setup (prerequisites check, deps install, .env, migrations) |

### Quick Start

```bash
bash scripts/setup.sh   # one-command setup (prerequisites, deps, .env, migrations)
make up                  # start all services
make seed                # seed database
make check               # verify TypeScript compiles
make test-local          # full stack smoke test (health checks, type-check, unit tests)
```

### Full Stack Smoke Test

The `test-local` target provides a complete end-to-end validation of the stack:

1. **Reset stack** — `docker compose down -v` then starts `postgres` and `redis`
2. **Wait for databases** — polls `pg_isready` and `redis-cli ping` (up to 60s each)
3. **Migrations + seed** — `prisma migrate deploy` then `prisma db seed`
4. **Start all services** — `docker compose up -d`
5. **Health check polling** — polls all 5 services (api-service, chain-indexer, solana-adapter, alert-service, notification) on their health endpoints
6. **Type check** — `make check` (tsc --noEmit)
7. **Unit tests** — `make test`

```bash
make test-local          # 7-step smoke test
make test-local-e2e      # same as test-local, then runs e2e tests
```

Expected output on success:
```
==========================================
  ✅ PASS — All checks passed!
==========================================
```

Expected output on failure (e.g., a service doesn't start):
```
  ❌ FAIL: solana-adapter did not become healthy after 60 seconds
  <container logs tail>
```

### Full Reset

```bash
make reset       # tears down volumes, recreates infra, migrates, seeds, starts all
```

The `reset` target waits for PostgreSQL and Redis to become healthy before running migrations, ensuring a reliable one-command rebuild.

## Frontend

The frontend is a React 18 SPA built with Vite and Tailwind CSS, located at `apps/frontend/`.

### Tech Stack

- **Vite** — fast dev server and build tool
- **React 18** — UI library with functional components and hooks
- **TypeScript** — strict mode
- **Tailwind CSS** — utility-first CSS framework
- **React Router v6** — client-side routing with lazy-loaded routes
- **Socket.io Client** — real-time WebSocket connection with auto-reconnect
- **MSW (Mock Service Worker)** — API mocking for E2E tests (no backend needed in CI)

### Pages

- **Login** (`/login`) — email/password authentication form with validation
- **Register** (`/register`) — new user registration form
- **Dashboard** (`/dashboard`) — wallet list, balances, transactions, and alert rules management

### Development

```bash
cd apps/frontend
npm install
npm run dev          # starts Vite dev server on port 5173
```

The frontend expects the API service at `http://localhost:3000` (configurable via `VITE_API_URL`).

### E2E Tests

Playwright E2E tests are located in `apps/frontend/e2e/`. Use the Makefile targets for convenience:

```bash
make e2e-setup          # install Playwright Chromium browser (one-time)
make up                 # start the full stack
make e2e                # run Playwright E2E tests against the running stack
```

Or run manually:

```bash
cd apps/frontend
npm install
npx playwright install chromium
VITE_E2E_TEST=true npx playwright test
```

The E2E tests use MSW (Mock Service Worker) for API mocking — no backend required. Test coverage includes auth flow, wallet management, alert rules CRUD, wallet dashboard (balances, transactions), and WebSocket connectivity.

## Architecture

```
┌──────────────────┐
│   Frontend       │
│  (React SPA)     │
│  Vite + Tailwind │
│  Port 5173 (dev) │
│  Port 80 (prod)  │
└────────┬─────────┘
         │ HTTP / WebSocket
         ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  API Service │────▶│  PostgreSQL  │     │  Redis (BullMQ)  │
│  (port 3000) │     │  (port 5432) │     │  (port 6379)     │
└──────┬───────┘     └──────────────┘     └──────────────────┘
       │
       │ BullMQ Queue
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
┌────────────────┐              ┌──────────────────┐
│ Chain Indexer  │              │ Solana Adapter   │
│ (port 3001)    │              │ (port 3002)      │
└────────────────┘              └──────────────────┘
       │                                  │
       └──────────────┬───────────────────┘
                      ▼
             ┌──────────────────┐
             │ Alert Service    │
             │ (port 3003)      │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ Notification     │
             │ Service          │
             │ (port 3004)      │
             └──────────────────┘
```

## Services

### API Service (`apps/api-service/`)

The central API gateway. Handles authentication, wallet management, alert rules, and WebSocket connections.

- **Port:** 3000
- **Auth:** JWT-based with access tokens (15m) and httpOnly refresh token cookies (7d)
- **WebSocket:** Socket.io gateway for real-time wallet updates and alert triggers
- **Database:** PostgreSQL via Prisma ORM
- **Validation:** Global validation pipe with whitelist + type coercion
- **Error Handling:** Global exception filter with Prisma error mapping
- **Rate Limiting:** 100 req/60s global, 10 req/60s on auth endpoints

### Chain Indexer Service (`apps/chain-indexer-service/`)

BullMQ job scheduler that triggers periodic wallet balance and transaction fetching.

- **Port:** 3001
- **Queue:** BullMQ — schedules `solana:fetch` jobs for each tracked wallet

### Solana Adapter Service (`apps/solana-adapter-service/`)

Helius RPC integration with rate limiter, circuit breaker, and RPC health monitoring.

- **Port:** 3002
- **Rate Limiter:** Token bucket (configurable max RPS, retries, backoff)
- **Circuit Breaker:** Three-state (closed/open/half-open) with configurable thresholds
- **RPC Monitor:** Periodic health checks (latency, block height, status change events via RxJS)
- **Consumer:** BullMQ `solana:fetch` job consumer

### Alert Service (`apps/alert-service/`)

Evaluates alert rules against fetched blockchain data.

- **Port:** 3003
- **Rule Types:** Balance thresholds, transaction patterns, custom conditions
- **Queue:** BullMQ — consumes `alert:evaluate` jobs

### Notification Service (`apps/notification-service/`)

Dispatches triggered alerts via Telegram Bot API.

- **Port:** 3004
- **Channels:** Telegram (extensible for email, SMS, webhook)
- **Retry:** Exponential backoff (5 attempts, 2s initial delay)
- **Queue:** BullMQ — consumes `notification:send` jobs

## Packages

### `@argus/adapter-sdk` (`packages/adapter-sdk/`)

Published npm package providing a unified `ChainAdapter` interface for blockchain interactions.

- **Interface:** `getNativeBalance()`, `getTokenBalances()`, `getRecentTransactions()`, `checkRpcHealth()`
- **Implementation:** `SolanaAdapter` using `@solana/web3.js` and Helius RPC
- **Types:** All monetary amounts use `bigint` (never `number` or `float`)
- **Tests:** Interface contract tests + SolanaAdapter unit tests (14 tests)

### `@argus/shared-types` (`packages/shared-types/`)

Shared TypeScript types, enums, and constants used across all services.

- **Enums:** Queue names, job types, chain types
- **Types:** Job payload interfaces, shared DTOs

## Testing

### Backend Tests

```bash
npm test              # all unit tests (273 tests, 53 suites)
npm run test:cov      # with coverage (70% threshold)
npm run test:e2e      # E2E tests (requires PostgreSQL)
make test             # via Docker
make test-local       # full stack smoke test (Docker, health checks, type-check, tests)
make test-local-e2e   # full stack smoke test + e2e tests
```

### Frontend E2E Tests

Use the Makefile targets (see [E2E Tests](#e2e-tests) above):

```bash
make e2e-setup          # install Playwright Chromium browser (one-time)
make up                 # start the full stack
make e2e                # run Playwright E2E tests against the running stack
```

Or run manually:

```bash
cd apps/frontend
npm install
npx playwright install chromium
VITE_E2E_TEST=true npx playwright test
```

### Test Coverage by Service

- **api-service** (25 files): AuthService, WalletsService, AlertRulesService, ChainsService, PrismaService, JwtStrategy, JwtAuthGuard, WebSocket gateway, exception filter, validation pipe, prisma error handler, redact utility, AppModule, AuthController, WalletsController, AlertRulesController, E2E REST endpoints
- **solana-adapter-service** (11 files): SolanaAdapter (mocked Helius), SolanaConsumer, CircuitBreaker, RateLimiter, Config, RpcMonitorService (health checks, snapshots, status change events), AppModule, AppController, AppService, HealthController, BigInt arithmetic
- **alert-service** (6 files): AlertEngineService (all rule types), AppModule, AppController, AppService
- **notification-service** (6 files): TelegramService (send, format, error handling), NotificationConsumer (dispatch, retry, error handling), AppModule
- **chain-indexer-service** (5 files): AppController, AppService, HealthController, AppModule, queue name validation
- **adapter-sdk** (2 files): ChainAdapter interface contract tests, SolanaAdapter unit tests (14 tests)
- **frontend** (4 E2E spec files): Auth flow, wallet management, alert rules CRUD, WebSocket connectivity

## CI/CD

### Backend CI (`.github/workflows/test.yml`)

Runs on every PR to `develop` or `main`:
1. Spins up PostgreSQL 16 + Redis 7 service containers
2. Installs deps, generates Prisma client, runs migrations
3. TypeScript check (`tsc --noEmit`)
4. Lint check
5. Tests with coverage (70% threshold)
6. Uploads coverage artifacts

### Playwright E2E (`.github/workflows/playwright.yml`)

Runs on PRs touching `apps/frontend/`:
1. Installs dependencies
2. Installs Playwright browsers
3. Runs Playwright tests with MSW mocking (no backend needed)
4. Uploads Playwright report on failure

## Deployment

### Docker Compose (Local / Self-Hosted)

```bash
# Development
bash scripts/setup.sh   # one-command setup (creates .env from .env.example)
make up                  # start all services
make test-local          # validate the stack

# Production
cp .env.production.example .env   # create production env file
# Edit .env with your secrets, then:
docker compose -f docker-compose.prod.yml up -d
```

### Kubernetes (Production)

Helm charts are available in `k8s/apps/` for each service. See the [self-hosting guide](docs/self-hosting.md) for detailed deployment instructions.

## Environment Variables

### Development

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# Edit .env with your HELIUS_API_KEY, JWT_SECRET, etc.
```

See `.env.example` for a complete list of all variables with documentation.

### Production

Copy `.env.production.example` to `.env` and fill in your values:

```bash
cp .env.production.example .env
# Edit .env with production values (secrets, domains, etc.)
```

See `.env.production.example` for a complete list of all production variables with documentation.

## Contributing

1. Branch from `develop`: `git checkout -b feature/issue-{number}-{description} develop`
2. Make changes and test locally: `make test-local`
3. Open a PR to `develop`
4. Ensure CI passes

## License

MIT
