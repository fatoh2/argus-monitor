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
- **Solana Blockchain Adapter** — Helius RPC integration with rate limiter & circuit breaker
- **Strict Input Validation** — all endpoints validate input with whitelist (unknown props rejected) + type coercion (string to number for query params)
- **Health Checks** — `/api/health` endpoint for all services
- **Global Exception Filter** — In production, unhandled errors return only `{statusCode, message}` (no stack traces, timestamp, or path). In development, responses include `timestamp`, `path`, and `stack` for debugging. Prisma errors are mapped to specific HTTP status codes: `P2002` (unique constraint) to 409 Conflict, `P2025` (record not found) to 404 Not Found, `P2003` (foreign key constraint) to 400 Bad Request, and other unexpected Prisma errors to 500 Internal Server Error. The filter extends `BaseExceptionFilter` from `@nestjs/core` and is registered via `HttpAdapterHost` in `main.ts`.
- **Rate Limiting** — global 100 req/60s per IP, stricter 10 req/60s on auth endpoints, health endpoint exempt. Auth rate limiting validated via supertest integration test (`auth.controller.spec.ts`) that proves the `@Throttle()` decorator enforces the 10-request cap through the full NestJS HTTP pipeline.
- **Secret Redaction** — all log calls use NestJS `Logger` (not `console.log`); a `redact()` utility masks passwords, tokens, API keys, and PII before logging; a linting test (`log-secrets-lint.spec.ts`) enforces no secret env vars in log calls
- **Prisma Error Handling** — all repository methods wrap Prisma calls with `try/catch` using a shared `handlePrismaError()` utility that maps `P2002` (unique constraint) → 409, `P2025` (not found) → 404, `P2003` (foreign key) → 400, and unexpected errors → 500
- **Comprehensive Test Suite** — 232 unit + integration tests across all 5 microservices (37 test suites), with 70% coverage threshold enforced via Jest project references. CI pipeline runs tests with PostgreSQL + Redis on every PR.
- **Playwright E2E Tests** — browser-based end-to-end tests for auth flow, wallet management, alert rules CRUD, wallet dashboard (balances, transactions), and WebSocket connectivity using MSW (Mock Service Worker) for API mocking — no backend needed in CI.

## Development

Argus Monitor includes a `Makefile` with common development commands to streamline local workflows. All commands run via Docker Compose for consistency.

### Available Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all targets with descriptions |
| `make up` | Start all services in background (`docker compose up -d`) |
| `make down` | Stop all services (`docker compose down`) |
| `make migrate` | Run Prisma migrations (development — `migrate dev`) |
| `make migrate-prod` | Run Prisma migrations (production-style — `migrate deploy`) |
| `make seed` | Seed the database with test data |
| `make check` | TypeScript type-check (api-service) |
| `make test` | Run all workspace tests |
| `make logs` | Tail all container logs |
| `make psql` | Open psql shell in postgres (requires running containers) |
| `make redis-cli` | Open redis-cli in redis (requires running containers) |
| `make reset` | Full reset: down -v, start infra, migrate, seed, start all |

### Quick Start

```bash
make up          # start all services
make migrate     # run migrations
make seed        # seed database
make check       # verify TypeScript compiles
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
- **React Router DOM v6** — client-side routing
- **Socket.io Client** — real-time WebSocket connection with auto-reconnect
- **MSW (Mock Service Worker)** — API mocking for E2E tests

### Components

| Component | File | Description |
|-----------|------|-------------|
| WalletDashboard | `src/components/WalletDashboard.tsx` | Wallet list with add/remove, SOL balance (◎ lamports via BigInt), SPL token balances with USD values, recent transactions table, Socket.io live updates with animated notification banner |

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Email/password login with form validation |
| Register | `/register` | User registration with form validation |
| Dashboard | `/dashboard` | Renders WalletDashboard — wallet management (add/delete), balances, transactions, Socket.io live updates |

### API Client Types

The frontend API client at `src/services/api.ts` defines these types for the wallet dashboard:

| Type | Fields | Description |
|------|--------|-------------|
| `TokenBalance` | `mint`, `symbol`, `amount` (string), `decimals`, `usdValue?` | SPL token balance — amount stored as string (lamports) to avoid float issues |
| `WalletBalance` | `walletId`, `address`, `chain`, `solBalance` (string), `tokens` (TokenBalance[]), `updatedAt` | Wallet balance with SOL and SPL tokens |
| `Transaction` | `id`, `walletId`, `signature`, `type` (send/receive/swap/other), `amount` (string), `symbol`, `fee`, `timestamp`, `status` (confirmed/pending/failed) | On-chain transaction record |

### API Clients

| Client | Methods | Endpoints |
|--------|---------|-----------|
| `balancesApi` | `findAll()`, `findByWalletId(id)` | `GET /api/balances`, `GET /api/wallets/:id/balances` |
| `transactionsApi` | `findAll()`, `findByWalletId(id)` | `GET /api/transactions`, `GET /api/wallets/:id/transactions` |

### Socket.io Events

The frontend connects to the WebSocket gateway with JWT auth token and handles these events:

| Event | Payload | Behavior |
|-------|---------|----------|
| `wallet_update` | `{ walletId, type }` | Shows notification banner, refetches all data |
| `balance_update` | `{ walletId, solBalance }` | Shows notification banner, optimistically updates balance in state |
| `new_transaction` | `Transaction` object | Shows notification banner with amount and symbol, prepends transaction to list |

### Running the Frontend

```bash
cd apps/frontend
npm install
npm run dev          # starts Vite dev server on port 5173
```

The frontend expects the API service at `http://localhost:3000` (configurable via `VITE_API_URL` env var). WebSocket URL is configurable via `VITE_WS_URL` — defaults to same host.

### Building for Production

```bash
cd apps/frontend
npm run build        # outputs to apps/frontend/dist/
```

## Testing

Argus Monitor has a comprehensive test suite with **232 tests across 37 suites** covering all 5 microservices, plus Playwright E2E tests for the frontend.

### Running Backend Tests

```bash
npm test              # run all unit tests (232 tests, 37 suites)
npm run test:cov      # run with coverage (70% threshold enforced)
npm run test:e2e      # run E2E integration tests (requires PostgreSQL)
```

Tests can also be run via Docker for consistency:

```bash
make test             # runs `npm test` inside the api-service container
```

### Running Frontend E2E Tests

```bash
cd apps/frontend
npm install
npx playwright install chromium
VITE_E2E_TEST=true npx playwright test
```

The E2E tests use MSW (Mock Service Worker) to mock all API responses — no backend or database needed. Tests cover:

- **Auth flow**: register, login, logout, invalid login, unauthenticated redirect
- **Wallet flow**: add Solana/ETH wallet, view balances, delete wallet, empty state
- **Alert rules**: create balance_low/high/transaction rules, verify in list, empty state
- **WebSocket**: connection handling, graceful disconnection, live update events

### Test Coverage by Service

| Service | Test Files | What's Tested |
|---------|-----------|---------------|
| **api-service** | 15 test files | AuthService, WalletsService, AlertRulesService, ChainsService, PrismaService, JwtStrategy, JwtAuthGuard, WebSocket gateway, exception filter, validation pipe, prisma error handler, redact utility, E2E REST endpoints |
| **solana-adapter-service** | 5 test files | SolanaAdapter (all methods with mocked Helius), SolanaConsumer (process, events), CircuitBreaker, RateLimiter, Config |
| **alert-service** | 3 test files | AlertEngineService (all rule types: balance_low, balance_high, transaction_from, transaction_to, token_volume) |
| **notification-service** | 5 test files | TelegramService (send, format, error handling), NotificationConsumer (dispatch, retry, error handling) |
| **chain-indexer-service** | 3 test files | AppController, AppService, HealthController |

### CI Pipelines

Two GitHub Actions workflows run on every PR:

**Backend CI (`.github/workflows/test.yml`)** — runs on every PR to `develop` or `main`:
1. Spins up PostgreSQL 16 and Redis 7 as service containers
2. Installs dependencies (`npm ci`)
3. Generates Prisma client and runs migrations
4. Runs TypeScript check (`tsc --noEmit`)
5. Runs lint check
6. Runs all tests with coverage (70% threshold)
7. Uploads coverage reports as artifacts

**Playwright E2E (`.github/workflows/playwright.yml`)** — runs on PRs touching `apps/frontend/`:
1. Installs dependencies (`npm ci`)
2. Installs Playwright Chromium browser
3. Generates MSW service worker
4. Runs Playwright tests with `VITE_E2E_TEST=true`
5. Uploads Playwright report as artifact

### Test Infrastructure

- **Root `jest.config.js`** — project references for all 5 apps with 70% global coverage threshold
- **`apps/frontend/playwright.config.ts`** — Playwright config with Chromium, HTML reporter, and Vite dev server auto-start
- **`apps/frontend/src/mocks/handlers.ts`** — MSW handlers for all API endpoints (auth, wallets, alert rules, balances, transactions, WebSocket)

## Project Structure

```
apps/
  frontend/                 React SPA (Vite + React 18 + Tailwind)
    e2e/                    Playwright E2E tests
    src/
      components/           Shared UI components (Layout, WalletDashboard)
      hooks/                Custom React hooks (useAuth)
      mocks/                MSW handlers for E2E testing
      pages/                Page components (Login, Register, Dashboard)
      services/             API client and WebSocket service
    jest.config.cjs         Jest config — excludes e2e dir from Jest
  api-service/              NestJS — auth, wallets, alert rules, WebSocket gateway
    src/common/logger/      Redaction utility (redact.ts) — masks secrets/PII in logs
    src/common/prisma-error.handler.ts  Shared Prisma error handler
    src/auth/__tests__/auth.controller.spec.ts  Auth controller integration tests
    test/app.e2e-spec.ts    E2E integration tests (supertest) for all REST endpoints
  chain-indexer-service/    BullMQ job scheduler
  solana-adapter-service/   Helius RPC, rate limiter, circuit breaker
  alert-service/            Alert rule evaluation engine
  notification-service/     Telegram bot notifications
packages/
  chain-adapter-sdk/        Published as @argus/adapter-sdk on npm
  shared-types/             Enums, queue names, job payload types, ChainAdapter interface
k8s/apps/                   Helm charts for all services
.github/workflows/
  test.yml                  Backend CI — PostgreSQL + Redis on every PR
  playwright.yml            Frontend E2E — Playwright tests on frontend changes
jest.config.js              Root Jest config with project references for all 5 apps
docker-compose.yml          Local dev — all services + PostgreSQL + Redis (env_file pattern)
docker-compose.prod.yml     Self-hosted production
Makefile                    Dev commands (up, down, migrate, seed, test, check, reset)
```

## API Service Details

The `api-service` (port 3000) is the primary HTTP API. All endpoints use `/api` prefix.

### Auth (public, except /me)
- `POST /api/auth/register` — register with email + password (bcrypt, 12 rounds). Returns `{accessToken, user}`, sets `refresh_token` httpOnly cookie
- `POST /api/auth/login` — login. Returns `{accessToken, user}`, sets `refresh_token` httpOnly cookie
- `POST /api/auth/refresh` — reads refresh token from `refresh_token` httpOnly cookie, verifies it, returns new `{accessToken, user}`, rotates refresh cookie
- `POST /api/auth/logout` — revokes refresh token server-side (stores `jti` in `RevokedToken` table), clears `refresh_token` cookie
- `POST /api/auth/me` — get current user profile (JWT protected, `JwtAuthGuard`)

**Token TTLs:**
- Access token: 15 minutes (hardcoded `15m`)
- Refresh token: 7 days (hardcoded `7d`), includes `jti` (UUID) for revocation support

**Cookie config for refresh_token:**
- `httpOnly: true` — not accessible via JavaScript
- `secure: true` in production (HTTPS only)
- `sameSite: 'strict'` — CSRF protection
- `path: '/api/auth'` — scoped to auth endpoints
- `maxAge: 7 days`

### Wallets (JWT required, JwtAuthGuard)
- `POST /api/wallets` — add wallet `{address, chain: "SOLANA"|"ETHEREUM"}`
- `GET /api/wallets` — list user's wallets
- `GET /api/wallets/:id` — get single wallet (UUID)
- `DELETE /api/wallets/:id` — delete wallet

### Balances (JWT required, JwtAuthGuard)
- `GET /api/balances` — list balances for all user's wallets (includes SOL balance in lamports and SPL token balances)
- `GET /api/wallets/:id/balances` — get balance for a specific wallet

### Transactions (JWT required, JwtAuthGuard)
- `GET /api/transactions` — list recent transactions for all user's wallets
- `GET /api/wallets/:id/transactions` — get transactions for a specific wallet

### Alert Rules (JWT required, JwtAuthGuard)
- `POST /api/alert-rules` — create rule `{walletId, chain, type, threshold?}`
- `GET /api/alert-rules` — list user's rules
- `GET /api/alert-rules/:id` — get single rule (UUID)
- `DELETE /api/alert-rules/:id` — delete rule

**Alert rule types:** `balance_low`, `balance_high`, `transaction_from`, `transaction_to`

### Chains (admin — no auth guard yet)
- `POST /api/chains` — create chain `{name, rpcUrl}`
- `GET /api/chains` — list all chains
- `GET /api/chains/:id` — get single chain (UUID)
- `DELETE /api/chains/:id` — delete chain

### Global Exception Filter
The api-service registers a global `AllExceptionsFilter` in `main.ts` that catches all unhandled exceptions. The filter extends `BaseExceptionFilter` from `@nestjs/core` and is registered via `HttpAdapterHost`:

```typescript
// main.ts
const { httpAdapter } = app.get(HttpAdapterHost);
app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
```

**Production response format** (NODE_ENV=production):
```json
{ "statusCode": 500, "message": "Internal server error" }
```

**Development response format** (NODE_ENV=development):
```json
{ "statusCode": 500, "message": "Internal server error", "timestamp": "2024-01-15T10:30:00.000Z", "path": "/api/wallets", "stack": "Error: ..." }
```

**Prisma error mapping** (applied both globally and per-method via `handlePrismaError()`):

| Prisma Error | HTTP Status | Message |
|---|---|---|
| `P2002` (unique constraint) | `409 Conflict` | `"Resource already exists."` |
| `P2025` (record not found) | `404 Not Found` | `"Resource not found."` |
| `P2003` (foreign key) | `400 Bad Request` | `"Invalid foreign key."` |
| Other Prisma errors | `500 Internal Server Error` | `"Internal server error"` |

**Source:** `apps/api-service/src/common/prisma-error.handler.ts`

### Rate Limiting
Rate limiting is applied globally and per-endpoint using `@nestjs/throttler`:

- **Global:** 100 requests per 60 seconds per IP
- **Auth endpoints:** 10 requests per 60 seconds per IP (`@Throttle({ default: { limit: 10, ttl: 60000 } })`)
- **Health endpoint:** exempt from rate limiting (`@SkipThrottle()`)
- Rate limiting is validated via supertest integration test (`auth.controller.spec.ts`)

### Secret Redaction
All log calls use NestJS `Logger` (not `console.log`). A `redact()` utility at `apps/api-service/src/common/logger/redact.ts` masks passwords, tokens, API keys, and PII before logging. A linting test (`log-secrets-lint.spec.ts`) enforces no secret env vars in log calls.

### Validation
All DTOs use `class-validator` with `whitelist: true` (strips unknown properties) and `transform: true` (coerces types like string → number for query params). The validation pipe is registered globally in `main.ts`.

### WebSocket Gateway
The WebSocket gateway at `apps/api-service/src/ws/ws.gateway.ts` provides real-time updates:

- **Namespace:** `/ws`
- **Authentication:** JWT token sent as `auth.token` in the connection handshake
- **Events emitted:**
  - `wallet:updated` — wallet balance change notification
  - `alert:triggered` — alert rule triggered notification
- **Events received (frontend → backend):**
  - `wallet_update` — wallet added/removed/updated
  - `balance_update` — SOL or token balance changed
  - `new_transaction` — new on-chain transaction detected
- **Auto-reconnect:** The frontend Socket.io client reconnects automatically with exponential backoff

## Deployment

See [docs/self-hosting.md](docs/self-hosting.md) for production deployment instructions.
