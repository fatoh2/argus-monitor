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

### Frontend Development

The frontend runs separately from the Docker stack during development:

```bash
cd apps/frontend
npm install
npm run dev          # starts Vite dev server on port 5173
```

The frontend expects the API service at `http://localhost:3000` (configurable via `VITE_API_URL`).

The dashboard (`/dashboard`) renders the `WalletDashboard` component which provides wallet management, SOL/SPL token balances, recent transactions, and Socket.io live updates. All monetary amounts use BigInt (lamports) — no floating-point arithmetic. The dashboard works fully with MSW mocks for development without a backend.

## Architecture Overview

Argus Monitor consists of a React frontend, six NestJS microservices, a shared `@argus/adapter-sdk` package, a PostgreSQL database, and a Redis instance for BullMQ job queues and caching. The frontend communicates with the API service via HTTP (REST) and WebSocket (Socket.io) for real-time live updates on wallet balances and transactions. The `@argus/adapter-sdk` package provides a unified ChainAdapter interface implemented by the solana-adapter-service.

```
┌──────────────────┐
│   Frontend       │
│  (React SPA)     │
│  Vite + Tailwind │
│  Port 5173 (dev) │
│  Port 80 (prod)  │
└────────┬─────────┘
         │ HTTP / WebSocket
         ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  API Service │────▶│  PostgreSQL  │     │  Redis (BullMQ)  │
│  (port 3000) │     │  (port 5432) │     │  (port 6379)     │
└──────┬───────┘     └──────────────┘     └──────────────────┘
       │
       │ BullMQ Queue
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
┌────────────────┐              ┌──────────────────┐
│ Chain Indexer  │              │ Solana Adapter   │
│ (port 3001)    │              │ (port 3002)      │
└────────────────┘              └──────────────────┘
       │                                  │
       └──────────────┬───────────────────┘
                      ▼
             ┌──────────────────┐
             │ Alert Service    │
             │ (port 3003)      │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ Notification     │
             │ Service          │
             │ (port 3004)      │
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
- **Reverse proxy**: The API service and frontend should only be accessible via a reverse proxy (nginx, Caddy) with SSL termination. Do not expose services directly to the public internet.
- **Strong passwords**: Use strong, random passwords for PostgreSQL, Redis, and JWT secrets.
- **BullMQ Dashboard**: If used, protect it behind a reverse proxy with authentication.
- **Global exception filter + Prisma error handling**: In production, the API service returns only `{statusCode, message}` — no stack traces, timestamp, or path. In development, responses include `timestamp`, `path`, and `stack` for debugging. The filter extends `BaseExceptionFilter` from `@nestjs/core` and is registered via `HttpAdapterHost`. All errors are logged server-side with HTTP status and request URL. Prisma errors are mapped to proper HTTP codes (P2002 → 409 Conflict, P2025 → 404 Not Found, P2003 → 400 Bad Request, others → 500) both at the global filter level and per-method via the shared `handlePrismaError()` utility (`apps/api-service/src/common/prisma-error.handler.ts`).
- **Rate limiting**: All API endpoints are rate-limited to prevent abuse. Auth endpoints have a stricter limit (10 req/60s) to mitigate brute-force attacks. The health endpoint is exempt to allow monitoring tools uninterrupted access. Auth rate limiting is validated by an integration test (`auth.controller.spec.ts`) that proves the `@Throttle()` decorator enforces the 10-request cap through the full NestJS HTTP pipeline.
- **JWT token security**: Access tokens are short-lived (15 minutes). Refresh tokens are stored as httpOnly cookies with `sameSite: 'strict'` for CSRF protection. Refresh tokens can be revoked server-side via the `/logout` endpoint.

## Testing

Argus Monitor includes a comprehensive test suite with **271 unit and integration tests** across all 6 microservices, plus **Playwright E2E tests** for the frontend.

### Running Backend Tests Locally

```bash
# Run all unit tests
npm test

# Run with coverage (70% threshold)
npm run test:cov

# Run E2E integration tests (requires PostgreSQL running)
npm run test:e2e
```

### Running Frontend E2E Tests Locally

```bash
cd apps/frontend
npm install
npx playwright install chromium
VITE_E2E_TEST=true npx playwright test
```

The E2E tests use MSW (Mock Service Worker) to mock all API responses — no backend or database needed.

### CI Pipelines

Two GitHub Actions workflows run on every PR:

**Backend CI (`.github/workflows/test.yml`):**
1. Spins up PostgreSQL 16 and Redis 7 service containers
2. Installs dependencies with `npm ci`
3. Generates Prisma client and runs migrations
4. Runs TypeScript type-check and lint
5. Executes all tests with coverage reporting
6. Uploads coverage reports as build artifacts

**Playwright E2E (`.github/workflows/playwright.yml`):**
1. Installs dependencies with `npm ci`
2. Installs Playwright Chromium browser
3. Generates MSW service worker
4. Runs Playwright tests with `VITE_E2E_TEST=true`
5. Uploads Playwright report as artifact

### Test Coverage by Service

| Service | Test Count | Key Test Files |
|---------|-----------|----------------|
| api-service | ~120 | Auth, wallets, alert-rules, chains controllers/services; E2E supertest suite |
| alert-service | ~30 | Alert engine (all rule types), app controller/service |
| solana-adapter-service | ~55 | Solana adapter (mocked Helius), consumer, config, RPC monitor (health checks, snapshots, status change events) |
| notification-service | ~30 | Telegram service (send, format, error handling), NotificationConsumer (dispatch, retry, error handling) |
| chain-indexer-service | ~15 | App controller, service, health check |
| **frontend (E2E)** | **4 spec files** | Auth flow, wallet management, alert rules CRUD, WebSocket connectivity |

## Production Deployment

### Docker Compose (Self-Hosted)

The `docker-compose.prod.yml` file provides a production-ready configuration. It uses the same services as local development but with production-appropriate settings.

```bash
# Start all services in production mode
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop all services
docker compose -f docker-compose.prod.yml down
```

### Building the Frontend for Production

```bash
cd apps/frontend
npm install
npm run build
# Output: apps/frontend/dist/ — serve this with nginx or your reverse proxy
```

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database
POSTGRES_USER=argus
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=argus_monitor
DATABASE_URL=postgresql://argus:<password>@postgres:5432/argus_monitor

# Redis
REDIS_URL=redis://redis:6379

# API Service
# PORT is read by the NestJS app at runtime. Each service in docker-compose
# overrides this via its own *_SERVICE_PORT variable.
PORT=3000

# JWT
JWT_SECRET=<strong-random-secret>
JWT_EXPIRATION_TIME=60s
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Helius (Solana)
HELIUS_API_KEY=<your-helius-api-key>
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Telegram (notifications)
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_CHAT_ID=<your-telegram-chat-id>

# RPC Monitor (embedded in solana-adapter-service)
RPC_MONITOR_PORT=3005
RPC_MONITOR_POLL_INTERVAL_MS=30000
RPC_MONITOR_MAX_SNAPSHOTS=10
RPC_MONITOR_ENDPOINTS=

# Frontend
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

### Reverse Proxy Configuration (nginx)

Example nginx configuration for serving both the frontend and proxying API requests:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend (built SPA)
    root /var/www/argus-monitor/apps/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Monitoring

- **Health checks**: All services expose a `/api/health` endpoint (rate-limit exempt) for monitoring tools.
- **Logs**: All services use structured logging via NestJS `Logger`. Logs are output to stdout/stderr for containerized environments.
- **Metrics**: Prometheus metrics can be added via `@nestjs/prometheus` (see future roadmap).

## Troubleshooting

### Common Issues

1. **Database connection refused**: Ensure PostgreSQL container is running and healthy. Check `docker compose ps`.
2. **Redis connection refused**: Ensure Redis container is running. Check `docker compose ps`.
3. **Migration failures**: Run `make migrate` or `npx prisma migrate deploy` manually.
4. **Frontend can't reach API**: Verify `VITE_API_URL` is set correctly. In development, the frontend defaults to `http://localhost:3000`.
5. **WebSocket not connecting**: Ensure the reverse proxy is configured to handle WebSocket upgrades (see nginx config above).
6. **Playwright tests failing**: Ensure Chromium is installed (`npx playwright install chromium`) and `VITE_E2E_TEST=true` is set.
