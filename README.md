# Argus Monitor

Argus Monitor is a blockchain monitoring SaaS application. It allows users to set up monitors for various blockchain events and receive notifications.

## Features

- **JWT Authentication** — register, login, refresh tokens, profile endpoint
- **Wallet Management** — add, list, view, and delete blockchain wallet addresses
- **Alert Rules** — create, list, view, and delete alert rules per wallet
- **Real-time WebSocket Gateway** — authenticated connections, wallet updates, alert triggers
- **Chain Management** — admin CRUD for supported blockchain networks
- **Health Checks** — `/api/health` endpoint for all services

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

### Shared Packages

| Package | Description |
|---------|-------------|
| `@argus/adapter-sdk` | Published chain-adapter SDK (npm) |
| `@argus/shared-types` | Enums, queue names, job payload types |

### Database (PostgreSQL via Prisma)

- **User** — email + bcrypt-hashed password
- **Wallet** — blockchain address + chain type, owned by user
- **AlertRule** — rule configuration per wallet (type, threshold, chain)
- **Chain** — supported blockchain networks (name, RPC URL)

### Solana Adapter Service

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

- Exponential backoff with jitter (±25%) on retries
- Does NOT retry on 4xx errors (except 429 rate limit)

### Circuit Breaker

Three-state circuit breaker with exponential backoff retry and caching, preventing cascading RPC failures:

| Config | Env Var | Default | Description |
|--------|---------|---------|-------------|
| Failure threshold | `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 5 | Consecutive failures to open circuit |
| Success threshold | `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | 3 | Successes in half-open to close |
| Timeout | `CIRCUIT_BREAKER_TIMEOUT_MS` | 30000 | Time before half-open retry (ms) |
| Max retries | `CIRCUIT_BREAKER_MAX_RETRIES` | 3 | Retry attempts before failing |
| Base delay | `CIRCUIT_BREAKER_BASE_DELAY_MS` | 500 | Initial backoff delay (ms) |
| Max delay | `CIRCUIT_BREAKER_MAX_DELAY_MS` | 2000 | Maximum backoff delay (ms) |

States: `CLOSED` → `OPEN` → `HALF_OPEN` → `CLOSED`

**Retry behavior:**
- Exponential backoff: attempt 1 = 500ms, attempt 2 = 1000ms, attempt 3 = 2000ms
- ±25% jitter added to each delay to avoid thundering herd
- Errors are logged with sanitized endpoint URL (API key stripped), error code, and attempt number

**Caching:**
- Successful RPC responses are cached in-memory, keyed by operation type
- Cache keys: `balance:{address}`, `tokens:{address}`, `tx:{address}:{limit}`
- When the circuit is OPEN, cached last-known values are returned instead of throwing
- Cache is cleared on circuit reset

**Degraded events:**
- When the circuit opens, an `RpcDegradedEvent` is emitted via an RxJS `Subject` (`degraded$`)
- The `SolanaAdapter` subscribes to these events in `onModuleInit` and logs warnings
- Event payload: `{endpoint, errorCode, errorMessage, circuitState, failureCount, timestamp}`

### BullMQ Consumer

Processes `solana:fetch` queue jobs from the chain-indexer service:

- **`balance`** — fetches native SOL balance
- **`transaction`** — fetches recent transactions
- **`token_account`** — fetches SPL token balances
- Unknown monitor types are skipped gracefully

Returns normalized data with stringified BIGINT values for JSON serialization.

## API Endpoints

All endpoints are prefixed with `/api`.

### Auth (public)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Register with email + password |
| `POST` | `/api/auth/login` | Login, returns JWT access + refresh tokens |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/me` | Get current user profile (JWT protected) |

### Wallets (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/wallets` | Add a wallet (address + chain) |
| `GET` | `/api/wallets` | List user's wallets |
| `GET` | `/api/wallets/:id` | Get single wallet |
| `DELETE` | `/api/wallets/:id` | Delete wallet |

### Alert Rules (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/alert-rules` | Create rule (walletId, chain, type, threshold) |
| `GET` | `/api/alert-rules` | List user's rules |
| `GET` | `/api/alert-rules/:id` | Get single rule |
| `DELETE` | `/api/alert-rules/:id` | Delete rule |

### Chains (admin)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chains` | Create chain (name, RPC URL) |
| `GET` | `/api/chains` | List all chains |
| `GET` | `/api/chains/:id` | Get single chain |
| `DELETE` | `/api/chains/:id` | Delete chain |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Service health check |

## WebSocket Gateway

Connect to `/ws` namespace with JWT token in `auth.token` or `query.token`.

**Client → Server events:**
- `subscribe-wallet` — subscribe to real-time updates for a wallet
- `unsubscribe-wallet` — unsubscribe from wallet updates

**Server → Client events:**
- `wallet_update` — emitted to wallet subscribers when data changes
- `alert_triggered` — emitted to user room when an alert fires
- `connected` — emitted on successful connection with user ID

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Docker and Docker Compose (for local development with PostgreSQL and Redis)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/fatoh2/argus-monitor.git
cd argus-monitor

# Start dependencies (PostgreSQL + Redis)
docker compose up -d postgres redis

# Install dependencies
npm install

# Run database migrations
cd apps/api-service && npx prisma migrate deploy && cd ../..

# Start the API service
cd apps/api-service && npm run start:dev
```

### Testing the API

```bash
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Use the returned accessToken for protected endpoints
curl http://localhost:3000/api/wallets \
  -H "Authorization: Bearer <token>"
```

### Self-Hosting

For production deployment instructions, see the [Self-Hosting Guide](./docs/self-hosting.md).

## Development

### Running All Services

```bash
docker compose up -d
```

### Running Tests

```bash
# All tests
npm test

# API service tests only
cd apps/api-service && npm test
```

### Project Structure

```
argus-monitor/
├── apps/
│   ├── api-service/              # NestJS — auth, wallets, alert rules, WebSocket
│   ├── chain-indexer-service/    # BullMQ job scheduler
│   ├── solana-adapter-service/   # Helius RPC integration
│   ├── alert-service/            # Alert rule evaluation engine
│   ├── notification-service/     # Telegram bot notifications
│   └── rpc-monitor-service/      # RPC health checks
├── packages/
│   ├── chain-adapter-sdk/        # Published as @argus/adapter-sdk
│   └── shared-types/             # Enums, queue names, job payload types
├── docker-compose.yml            # Local dev — all services + PostgreSQL + Redis
├── .env.example                  # Environment variable reference
├── nest-cli.json                 # NestJS monorepo config
└── package.json                  # Workspace root
```

## License

This project is [MIT licensed](LICENSE).
