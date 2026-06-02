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
- `TokenBalance` — `{mint, symbol, name, amount: bigint, decimals, usdValue}`
- `Transaction` — `{signature, slot, timestamp, from, to, amount: bigint, fee: bigint, status, type}`
- `RpcHealthResult` — `{endpoint, healthy, latencyMs, blockHeight, error?}`

**Critical rule:** All on-chain amounts are stored as `BIGINT` (lamports for Solana, wei for EVM). Never use float or decimal.

### Database (PostgreSQL via Prisma)

- **User** — email + bcrypt-hashed password
- **Wallet** — blockchain address + chain type, owned by user
- **AlertRule** — rule configuration per wallet (type, threshold, chain)
- **Chain** — supported blockchain networks (name, RPC URL)
- **RevokedToken** — tracks revoked refresh tokens by JWT ID (`jti`) for secure logout

## JWT Authentication

The API service uses a dual-token JWT authentication system:

- **Access Token** — short-lived (15 minutes), sent via `Authorization: Bearer` header. Used for authenticating API requests.
- **Refresh Token** — long-lived (7 days), stored as an httpOnly cookie (`refresh_token`). Used to obtain new access tokens without re-authentication.

### Cookie Configuration

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `httpOnly` | `true` | Not accessible via JavaScript (XSS protection) |
| `secure` | `true` in production | HTTPS only |
| `sameSite` | `strict` | CSRF protection |
| `path` | `/api/auth` | Scoped to auth endpoints |
| `maxAge` | 7 days | Refresh token lifetime |

### Token Flow

1. User registers or logs in → server returns `{accessToken, user}` in body + sets `refresh_token` cookie
2. Client stores `accessToken` in memory (not localStorage) and sends it as `Authorization: Bearer <token>`
3. When access token expires (15 min), client calls `POST /api/auth/refresh` → server reads `refresh_token` cookie, validates it, returns new `accessToken` + rotates refresh cookie
4. User logs out → server revokes refresh token (stores `jti` in `RevokedToken` table), clears cookie

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
- Redis 7 (via Docker)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/fatoh2/argus-monitor.git
cd argus-monitor

# 2. Install dependencies
npm install

# 3. Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# 4. Run database migrations
docker compose run api-service npx prisma migrate deploy

# 5. Start all services
docker compose up -d

# 6. Check health
curl http://localhost:3000/api/health
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | `argus` | PostgreSQL database name |
| `POSTGRES_USER` | `argus` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `argus` | PostgreSQL password |
| `REDIS_PORT` | `6379` | Redis port |
| `JWT_SECRET` | (required) | JWT signing secret |
| `JWT_EXPIRATION_TIME` | `60s` | JWT access token TTL |
| `HELIUS_API_KEY` | (required) | Helius API key for Solana |
| `HELIUS_RPC_URL` | (required) | Helius RPC endpoint |
| `TELEGRAM_BOT_TOKEN` | (optional) | Telegram bot token for notifications |

## API Endpoints

### Health
- `GET /api/health` — Service health check (exempt from rate limiting)

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user profile

### Wallets
- `POST /api/wallets` — Add wallet
- `GET /api/wallets` — List wallets
- `GET /api/wallets/:id` — Get wallet
- `DELETE /api/wallets/:id` — Delete wallet

### Alert Rules
- `POST /api/alert-rules` — Create alert rule
- `GET /api/alert-rules` — List alert rules
- `GET /api/alert-rules/:id` — Get alert rule
- `DELETE /api/alert-rules/:id` — Delete alert rule

### Chains
- `POST /api/chains` — Create chain
- `GET /api/chains` — List chains
- `GET /api/chains/:id` — Get chain
- `DELETE /api/chains/:id` — Delete chain

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e
```

## Docker

```bash
# Build all services
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```
