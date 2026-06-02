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
- **Testing**: Jest + Testcontainers (backend), Playwright (E2E)
- **Local dev**: docker-compose.yml

## Repo Structure
```
apps/
  frontend/                 React app
  api-service/              NestJS — auth, wallets, alert rules, WebSocket gateway
    src/common/logger/      Redaction utility (redact.ts) — masks secrets/PII in logs
    src/common/prisma-error.handler.ts  Shared Prisma error handler — maps P2002→409, P2025→404, P2003→400
    src/auth/__tests__/auth.controller.spec.ts  Auth controller integration tests (rate limiting via supertest)
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
docker-compose.yml          Local dev — all services + PostgreSQL + Redis (env_file pattern)
docker-compose.prod.yml     Self-hosted production
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
| Other Prisma errors | `500 Internal Server Error` | `"Internal server error"` (logged with full context) |


**Source:** `apps/api-service/src/common/prisma-error.handler.ts`

### Rate Limiting
- Global: 100 requests per 60 seconds per IP (NestJS `@nestjs/throttler`)
- Auth endpoints: 10 requests per 60 seconds per IP (`@Throttle({ default: { limit: 10, ttl: 60000 } })`)
- Health endpoint: exempt from rate limiting (`@SkipThrottle()`)
- Rate limiting is validated via supertest integration test (`auth.controller.spec.ts`)

### Secret Redaction
All log calls use NestJS `Logger` (not `console.log`). A `redact()` utility at `apps/api-service/src/common/logger/redact.ts` masks passwords, tokens, API keys, and PII before logging. A linting test (`log-secrets-lint.spec.ts`) enforces no secret env vars in log calls.

## Solana Adapter Service Details

The `solana-adapter-service` (port 3002) connects to the Solana blockchain via Helius RPC.

### SolanaAdapter
Implements `ChainAdapter` from `@argus/shared-types`. Uses `@solana/web3.js` Connection class.

### Rate Limiter
Token bucket algorithm. Configurable via `config/configuration.ts`:
- `tokensPerInterval`: number of requests allowed per interval
- `interval`: time window in milliseconds
- `maxTokens`: maximum burst capacity

### Circuit Breaker
Three-state circuit breaker (CLOSED / OPEN / HALF_OPEN):
- **CLOSED**: normal operation, requests pass through
- **OPEN**: failures exceed threshold, requests are rejected immediately
- **HALF_OPEN**: after cooldown, a single test request is allowed
- Failure threshold and cooldown period are configurable

### Consumer
BullMQ consumer for the `solana:fetch` queue. Processes wallet fetch jobs by calling `SolanaAdapter` methods.

## Testing
- Backend: Jest with `--passWithNoTests` flag
- E2E: supertest for HTTP endpoint testing
- Run tests: `npm test` (root) or `npx jest` (per service)
- Coverage: `npm run test:cov`

## Docker
- Local dev: `docker compose up -d` (uses docker-compose.yml)
- Production: `docker compose -f docker-compose.prod.yml up -d`
- Build: `docker compose build`

## Critical Data Rules
- **NEVER** store on-chain amounts as `float` or `decimal` — always `BIGINT`
  - Solana: lamports (1 SOL = 1_000_000_000 lamports)
  - EVM: wei (1 ETH = 1_000_000_000_000_000_000 wei)
  - Store `asset_decimals` separately for display
- **NEVER** run `prisma migrate deploy` on production — migrations run in CI only
- **Seed data** (`apps/api-service/prisma/seed.ts`) creates test user `test@argusmonitor.io` / `testpassword123`, 3 Solana devnet wallets, and 2 alert rules. Run with `cd apps/api-service && npx prisma db seed`. Clears existing data first — safe for local dev only.
- **ALWAYS** validate Solana addresses with `new PublicKey(address)` before storing
- **ALWAYS** store `wallet_balance_snapshots` (time-series) not a single balance row
  - Index: `(wallet_id, captured_at DESC)` for chart queries

## Service Communication Rules
- Services communicate via **BullMQ queues only** — no direct HTTP between services
- Queue names are defined in `packages/shared-types/src/queues/index.ts` — never hardcode
- The chain-indexer pushes jobs → solana-adapter consumes them
- solana-adapter writes to DB → alert-service reads via BullMQ or Postgres LISTEN

## Non-Negotiable Rules
- **NEVER** push directly to `main` or `develop` — always open a PR
- **NEVER** log secrets, tokens, or PII. Use the `redact()` utility (`apps/api-service/src/common/logger/redact.ts`) to mask sensitive data before logging. A linting test (`log-secrets-lint.spec.ts`) scans all source files for log calls referencing secret env vars and enforces this policy.
- **NEVER** commit `.env` files or API keys
- **NEVER** mock the database in integration tests — use Testcontainers (PostgreSQL + Redis)
- **NEVER** make direct HTTP calls between services — always BullMQ
- **NEVER** use `any` type in TypeScript
- **ALWAYS** write unit tests for: adapter methods, alert rule logic, data normalization
- **ALWAYS** add `/metrics` Prometheus endpoint to every new NestJS service
- **ALWAYS** run `npx prisma validate` before committing schema changes
- **ALWAYS** run `npm test` before opening a PR
- **ALWAYS** run `npm run build` — no TypeScript compilation errors allowed

## Auth (MVP)
Auth is inside `api-service` using NestJS Guards + JWT + Passport.
- JWT strategy: `passport-jwt` with Bearer token extraction (access token)
- Refresh token: httpOnly cookie (`refresh_token`) with `jti` for revocation
- Global `JwtAuthGuard` applied per-controller
- Passwords: bcrypt with 12 salt rounds
- Access token: 15 minutes (hardcoded `15m`)
- Refresh token: 7 days (hardcoded `7d`), includes `jti` (UUID) for revocation
- Revoked tokens stored in `RevokedToken` table (by `jti`)
- Cookie parser middleware registered in `main.ts`
- Do NOT create a separate auth-service until explicitly instructed.

## PR Format
```
Title: [monitor] short description  OR  [frontend] short description
Body: What changed, why, how to test, risks, checklist
Branch: feature/issue-{number}-{short-description}
Base: develop (never main)
```

## Environment Variables

All env vars are documented in `.env.example` at the repo root. Key vars:

| Variable | Service | Required | Default |
|----------|---------|----------|---------|
| `HELIUS_API_KEY` | solana-adapter | Yes | — |
| `HELIUS_RPC_URL` | solana-adapter | No | `https://mainnet.helius-rpc.com/?api-key=` |
| `RATE_LIMITER_MAX_RPS` | solana-adapter | No | 10 |
| `RATE_LIMITER_MAX_RETRIES` | solana-adapter | No | 3 |
| `RATE_LIMITER_BASE_DELAY_MS` | solana-adapter | No | 1000 |
| `RATE_LIMITER_MAX_DELAY_MS` | solana-adapter | No | 30000 |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | solana-adapter | No | 5 |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | solana-adapter | No | 3 |
| `CIRCUIT_BREAKER_TIMEOUT_MS` | solana-adapter | No | 30000 |
| `JWT_SECRET` | api-service | Yes | — |
| `DATABASE_URL` | api-service | Yes | — |
| `REDIS_HOST` | all | No | localhost |
| `REDIS_PORT` | all | No | 6379 |
| `TELEGRAM_BOT_TOKEN` | notification-service | No | — |
| `ALLOWED_ORIGINS` | api-service | No | `*` (dev) / none (prod) |

## Database Seeding

A seed script at `apps/api-service/prisma/seed.ts` populates the database with test data for local development:

- **Test user:** `test@argusmonitor.io` / `testpassword123` (bcrypt-hashed, JWT-compatible)
- **Test wallets:** 3 Solana devnet addresses (no real funds)
- **Alert rules:** `large_tx` (threshold: 1 SOL / 1_000_000_000 lamports) and `balance_change` (any change)
- **Chain entry:** Solana devnet (`https://api.devnet.solana.com`)

The seed is wired into `apps/api-service/package.json` via `"prisma": { "seed": "ts-node prisma/seed.ts" }`.

**Usage:**
```bash
cd apps/api-service
npx prisma db seed
```

The seed clears all existing data before inserting (safe for local dev only).

