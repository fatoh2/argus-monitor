# Argus Monitor

Argus Monitor is a blockchain monitoring SaaS application. It allows users to set up monitors for various blockchain events and receive notifications.

## Features

- **JWT Authentication** — register, login, refresh tokens, logout, profile endpoint. Short-lived access tokens (15 min) with httpOnly refresh token cookies (7 days) for secure session management.
- **Wallet Management** — add, list, view, and delete blockchain wallet addresses
- **Alert Rules** — create, list, view, and delete alert rules per wallet
- **Real-time WebSocket Gateway** — authenticated connections, wallet updates, alert triggers
- **Chain Management** — admin CRUD for supported blockchain networks
- **Solana Blockchain Adapter** — Helius RPC integration with rate limiter & circuit breaker
- **Strict Input Validation** — all endpoints validate input with whitelist (unknown props rejected) + type coercion (string to number for query params)
- **Health Checks** — `/api/health` endpoint for all services
- **Global Exception Filter** — In production, unhandled errors return only `{statusCode, message}` (no stack traces, timestamp, or path). In development, responses include `timestamp`, `path`, and `stack` for debugging. Prisma errors are mapped to specific HTTP status codes: `P2002` (unique constraint) to 409 Conflict, `P2025` (record not found) to 404 Not Found, `P2003` (foreign key constraint) to 400 Bad Request, and other unexpected Prisma errors to 500 Internal Server Error. The filter extends `BaseExceptionFilter` from `@nestjs/core` and is registered via `HttpAdapterHost` in `main.ts`.
- **Rate Limiting** — global 100 req/60s per IP, stricter 10 req/60s on auth endpoints, health endpoint exempt. Auth rate limiting validated via supertest integration test (`auth.controller.spec.ts`) that proves the `@Throttle()` decorator enforces the 10-request cap through the full NestJS HTTP pipeline.
- **Secret Redaction** — all log calls use NestJS `Logger` (not `console.log`); a `redact()` utility masks passwords, tokens, API keys, and PII before logging; a linting test (`log-secrets-lint.spec.ts`) enforces no secret env vars in log calls
- **Prisma Error Handling** — all repository methods wrap Prisma calls with `try/catch` using a shared `handlePrismaError()` utility that maps `P2002` (unique constraint) → 409, `P2025` (not found) → 404, `P2003` (foreign key) → 400, and unexpected errors → 500
- **Comprehensive Test Suite** — 228 unit + integration tests across all 5 microservices (36 test suites), with 70% coverage threshold enforced via Jest project references. CI pipeline runs tests with PostgreSQL + Redis on every PR.

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

## Testing

Argus Monitor has a comprehensive test suite with **228 tests across 36 suites** covering all 5 microservices.

### Running Tests

```bash
npm test              # run all unit tests (228 tests, 36 suites)
npm run test:cov      # run with coverage (70% threshold enforced)
npm run test:e2e      # run E2E integration tests (requires PostgreSQL)
```

Tests can also be run via Docker for consistency:

```bash
make test             # runs `npm test` inside the api-service container
```

### Test Coverage by Service

| Service | Test Files | What's Tested |
|---------|-----------|---------------|
| **api-service** | 15 test files | AuthService, WalletsService, AlertRulesService, ChainsService, PrismaService, JwtStrategy, JwtAuthGuard, WebSocket gateway, exception filter, validation pipe, prisma error handler, redact utility, E2E REST endpoints |
| **solana-adapter-service** | 5 test files | SolanaAdapter (all methods with mocked Helius), SolanaConsumer (process, events), CircuitBreaker, RateLimiter, Config |
| **alert-service** | 3 test files | AlertEngineService (all rule types: balance_low, balance_high, transaction_from, transaction_to, token_volume) |
| **notification-service** | 4 test files | TelegramService (send, format, error handling) |
| **chain-indexer-service** | 3 test files | AppController, AppService, HealthController |

### CI Pipeline

A GitHub Actions workflow (`.github/workflows/test.yml`) runs on every PR to `develop` or `main`:

1. Spins up PostgreSQL 16 and Redis 7 as service containers
2. Installs dependencies (`npm ci`)
3. Generates Prisma client and runs migrations
4. Runs TypeScript check (`tsc --noEmit`)
5. Runs lint check
6. Runs all tests with coverage (70% threshold)
7. Uploads coverage reports as artifacts

### Test Infrastructure

- **Root `jest.config.js`** — project references for all 5 apps with 70% global coverage threshold
- **Per-app `jest.config.js`** — each app has its own config with coverage exclusions (main.ts, module files, spec files)
- **`tsconfig.json`** — added for apps that were missing it
- **`test/jest-e2e-config.json`** — E2E test configuration for api-service (supertest)

## Architecture

Argus Monitor is a **monorepo** with multiple NestJS microservices:

| Service | Port | Description |
|---------|------|-------------|
| `api-service` | 3000 | Auth, wallets, alert rules, WebSocket gateway |
| `chain-indexer-service` | 3001 | BullMQ job scheduler for blockchain indexing |
| `solana-adapter-service` | 3002 | Helius RPC integration with rate limiter & circuit breaker |
| `alert-service` | 3003 | Alert rule evaluation engine |
| `notification-service` | 3004 | Telegram bot notifications |

Services communicate via **BullMQ queues** (Redis-backed) — no direct HTTP between services.

### BullMQ Queues

| Queue Name | Producer | Consumer | Payload |
|------------|----------|----------|---------|
| `chain:indexer` | API service | Chain indexer | `{walletId, chainType, address}` |
| `solana:fetch` | Chain indexer | Solana adapter | `{walletId, address, monitorType}` |
| `alert:evaluation` | Solana adapter | Alert service | `{walletId, alertRuleId, currentValue, threshold, condition}` |
| `notification:dispatch` | Alert service | Notification service | `{alertId, walletId, channel, message}` |

### Shared Packages

| Package | Description |
|---------|-------------|
| `@argus/adapter-sdk` | Published chain-adapter SDK (npm) |
| `@argus/shared-types` | Enums, queue names, job payload types, ChainAdapter interface |

### ChainAdapter Interface

All blockchain adapters implement the `ChainAdapter` interface from `@argus/shared-types`:

| Method | Returns | Description |
|--------|---------|-------------|
| `getNativeBalance(address)` | `NativeBalance` | Native currency balance (SOL/ETH) in smallest unit (BIGINT) |
| `getTokenBalances(address)` | `TokenBalance[]` | Token/SPL balances, skips zero-balance tokens |
| `getRecentTransactions(address, limit?)` | `Transaction[]` | Recent transactions normalized to standard format |
| `checkRpcHealth(endpoint)` | `RpcHealthResult` | Latency + block height health check |
| `getChainType()` | `string` | Chain identifier (`solana`, `evm`) |

**Data types:**
- `NativeBalance` — `{address, balance: bigint, decimals, symbol}`
- `TokenBalance` — `{address, mint, amount: bigint, decimals, symbol, name}`
- `Transaction` — `{hash, from, to, value: bigint, timestamp, status, fee, tokenTransfers?}`
- `RpcHealthResult` — `{isHealthy, latencyMs, currentBlock?, error?}`

## Repo Structure

```
argus-monitor/
├── apps/
│   ├── api-service/              NestJS — auth, wallets, alert rules, WebSocket gateway
│   │   ├── src/
│   │   │   ├── auth/             JWT auth (register, login, refresh, logout)
│   │   │   ├── wallets/          Wallet CRUD
│   │   │   ├── alert-rules/      Alert rule CRUD
│   │   │   ├── chains/           Chain management (admin)
│   │   │   ├── websockets/       WebSocket gateway
│   │   │   ├── prisma/           Prisma service
│   │   │   ├── common/           Filters, pipes, error handlers, logger
│   │   │   └── health/           Health check endpoint
│   │   └── test/                 E2E integration tests (supertest)
│   ├── chain-indexer-service/    BullMQ job scheduler
│   ├── solana-adapter-service/   Helius RPC, rate limiter, circuit breaker
│   ├── alert-service/            Alert rule evaluation engine
│   └── notification-service/     Telegram bot notifications
├── packages/
│   ├── chain-adapter-sdk/        Published as @argus/adapter-sdk on npm
│   └── shared-types/             Enums, queue names, job payload types, ChainAdapter interface
├── k8s/apps/                     Helm charts for all services
├── .github/workflows/            CI pipelines (test.yml runs on every PR)
├── jest.config.js                Root Jest config with project references
├── docker-compose.yml            Local dev — all services + PostgreSQL + Redis
├── docker-compose.prod.yml       Self-hosted production
├── Makefile                      Dev commands (up, down, migrate, test, etc.)
└── package.json                  Workspace root with shared scripts
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

## License

MIT
