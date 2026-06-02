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
  chain-indexer-service/    BullMQ job scheduler
  solana-adapter-service/   Helius RPC, rate limiter, circuit breaker
  alert-service/            Alert rule evaluation engine
  notification-service/     Telegram bot notifications
  rpc-monitor-service/      RPC health checks + circuit breaker
packages/
  chain-adapter-sdk/        Published as @argus/adapter-sdk on npm
  shared-types/             Enums, queue names, job payload types
k8s/apps/                   Helm charts for all services
docker-compose.yml          Local dev — all services + PostgreSQL + Redis
docker-compose.prod.yml     Self-hosted production
```

## API Service Details

The `api-service` (port 3000) is the primary HTTP API. All endpoints use `/api` prefix.

### Auth (public)
- `POST /api/auth/register` — register with email + password (bcrypt, 12 rounds)
- `POST /api/auth/login` — login, returns `{accessToken, refreshToken, user}`
- `POST /api/auth/refresh` — refresh access token with `{refreshToken}`
- `POST /api/auth/me` — get current user profile (JWT protected)

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
  wallets      Wallet[]
  alertRules   AlertRule[]
}

model Wallet {
  id         String      @id @default(uuid())
  address    String      @unique
  userId     String
  chain      String      // "SOLANA" or "ETHEREUM"
  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  alertRules AlertRule[]
  @@index([userId])
}

model AlertRule {
  id        String   @id @default(uuid())
  userId    String
  walletId  String
  chain     String
  type      String
  threshold String?
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  wallet    Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([walletId])
}

model Chain {
  id     String @id @default(uuid())
  name   String @unique
  rpcUrl String
}
```

## Critical Data Rules
- **NEVER** store on-chain amounts as `float` or `decimal` — always `BIGINT`
  - Solana: lamports (1 SOL = 1_000_000_000 lamports)
  - EVM: wei (1 ETH = 1_000_000_000_000_000_000 wei)
  - Store `asset_decimals` separately for display
- **NEVER** run `prisma migrate deploy` on production — migrations run in CI only
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
- JWT strategy: `passport-jwt` with Bearer token extraction
- Global `JwtAuthGuard` applied per-controller
- Passwords: bcrypt with 12 salt rounds
- Access token: configurable expiry (default 1h), refresh token: 7d
- Do NOT create a separate auth-service until explicitly instructed.

## PR Format
```
Title: [monitor] short description  OR  [frontend] short description

Body:
## What changed
<link to issue>

## How to test
<steps to verify locally with docker-compose>

## Checklist
- [ ] npm test passes
- [ ] npm run build passes
- [ ] No TypeScript errors
- [ ] No mocked DB in integration tests
- [ ] Prisma migration included? (yes/no)
- [ ] BullMQ queue changes updated in shared-types? (yes/no)
- [ ] Breaking API changes? (yes/no — escalate if yes)
- [ ] /metrics endpoint added to new services? (yes/no)
```

## Escalate to PM when
- Breaking changes to OpenAPI spec
- New BullMQ queue names (must update shared-types and notify all consumer services)
- Prisma migration that alters or drops existing columns
- Any change to JWT auth configuration
- Helius API key rotation needed
