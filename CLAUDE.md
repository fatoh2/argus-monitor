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
docker-compose.yml          Local dev — all services + PostgreSQL + Redis
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
| Other Prisma errors | `500 Internal Server Error` | `"Internal server error"` |

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
