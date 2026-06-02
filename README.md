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
- **Global Exception Filter** — In production, unhandled errors return only `statusCode` and a generic `message` (no stack traces, timestamp, or path). Prisma errors are mapped to specific HTTP status codes: `P2002` (unique constraint) to 409 Conflict, `P2025` (record not found) to 404 Not Found, `P2003` (foreign key constraint) to 400 Bad Request, and other unexpected Prisma errors to 500 Internal Server Error. All 5xx errors are logged with redacted request context (body and query params masked via `redact()`).
- **Rate Limiting** — global 100 req/60s per IP, stricter 10 req/60s on auth endpoints, health endpoint exempt
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
| `rpc-monitor-service` | 3005 | RPC health checks & circuit breaker |

Services communicate via **BullMQ queues** (Redis-backed) — no direct HTTP between services.

### BullMQ Queues

| Queue Name | Producer | Consumer | Payload |
|------------|----------|----------|---------|
| `chain:indexer` | API service | Chain indexer | `{walletId, chainType, address}` |
| `solana:fetch` | Chain indexer | Solana adapter | `{walletId, address, monitorType}` |
| `alert:evaluation` | Solana adapter | Alert service | `{walletId, alertRuleId, currentValue, threshold, condition}` |
| `notification:dispatch` | Alert service | Notification service | `{alertId, walletId, channel, message}` |
| `rpc:health-check` | RPC monitor | RPC monitor | `{rpcUrl, chainType}` |

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
| `maxAge` | 7 days | Matches refresh token TTL |

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | Public | Register with email + password. Returns `{accessToken, user}`, sets refresh cookie |
| `POST` | `/api/auth/login` | Public | Login. Returns `{accessToken, user}`, sets refresh cookie |
| `POST` | `/api/auth/refresh` | Cookie | Reads refresh token from cookie, returns new `{accessToken, user}`, rotates refresh cookie |
| `POST` | `/api/auth/logout` | Cookie | Revokes refresh token server-side, clears cookie |
| `POST` | `/api/auth/me` | Bearer JWT | Returns current user profile |

### Refresh Token Revocation

When a user logs out, the refresh token's JWT ID (`jti`) is stored in the `RevokedToken` table. Any subsequent attempt to use a revoked refresh token is rejected with `401 Unauthorized`. This ensures that even if a refresh token is compromised, it can be invalidated server-side.

## Rate Limiting

The API service uses `@nestjs/throttler` v6.5.0 to protect all public endpoints from abuse:

| Endpoint Group | Limit | Scope |
|----------------|-------|-------|
| All endpoints (default) | 100 requests per 60 seconds per IP | Global |
| Auth (`/api/auth/login`, `/register`, `/refresh`) | 10 requests per 60 seconds per IP | Per-endpoint override via `@Throttle()` |
| Health (`GET /api/health`) | Unlimited | Exempt via `@SkipThrottle()` |

When the limit is exceeded, the API returns **HTTP 429 Too Many Requests** with a `Retry-After` header indicating when the client can retry.

**Note:** The throttler uses in-memory storage by default. If you scale to multiple API service instances, configure a Redis store for shared rate limit tracking.

## Prisma Error Handling

All repository methods in the API service wrap Prisma calls with `try/catch` using the shared `handlePrismaError()` utility at `apps/api-service/src/common/prisma-error.handler.ts`:

| Prisma Error Code | Meaning | HTTP Status | Response Message |
|---|---|---|---|
| `P2002` | Unique constraint violation | `409 Conflict` | `"Resource already exists"` |
| `P2025` | Record not found | `404 Not Found` | `"Resource not found"` |
| `P2003` | Foreign key constraint violation | `400 Bad Request` | `"Referenced resource does not exist"` |
| Other | Unexpected Prisma error | `500 Internal Server Error` | `"Internal server error"` (logged server-side with full context) |

**Services using `handlePrismaError()`:**
- `WalletsService` — all CRUD methods (`create`, `findAllByUser`, `findOne`, `remove`)
- `ChainsService` — all CRUD methods (`create`, `findAll`, `findOne`, `remove`)
- `AuthService` — `register`, `login`, `refreshToken`
- `AlertRulesService` — all CRUD methods (`create`, `findAllByUser`, `findOne`, `remove`)

Non-Prisma errors (e.g., `NotFoundException`, `ConflictException` thrown explicitly by service logic) are re-thrown as-is and handled by the global `AllExceptionsFilter`.

**Source:** `apps/api-service/src/common/prisma-error.handler.ts`

## Secret Redaction

Argus Monitor enforces a strict **no secrets in logs** policy across all services:

- **`redact()` utility** (`apps/api-service/src/common/logger/redact.ts`) — recursively masks sensitive fields from objects before logging. Detects and redacts:
  - Authentication secrets: passwords, tokens, JWT, API keys, private keys
  - PII: email, phone, SSN, credit card numbers
  - Blockchain secrets: mnemonics, seed phrases, wallet private keys
  - Case-insensitive field matching (e.g., `apiKey`, `API_KEY`, `apikey` all match)
- **`redactUrl(url)`** — strips API keys and tokens from URL query parameters
- **`safeStringify(obj)`** — JSON.stringify with automatic redaction
- **`containsEnvSecretRef(str)`** — detects `process.env.*KEY*` references in strings

### Where Redaction Is Applied

| Location | What's Redacted |
|----------|----------------|
| `AllExceptionsFilter` (5xx error logs) | Request body and query params before logging |
| `SolanaConsumer` (wallet address logs) | Wallet addresses (first 4 + last 4 chars preserved) |
| All `main.ts` bootstrap logs | Replaced `console.log` with NestJS `Logger` (structured, level-aware) |

### Enforcement

A lint-style test (`apps/api-service/src/common/__tests__/log-secrets-lint.spec.ts`) scans all `.ts` and `.tsx` source files for log calls referencing secret environment variables (matching patterns: KEY, SECRET, TOKEN, PASSWORD, PRIVATE, MNEMONIC, SEED). If a violation is found, the test fails with the file path and line number.

**Source:** `apps/api-service/src/common/logger/redact.ts`


## Solana Adapter Service

The `solana-adapter-service` (port 3002) provides Helius RPC integration for Solana blockchain monitoring.

### SolanaAdapter

Implements the `ChainAdapter` interface for Solana:

- `getNativeBalance(address)` — returns SOL balance in lamports (BIGINT)
- `getTokenBalances(address)` — returns SPL token balances, skips zero-balance tokens
- `getRecentTransactions(address, limit=20)` — returns last N transactions normalized to `Transaction` interface
- `checkRpcHealth(endpoint)` — latency + block height health check
- Transaction normalization: parses system program transfers (SOL) and token program transfers (SPL)

### Rate Limiter

Token bucket algorithm protecting Helius RPC from excessive requests:

| Config | Env Var | Default | Description |
|--------|---------|---------|-------------|
| Max RPS | `RATE_LIMITER_MAX_RPS` | 10 | Max requests per second |
| Max retries | `RATE_LIMITER_MAX_RETRIES` | 3 | Retry attempts on rate limit |
| Base delay | `RATE_LIMITER_BASE_DELAY_MS` | 1000 | Initial backoff delay (ms) |
| Max delay | `RATE_LIMITER_MAX_DELAY_MS` | 30000 | Maximum backoff delay (ms) |

### Circuit Breaker

Three-state circuit breaker (`CLOSED → OPEN → HALF_OPEN`) that prevents cascading failures when Helius RPC is degraded:

| Config | Env Var | Default | Description |
|--------|---------|---------|-------------|
| Failure threshold | `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 5 | Consecutive failures to open |
| Success threshold | `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | 3 | Consecutive successes to close |
| Timeout | `CIRCUIT_BREAKER_TIMEOUT_MS` | 30000 | Wait before half-open (ms) |
| Max retries | `CIRCUIT_BREAKER_MAX_RETRIES` | 3 | Retry attempts when circuit is closed |
| Base delay | `CIRCUIT_BREAKER_BASE_DELAY_MS` | 500 | Initial backoff delay (ms) |
| Max delay | `CIRCUIT_BREAKER_MAX_DELAY_MS` | 2000 | Maximum backoff delay (ms) |

### Caching

In-memory cache with TTL to reduce redundant RPC calls:

| Config | Env Var | Default | Description |
|--------|---------|---------|-------------|
| Cache TTL | `CACHE_TTL_MS` | 30000 | Cache duration (ms) |
| Max entries | `CACHE_MAX_ENTRIES` | 1000 | Max cached items |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- A Helius API key (free tier)

### Local Development

```bash
# Clone the repo
git clone https://github.com/fatoh2/argus-monitor.git
cd argus-monitor

# Copy environment file
cp .env.example .env
# Edit .env with your Helius API key and JWT secret

# Start dependencies (PostgreSQL, Redis)
docker compose up -d postgres redis

# Install dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# Start the API service
npm run start:dev api-service
```

See [docs/self-hosting.md](docs/self-hosting.md) for production deployment instructions.
