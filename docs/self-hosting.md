# Self-Hosting Argus Monitor

This guide walks you through self-hosting Argus Monitor in production.

## Local Development

For a quick one-command setup on a fresh clone, run:

```bash
bash scripts/setup.sh
```

This checks prerequisites (Node.js >= 18, Docker running), installs npm dependencies, creates a `.env` file from `.env.example`, pulls Docker images, and runs Prisma migrations.

After setup, use the `Makefile` at the project root for day-to-day development:

```bash
make up          # start all services
make migrate     # run Prisma migrations
make seed        # seed database with test data
make check       # TypeScript type-check (all apps)
make test        # run all workspace tests
make test-local  # full stack smoke test (reset, health checks, type-check, tests)
make logs        # tail container logs
make reset       # full reset: down -v, migrate, seed, start all
make help        # show all available commands
```

See the [README](../README.md#development) for the full command reference.

### Full Stack Smoke Test

The `test-local` target validates the entire stack end-to-end:

1. **Reset stack** — `docker compose down -v` then starts `postgres` and `redis`
2. **Wait for databases** — polls `pg_isready` and `redis-cli ping` (up to 60s each)
3. **Migrations + seed** — `prisma migrate deploy` then `prisma db seed`
4. **Start all services** — `docker compose up -d`
5. **Health check polling** — polls all 5 services (api-service, chain-indexer, solana-adapter, alert-service, notification)
6. **Type check** — `make check` (tsc --noEmit)
7. **Unit tests** — `make test`

```bash
make test-local          # 7-step smoke test
make test-local-e2e      # same as test-local, then runs e2e tests
```

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
- **JWT token security**: Access tokens are short-lived (15 minutes). Refresh tokens are stored as httpOnly cookies (secure in production, sameSite strict) to prevent XSS and CSRF attacks. Refresh tokens can be revoked server-side via the `/logout` endpoint.
- **Input validation**: All endpoints use a global validation pipe with whitelist (unknown props rejected) and type coercion (string to number for query params) to prevent injection attacks.

## Production Deployment

### 1. Clone and Configure

```bash
git clone https://github.com/fatoh2/argus-monitor.git
cd argus-monitor
cp .env.example .env
# Edit .env with production values:
#   - Generate strong JWT_SECRET: openssl rand -base64 32
#   - Set strong POSTGRES_PASSWORD
#   - Add your HELIUS_API_KEY
#   - Add your TELEGRAM_BOT_TOKEN (optional)
```

### 2. Start the Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 3. Run Migrations

```bash
docker compose -f docker-compose.prod.yml run --rm api-service npx prisma migrate deploy
```

### 4. Verify Health

```bash
curl http://localhost:3000/api/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

### 5. Set Up Reverse Proxy

Configure nginx or Caddy to proxy:
- `api.yourdomain.com` → `localhost:3000` (API service)
- `app.yourdomain.com` → frontend static files or `localhost:80` (frontend)

Enable SSL via Let's Encrypt.

### 6. Monitor

- Check logs: `docker compose logs -f`
- Monitor health endpoints with your preferred monitoring tool
- Review application logs for errors and suspicious activity

## Updating

```bash
git pull origin main
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml run --rm api-service npx prisma migrate deploy
```

## Troubleshooting

### Service fails to start

Check logs:
```bash
docker compose logs <service-name> --tail 50
```

### Database connection issues

Verify PostgreSQL is healthy:
```bash
docker compose exec postgres pg_isready -U argus -d argus
```

### Redis connection issues

Verify Redis is healthy:
```bash
docker compose exec redis redis-cli ping
# Should respond: PONG
```

### Full reset

If the stack is in a broken state, reset everything:
```bash
make reset
```

### Smoke test

Run the full stack smoke test to validate all services:
```bash
make test-local
```
