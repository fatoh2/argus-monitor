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
- **Local dev**: docker-compose.yml, Makefile (see `make help`)

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
    src/config/             Helius, Redis, rate limiter, circuit breaker config
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

## Testing

### Running Backend Tests
```bash
npm test              # all unit tests (232 tests, 37 suites)
npm run test:cov      # with coverage (70% threshold)
npm run test:e2e      # E2E tests (requires PostgreSQL)
make test             # via Docker
```

### Frontend Jest Config
The frontend at `apps/frontend/jest.config.cjs` prevents Jest from picking up Playwright E2E tests:
- Uses a non-existent `testMatch` pattern (`__non_existent__`) so Jest ignores all frontend files
- The `.cjs` extension is required because the frontend's `package.json` has `"type": "module"`
- Playwright E2E tests in `apps/frontend/e2e/` are run separately via `npx playwright test`

### Running Frontend E2E Tests
```bash
cd apps/frontend
npm install
npx playwright install chromium
VITE_E2E_TEST=true npx playwright test
```

### Test Coverage by Service
- **api-service** (15 files): AuthService, WalletsService, AlertRulesService, ChainsService, PrismaService, JwtStrategy, JwtAuthGuard, WebSocket gateway, exception filter, validation pipe, prisma error handler, redact utility, E2E REST endpoints
- **solana-adapter-service** (5 files): SolanaAdapter (mocked Helius), SolanaConsumer, CircuitBreaker, RateLimiter, Config
- **alert-service** (3 files): AlertEngineService (all rule types)
- **notification-service** (5 files): TelegramService (send, format, error handling), NotificationConsumer (dispatch, retry, error handling)
- **chain-indexer-service** (3 files): AppController, AppService, HealthController
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
1. Installs dependencies (`npm ci`)
2. Installs Playwright Chromium browser
3. Generates MSW service worker
4. Runs Playwright tests with `VITE_E2E_TEST=true`
5. Uploads Playwright report as artifact

## Frontend Details

The frontend is a React 18 SPA at `apps/frontend/` built with Vite and Tailwind CSS.

### Pages
| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Email/password login with form validation |
| Register | `/register` | User registration with form validation |
| Dashboard | `/dashboard` | Wallet dashboard with wallet list, SOL/SPL balances, recent transactions table, alert rules CRUD, and Socket.io live updates |

### WalletDashboard Component

The dashboard is powered by `WalletDashboard` (`apps/frontend/src/components/WalletDashboard.tsx`):
- **Wallet list** with add/remove, chain badges, truncated addresses
- **SOL balance** displayed as ◎ with lamports formatted via BigInt
- **SPL token balances** (USDC, mSOL) with amounts and USD values
- **Recent transactions table** with type, amount, signature, status badge, relative time
- **Socket.io live updates** — connects with JWT auth token, handles `wallet_update`, `balance_update`, `new_transaction` events with animated notification banner
- **MSW mocks** for `/api/balances`, `/api/wallets/:id/balances`, `/api/transactions`, `/api/wallets/:id/transactions`
- All monetary amounts stored as strings (lamports), never floats

### E2E Test Scenarios
- **Auth flow**: register, login, logout, invalid login, unauthenticated redirect
- **Wallet flow**: add Solana/ETH wallet, view balances, delete wallet, empty state
- **Alert rules**: create balance_low/high/transaction rules, verify in list, empty state
- **WebSocket**: connection handling, graceful disconnection, live wallet/balance/transaction updates (uses `transactions-section` test ID)

### MSW Handlers
All API endpoints are mocked in `apps/frontend/src/mocks/handlers.ts` for E2E testing:
- Auth: register, login, logout, me, refresh
- Wallets: create, list, get, delete
- Alert rules: create, list, get, delete
- WebSocket: connection events

### Running Locally
```bash
cd apps/frontend
npm install
npm run dev          # Vite dev server on port 5173
npm run build        # Production build to apps/frontend/dist/
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

**Exception handling:**
- **HttpException** — passes through the original status code and message
- **PrismaClientKnownRequestError** — mapped to HTTP status codes:
  - `P2002` (unique constraint) → `409 Conflict` with message `"Resource already exists."`
  - `P2025` (record not found) → `404 Not Found` with message `"Resource not found."`
  - `P2003` (foreign key constraint) → `400 Bad Request` with message `"Invalid foreign key."`
  - Other Prisma errors → `500 Internal Server Error` with message `"Internal server error"`
- **All other exceptions** → `500 Internal Server Error` with message `"Internal server error"`

**Production behavior** (`NODE_ENV=production`):
- Response body: `{ statusCode, message }` only — NO stack trace, NO timestamp, NO path
- Internal server errors always return generic `"Internal server error"` message

**Development behavior** (any other `NODE_ENV`):
- Response body includes `timestamp`, `path`, and `stack` fields for debugging

**Source:** `apps/api-service/src/common/filters/all-exceptions.filter.ts`

### Prisma Error Handling
All repository methods wrap Prisma calls with `try/catch` using the shared `handlePrismaError()` utility at `apps/api-service/src/common/prisma-error.handler.ts`:

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
- **Auto-reconnect:** The frontend Socket.io client reconnects automatically with exponential backoff
