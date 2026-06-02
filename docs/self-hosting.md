# Self-Hosting Argus Monitor

This guide walks you through self-hosting Argus Monitor in production.

## Local Development

For local development, use the `Makefile` at the project root:

```bash
make up          # start all services
make migrate     # run Prisma migrations
make seed        # seed database with test data
make check       # TypeScript type-check
make test        # run all workspace tests
make logs        # tail container logs
make reset       # full reset: down -v, migrate, seed, start all
make help        # show all available commands
```

See the [README](../README.md#development) for the full command reference.

## Architecture Overview

Argus Monitor consists of six NestJS microservices, a PostgreSQL database, and a Redis instance for BullMQ job queues and caching.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend  │────▶│  API Service │────▶│  PostgreSQL       │
│  (React)    │     │  (port 3000) │     │  (port 5432)      │
└─────────────┘     └──────┬───────┘     └──────────────────┘
                           │
                    BullMQ │ Queue (Redis)
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ Chain Indexer  │ │ Solana       │ │ Alert Service    │
│ (port 3001)    │ │ Adapter      │ │ (port 3003)      │
│                │ │ (port 3002)  │ │                  │
└────────────────┘ └──────────────┘ └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ Notification     │
                                    │ Service          │
                                    │ (port 3004)      │
                                    └──────────────────┘

┌──────────────────┐
│ RPC Monitor      │
│ (port 3005)      │
└──────────────────┘
```

## Prerequisites

- **Docker and Docker Compose installed**
- **Sufficient system resources**: For a small deployment (1–5 wallets), a VPS with 2 vCPU and 4GB RAM is a good starting point. Scale up as needed.
- A domain name configured to point to your server's IP address (for SSL).
- A **Helius API key** for Solana blockchain monitoring (free tier available at [helius.xyz](https://helius.xyz)).

### Security Considerations

- **Secure your `.env` file**: Never commit it to version control. Set strict file permissions.
- **Regularly update dependencies**: Keep Docker images and system packages up-to-date.
- **Monitor logs**: Review application and server logs for suspicious activity.
- **Secret Redaction**: A `redact()` utility (`apps/api-service/src/common/logger/redact.ts`) automatically masks passwords, tokens, API keys, and PII before they reach log output. The global exception filter redacts request bodies and query params on 5xx errors. A linting test (`log-secrets-lint.spec.ts`) enforces that no log call references a secret environment variable. All services use NestJS `Logger` instead of `console.log`.
- **Reverse proxy**: The API service should only be accessible via a reverse proxy (nginx, Caddy) with SSL termination. Do not expose services directly to the public internet.
- **Strong passwords**: Use strong, random passwords for PostgreSQL, Redis, and JWT secrets.
- **BullMQ Dashboard**: If used, protect it behind a reverse proxy with authentication.
- **Global exception filter + Prisma error handling**: In production, the API service returns only `{statusCode, message}` — no stack traces, timestamp, or path. In development, responses include `timestamp`, `path`, and `stack` for debugging. The filter extends `BaseExceptionFilter` from `@nestjs/core` and is registered via `HttpAdapterHost`. All errors are logged server-side with HTTP status and request URL. Prisma errors are mapped to proper HTTP codes (P2002 → 409 Conflict, P2025 → 404 Not Found, P2003 → 400 Bad Request, others → 500) both at the global filter level and per-method via the shared `handlePrismaError()` utility (`apps/api-service/src/common/prisma-error.handler.ts`).
- **Rate limiting**: All API endpoints are rate-limited to prevent abuse. Auth endpoints have a stricter limit (10 req/60s) to mitigate brute-force attacks. The health endpoint is exempt to allow monitoring tools uninterrupted access. Auth rate limiting is validated by an integration test (`auth.controller.spec.ts`) that proves the `@Throttle()` decorator enforces the 10-request cap through the full NestJS HTTP pipeline.
- **JWT token security**: Access tokens are short-lived (15 minutes). Refresh tokens are stored as httpOnly cookies with `sameSite: 'strict'` for CSRF protection. Refresh tokens can be revoked server-side via the `/logout` endpoint.

## Testing

Argus Monitor includes a comprehensive test suite with **228 unit and integration tests** across all 5 microservices.

### Running Tests Locally

```bash
# Run all unit tests
npm test

# Run with coverage (70% threshold)
npm run test:cov

# Run E2E integration tests (requires PostgreSQL running)
npm run test:e2e
```

### CI Pipeline

Every pull request runs tests via GitHub Actions (`.github/workflows/test.yml`). The CI pipeline:

1. Spins up PostgreSQL 16 and Redis 7 service containers
2. Installs dependencies with `npm ci`
3. Generates Prisma client and runs migrations
4. Runs TypeScript type-check and lint
5. Executes all tests with coverage reporting
6. Uploads coverage reports as build artifacts

### Test Coverage by Service

| Service | Test Count | Key Test Files |
|---------|-----------|----------------|
| api-service | ~120 | Auth, wallets, alert-rules, chains controllers/services; E2E supertest suite |
| alert-service | ~30 | Alert engine (all rule types), app controller/service |
| solana-adapter-service | ~30 | Solana adapter (mocked Helius), consumer, config |
| notification-service | ~25 | Telegram service (send, format, error handling) |
| chain-indexer-service | ~15 | App controller/service, health controller |

See the [README](../README.md#testing) for the full test structure reference.

## Setup Steps

### 1. Clone the Repository

```bash
git clone https://github.com/fatoh2/argus-monitor.git
cd argus-monitor
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Below is a reference of all environment variables:

```dotenv
# ---- General ----
NODE_ENV=production

# ---- API Service (port 3000) ----
# Rate Limiting (global for API service)
API_RATE_LIMIT_TTL=60000
API_RATE_LIMIT_LIMIT=100

# Rate Limiting (auth endpoints)
AUTH_RATE_LIMIT_TTL=60000
AUTH_RATE_LIMIT_LIMIT=10

API_SERVICE_PORT=3000
JWT_SECRET=generate-a-strong-random-secret

# ---- Chain Indexer Service (port 3001) ----
CHAIN_INDEXER_PORT=3001

# ---- Solana Adapter Service (port 3002) ----
SOLANA_ADAPTER_PORT=3002
HELIUS_API_KEY=your-helius-api-key
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-helius-api-key

# Rate limiter (token bucket algorithm)
RATE_LIMITER_MAX_RPS=10
RATE_LIMITER_MAX_RETRIES=3
RATE_LIMITER_BASE_DELAY_MS=1000
RATE_LIMITER_MAX_DELAY_MS=30000

# Circuit breaker (three-state: CLOSED → OPEN → HALF_OPEN)
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
CIRCUIT_BREAKER_TIMEOUT_MS=30000
CIRCUIT_BREAKER_MAX_RETRIES=3
CIRCUIT_BREAKER_BASE_DELAY_MS=500
CIRCUIT_BREAKER_MAX_DELAY_MS=2000

# ---- Alert Service (port 3003) ----
ALERT_SERVICE_PORT=3003

# ---- Notification Service (port 3004) ----
NOTIFICATION_SERVICE_PORT=3004
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# ---- RPC Monitor Service (port 3005) ----
RPC_MONITOR_PORT=3005

# ---- PostgreSQL ----
DATABASE_URL=postgresql://argus:your-db-password@postgres:5432/argus
POSTGRES_DB=argus
POSTGRES_USER=argus
POSTGRES_PASSWORD=your-db-password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# ---- Redis ----
REDIS_HOST=redis
REDIS_PORT=6379

# ---- Security ----
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

**Important:**
- Generate a strong `JWT_SECRET` (e.g., `openssl rand -base64 32`)
- Set a strong `POSTGRES_PASSWORD`
- Set your `HELIUS_API_KEY` — required for Solana monitoring
- Set `TELEGRAM_BOT_TOKEN` if using Telegram notifications
- Set `ALLOWED_ORIGINS` to your frontend domain(s), comma-separated for multiple origins
- The `DATABASE_URL` uses service names (`postgres`, `redis`) when running with Docker Compose
- **JWT token TTLs are hardcoded**: Access tokens expire in 15 minutes, refresh tokens in 7 days. The `JWT_EXPIRATION_TIME` env var is no longer used.
- Rate limiter and circuit breaker settings are optional — defaults are safe for most deployments
- Circuit breaker retry and caching settings are also optional — defaults provide 3 retries with 500ms/1s/2s backoff

### 3. Start the Stack

```bash
docker compose up -d
```

This starts all services: PostgreSQL, Redis, API service, chain indexer, Solana adapter, alert service, notification service, and RPC monitor.

### 4. Run Database Migrations

```bash
docker compose exec api-service npx prisma migrate deploy
```

This creates the required tables: `User`, `Wallet`, `AlertRule`, `Chain`, and `RevokedToken`.

### 5. Verify the Deployment

```bash
# Health check
curl http://localhost:3000/api/health

# Register a test user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"securepassword123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"securepassword123"}'

# Access the API with the access token
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <access-token>"
```

### 6. Set Up SSL (Recommended)

Use a reverse proxy (nginx, Caddy, or Traefik) with Let's Encrypt for SSL termination. The `secure: true` flag on the refresh token cookie requires HTTPS.

Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## API Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | Public | Register with email + password. Returns `{accessToken, user}`, sets `refresh_token` httpOnly cookie |
| `POST` | `/api/auth/login` | Public | Login. Returns `{accessToken, user}`, sets `refresh_token` httpOnly cookie |
| `POST` | `/api/auth/refresh` | Cookie | Reads `refresh_token` cookie, returns new `{accessToken, user}`, rotates refresh cookie |
| `POST` | `/api/auth/logout` | Cookie | Revokes refresh token, clears cookie |
| `POST` | `/api/auth/me` | Bearer JWT | Returns current user profile |

### Wallets (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/wallets` | Add wallet `{address, chain}` |
| `GET` | `/api/wallets` | List user's wallets |
| `GET` | `/api/wallets/:id` | Get single wallet |
| `DELETE` | `/api/wallets/:id` | Delete wallet |

### Alert Rules (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/alert-rules` | Create rule `{walletId, chain, type, threshold?}` |
| `GET` | `/api/alert-rules` | List user's rules |
| `GET` | `/api/alert-rules/:id` | Get single rule |
| `DELETE` | `/api/alert-rules/:id` | Delete rule |

### Chains

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chains` | Create chain `{name, rpcUrl}` |
| `GET` | `/api/chains` | List all chains |
| `GET` | `/api/chains/:id` | Get single chain |
| `DELETE` | `/api/chains/:id` | Delete chain |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check — returns `{status: "up"}` |

## Troubleshooting

### Common Issues

**"Refresh token not found" error**
- Ensure the frontend sends credentials (`withCredentials: true` or `credentials: 'include'`) on refresh/logout requests
- Verify the cookie domain/path matches the request URL
- Check that HTTPS is configured (cookies with `secure: true` won't be sent over HTTP)

**"Token has been revoked" error**
- The refresh token was used after logout — the client needs to re-authenticate
- This is expected behavior after logout

**"Invalid or expired refresh token"**
- The refresh token has expired (after 7 days) or is malformed
- The user needs to log in again

**Database connection errors**
- Verify PostgreSQL is running: `docker compose ps postgres`
- Check `DATABASE_URL` in `.env`
- Ensure migrations have been applied

**Authentication failures**
- Verify the JWT token is valid and not expired
- Check the API service logs for authentication errors
- Ensure the `JWT_SECRET` is consistent across all API service instances
