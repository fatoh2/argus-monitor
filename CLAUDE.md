# argus-monitor — Application Agent Rules

## Role
You build and maintain the Argus Monitor SaaS: a blockchain monitoring platform
with a NestJS backend, React frontend, and BullMQ-based job pipeline.

## Stack
- **Backend**: NestJS + TypeScript (strict mode)
- **Frontend**: React + TypeScript + Tailwind CSS + TanStack Query + Recharts + Socket.io
- **Database**: PostgreSQL via Prisma
- **Queue**: Redis + BullMQ
- **Real-time**: NestJS WebSocket Gateway + Socket.io
- **Chain**: Solana via Helius API + @solana/web3.js
- **Testing**: Jest + ts-jest + supertest (backend), Playwright (E2E)
- **CI**: GitHub Actions (test.yml — PostgreSQL + Redis services on every PR)
- **Local dev**: docker-compose.yml, Makefile (see `make help`)

## Repo Structure
```
apps/
  frontend/                 React app
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
  test.yml                  CI pipeline — runs on every PR (PostgreSQL + Redis services)
jest.config.js              Root Jest config with project references for all 5 apps
docker-compose.yml          Local dev — all services + PostgreSQL + Redis (env_file pattern)
docker-compose.prod.yml     Self-hosted production
Makefile                    Dev commands (up, down, migrate, seed, test, check, reset)
```

## Testing

### Running Tests
```bash
npm test              # all unit tests (228 tests, 36 suites)
npm run test:cov      # with coverage (70% threshold)
npm run test:e2e      # E2E tests (requires PostgreSQL)
make test             # via Docker
```

### Test Coverage by Service
- **api-service** (15 files): AuthService, WalletsService, AlertRulesService, ChainsService, PrismaService, JwtStrategy, JwtAuthGuard, WebSocket gateway, exception filter, validation pipe, prisma error handler, redact utility, E2E REST endpoints
- **solana-adapter-service** (5 files): SolanaAdapter (mocked Helius), SolanaConsumer, CircuitBreaker, RateLimiter, Config
- **alert-service** (3 files): AlertEngineService (all rule types)
- **notification-service** (4 files): TelegramService (send, format, error handling)
- **chain-indexer-service** (3 files): AppController, AppService, HealthController

### CI Pipeline
The `.github/workflows/test.yml` workflow runs on every PR to `develop` or `main`:
1. Spins up PostgreSQL 16 + Redis 7 service containers
2. Installs deps, generates Prisma client, runs migrations
3. TypeScript check (`tsc --noEmit`)
4. Lint check
5. Tests with coverage (70% threshold)
6. Uploads coverage artifacts

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
| Other Prisma errors | `500 Internal Server Error` | `"Internal server error"`

### Rate Limiting
Rate limiting is applied globally and per-endpoint using `@nestjs/throttler`:

| Scope | Limit | TTL | Exemptions |
|-------|-------|-----|------------|
| Global (all endpoints) | 100 requests | 60 seconds | — |
| Auth endpoints | 10 requests | 60 seconds | — |
| Health endpoint | Unlimited | — | Exempt via `@SkipThrottle()` |

Rate limiting is validated by an integration test (`auth.controller.spec.ts`) that proves the `@Throttle()` decorator enforces the 10-request cap through the full NestJS HTTP pipeline.

### Secret Redaction
All log calls use NestJS `Logger` (not `console.log`). The `redact()` utility at `apps/api-service/src/common/logger/redact.ts` masks passwords, tokens, API keys, and PII before logging. A linting test (`log-secrets-lint.spec.ts`) enforces no secret env vars in log calls.

## Environment Variables

See [docs/self-hosting.md](docs/self-hosting.md) for the full reference of all environment variables.
