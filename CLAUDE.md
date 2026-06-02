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
  chain-indexer-service/    BullMQ job scheduler
  solana-adapter-service/   Helius RPC, rate limiter, circuit breaker
    src/adapter/            SolanaAdapter (ChainAdapter impl)
    src/rate-limiter/       Token bucket rate limiter
    src/circuit-breaker/    Three-state circuit breaker
    src/consumer/           BullMQ solana:fetch consumer
    src/config/             Helius, Redis, rate limiter, circuit breaker config
  alert-service/            Alert rule evaluation engine
  notification-service/     Telegram bot notifications
  rpc-monitor-service/      RPC health checks + circuit breaker
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
The api-service registers a global `AllExceptionsFilter` in `main.ts` that catches all unhandled exceptions:

- **HttpException** — passes through the original status code and message
- **PrismaClientKnownRequestError** — mapped to HTTP status codes:
  - `P2002` (unique constraint) → `409 Conflict` with message `"Resource already exists"`
  - `P2025` (record not found) → `404 Not Found` with message `"Resource not found"`
  - Other Prisma errors → `500 Internal Server Error` with message `"Internal server error"`
- **All other exceptions** → `500 Internal Server Error` with message `"Internal server error"`

**Production behavior** (`NODE_ENV=production`):
- Response body: `{ statusCode, message }` only — NO stack trace
- All 5xx errors are logged with: request ID, user ID, HTTP method, URL, and stack trace

**Development behavior** (any other `NODE_ENV`):
- Response body includes `stack` field for debugging

**Source:** `apps/api-service/src/common/filters/all-exceptions.filter.ts`

### Health
- `GET /api/health` — returns `{status: "up"}`

### Rate Limiting
The api-service uses `@nestjs/throttler` v6.5.0 for global rate limiting to protect against abuse:

- **Global default**: 100 requests per 60 seconds per IP — applies to all endpoints
- **Auth endpoints** (`POST /api/auth/login`, `/register`, `/refresh`): **10 requests per 60 seconds** per IP (stricter limit via `@Throttle()` decorator)
- **Health endpoint** (`GET /api/health`): **exempt** from rate limiting via `@SkipThrottle()`
- **429 response**: Automatically returned with `Retry-After` header when limit exceeded
- **Storage**: In-memory by default (single-instance). For multi-instance deployments, switch to Redis store.

The `ThrottlerGuard` is registered as a global guard in `app.module.ts`. Individual endpoints can override the default limit using `@Throttle()` or opt out using `@SkipThrottle()`.

**Source:** `apps/api-service/src/app.module.ts`, `apps/api-service/src/auth/auth.controller.ts`, `apps/api-service/src/health/health.controller.ts`

### Global ValidationPipe
The api-service applies a global `ValidationPipe` in `main.ts` with these settings:
- **whitelist: true** — strips unknown properties from request bodies
- **forbidNonWhitelisted: true** — throws 400 BadRequest on unknown properties
- **transform: true** — coerces types (e.g. string to number for query params like `page=2`)

This means all DTOs are enforced at runtime. Sending extra fields, missing required fields, or wrong types returns a 400 error instead of causing a 500.

### WebSocket Gateway
- Namespace: `/ws`
- Auth: JWT token in `auth.token` or `query.token`
- Events: `subscribe-wallet`, `unsubscribe-wallet` (client→server)
- Emits: `wallet_update`, `alert_triggered`, `connected` (server→client)

## Prisma Schema (api-service)

```prisma
model User {
  id           String      @id @default(uuid())
  email        String      @unique
  passwordHash String
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  wallets      Wallet[]
  alertRules   AlertRule[]
}

model Wallet {
  id        String      @id @default(uuid())
  address   String
  chain     String
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  alertRules AlertRule[]

  @@unique([address, chain, userId])
  @@index([userId])
}

model AlertRule {
  id        String   @id @default(uuid())
  chain     String
  type      String
  threshold String?
  userId    String
  walletId  String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  wallet    Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([walletId])
}

model Chain {
  id     String @id @default(uuid())
  name   String @unique
  rpcUrl String
}

model RevokedToken {
  id        String   @id @default(uuid())
  tokenJti  String   @unique // JWT ID (jti) — unique per token
  expiresAt DateTime // When the token naturally expires; we can clean up after this
  createdAt DateTime @default(now())

  @@index([tokenJti])
  @@index([expiresAt])
}
```

## Critical Data Rules
- **NEVER** store on-chain amounts as `float` or `decimal` — always `BIGINT`
  - Solana: lamports (1 SOL = 1_000_000_000 lamports)

## Testing
- **Backend**: Jest + Testcontainers (PostgreSQL + Redis in Docker)
- **Frontend**: Playwright (E2E)
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
```
