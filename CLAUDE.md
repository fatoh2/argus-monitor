# argus-monitor — Application Agent Rules

## Role
You build and maintain the Argus Monitor SaaS: a blockchain monitoring platform
with a NestJS backend, React frontend, and BullMQ-based job pipeline.

## Stack
- **Backend**: NestJS + TypeScript (strict mode)
- **Frontend**: React + TypeScript + Tailwind CSS + Socket.io + MSW
- **Database**: PostgreSQL via Prisma
- **Queue**: Redis + BullMQ
- **Real-time**: NestJS WebSocket Gateway + Socket.io
- **Chain**: Solana via Helius API + @solana/web3.js
- **Testing**: Jest + ts-jest + supertest (backend), Playwright (E2E)
- **CI**: GitHub Actions (test.yml — PostgreSQL + Redis services on every PR; playwright.yml — E2E on frontend changes)
- **Local dev**: docker-compose.yml, Makefile (see `make help`), scripts/setup.sh (one-command setup)

## Repo Structure
```
apps/
  frontend/                 React SPA (Vite + React 18 + Tailwind)
    e2e/                    Playwright E2E tests (auth, wallets, alert rules, WebSocket)
    src/
      components/           Shared UI components (Layout, WalletDashboard)
      hooks/                Custom React hooks (useAuth)
      mocks/                MSW handlers for E2E testing (auth, wallets, balances, transactions)
      pages/                Page components (Login, Register, Dashboard)
      services/             API client (types: Wallet, WalletBalance, TokenBalance, Transaction) and WebSocket service
    jest.config.cjs         Jest config — excludes e2e dir from Jest
  api-service/              NestJS — auth, wallets, alert rules, WebSocket gateway
    src/common/logger/      Redaction utility (redact.ts) — masks secrets/PII in logs
    src/common/prisma-error.handler.ts  Shared Prisma error handler — maps P2002→409, P2025→404, P2003→400
    src/auth/__tests__/auth.controller.spec.ts  Auth controller integration tests (rate limiting via supertest)
    test/app.e2e-spec.ts    E2E integration tests (supertest) for all REST endpoints
  chain-indexer-service/    BullMQ job scheduler
  solana-adapter-service/   Helius RPC, rate limiter, circuit breaker
    src/adapter/            SolanaAdapter (ChainAdapter impl)
    src/rate-limiter/       Token bucket rate limiter
    src/circuit-breaker/    Three-state circuit breaker
    src/consumer/           BullMQ solana:fetch consumer
    src/config/             Helius, Redis, rate limiter, circuit breaker, RPC monitor config
    src/rpc-monitor/        Periodic RPC health checks (latency, block height, status change events)
  alert-service/            Alert rule evaluation engine
  notification-service/     Telegram bot notifications
packages/
  adapter-sdk/              Published as @argus/adapter-sdk on npm
    src/                    ChainAdapter interface, types, SolanaAdapter impl
    src/__tests__/          ChainAdapter interface contract tests
    src/solana/             SolanaAdapter (Helius RPC via @solana/web3.js)
    src/solana/__tests__/   SolanaAdapter unit tests (14 tests)
  shared-types/             Enums, queue names, job payload types
k8s/apps/                   Helm charts for all services
.github/workflows/
  test.yml                  Backend CI — PostgreSQL + Redis on every PR
  playwright.yml            Frontend E2E — Playwright tests on frontend changes
jest.config.js              Root Jest config with project references for all 5 apps
docker-compose.yml          Local dev — all services + PostgreSQL + Redis (env_file pattern)
docker-compose.prod.yml     Self-hosted production
Makefile                    Dev commands (up, down, migrate, seed, test, check, reset, test-local, test-local-e2e)
```

## Testing

### Running Backend Tests
```bash
npm test              # all unit tests (273 tests, 53 suites)
npm run test:cov      # with coverage (70% threshold)
npm run test:e2e      # E2E tests (requires PostgreSQL)
make test             # via Docker
make test-local       # full stack smoke test: reset, health checks, type-check, unit tests
make test-local-e2e   # full stack smoke test + e2e tests
```

### Frontend Jest Config
The frontend at `apps/frontend/jest.config.cjs` prevents Jest from picking up Playwright E2E tests:
- Uses a non-existent `testMatch` pattern (`__non_existent__`) so Jest ignores all frontend files
- The `.cjs` extension is required because the frontend's `package.json` has `"type": "module"`
- Playwright E2E tests in `apps/frontend/e2e/` are run separately via `npx playwright test`

### Running Frontend E2E Tests

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

### CI Pipelines

**Backend CI (`.github/workflows/test.yml`)** — runs on every PR to `develop` or `main`:
1. Spins up PostgreSQL 16 + Redis 7 service containers
2. Installs deps, generates Prisma client, runs migrations
3. TypeScript check (`tsc --noEmit`)
4. Lint check
5. Tests with coverage (70% threshold)
6. Uploads coverage artifacts

**Playwright E2E (`.github/workflows/playwright.yml`)** — runs on PRs touching `apps/frontend/`:
1. Installs dependencies
2. Installs Playwright browsers
3. Runs Playwright tests with MSW mocking (no backend needed)
4. Uploads Playwright report on failure

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make help` | Show all targets with descriptions |
| `make up` | Start all services in background |
| `make down` | Stop all services |
| `make migrate` | Run Prisma migrations (development) |
| `make migrate-prod` | Run Prisma migrations (production-style) |
| `make seed` | Seed the database |
| `make check` | TypeScript type-check (all apps) — mounts source dirs as volumes |
| `make test` | Run all workspace tests |
| `make test-local` | Full stack smoke test: reset, health checks, type-check, unit tests |
| `make test-local-e2e` | Full stack smoke test + e2e tests |
| `make logs` | Tail all container logs |
| `make psql` | Open psql shell in postgres |
| `make redis-cli` | Open redis-cli in redis |
| `make reset` | Full reset: down -v, start infra, migrate, seed, start all |
| `make e2e-setup` | Install Playwright browsers (chromium) for E2E tests |
| `make e2e` | Run Playwright E2E tests (requires stack running) |

## Verification Before Push

Before pushing any code, run:
```bash
make check           # tsc --noEmit — must exit 0
make test            # unit tests — must exit 0
make test-local      # full stack smoke test — must exit 0
```

If `make test-local` fails, fix the issue before opening a PR.
