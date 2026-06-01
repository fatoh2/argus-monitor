# Self-Hosting Argus Monitor

This guide walks you through self-hosting Argus Monitor in production.

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
- **Reverse proxy**: The API service should only be accessible via a reverse proxy (nginx, Caddy) with SSL termination. Do not expose services directly to the public internet.
- **Strong passwords**: Use strong, random passwords for PostgreSQL, Redis, and JWT secrets.
- **BullMQ Dashboard**: If used, protect it behind a reverse proxy with authentication.

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
API_SERVICE_PORT=3000
JWT_SECRET=generate-a-strong-random-secret
JWT_EXPIRATION_TIME=60s

# ---- Chain Indexer Service (port 3001) ----
CHAIN_INDEXER_PORT=3001

# ---- Solana Adapter Service (port 3002) ----
SOLANA_ADAPTER_PORT=3002
HELIUS_API_KEY=your-helius-api-key
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-helius-api-key

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
```

**Important:**
- Generate a strong `JWT_SECRET` (e.g., `openssl rand -base64 32`)
- Set a strong `POSTGRES_PASSWORD`
- Set your `HELIUS_API_KEY` — required for Solana monitoring
- Set `TELEGRAM_BOT_TOKEN` if using Telegram notifications
- The `DATABASE_URL` uses service names (`postgres`, `redis`) when running with Docker Compose

### 3. Start the Stack

```bash
docker compose up -d
```

This starts all services: PostgreSQL, Redis, API service, chain indexer, Solana adapter, alert service, notification service, and RPC monitor.

### 4. Run Database Migrations

```bash
docker compose exec api-service npx prisma migrate deploy
```

This creates the required tables: `User`, `Wallet`, `AlertRule`, and `Chain`.

### 5. Verify the Deployment

```bash
# Health check
curl http://localhost:3000/api/health

# Register a test user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-strong-password"}'
```

### 6. Set Up a Reverse Proxy (Recommended)

Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name monitor.example.com;

    ssl_certificate /etc/letsencrypt/live/monitor.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The `proxy_set_header Upgrade` and `Connection` lines are required for WebSocket support.

## Service Ports

| Service | Internal Port | Description |
|---------|---------------|-------------|
| API Service | 3000 | Main API (expose via reverse proxy) |
| Chain Indexer | 3001 | Internal — BullMQ job scheduler |
| Solana Adapter | 3002 | Internal — Helius RPC integration |
| Alert Service | 3003 | Internal — rule evaluation |
| Notification Service | 3004 | Internal — Telegram bot |
| RPC Monitor | 3005 | Internal — RPC health checks |
| PostgreSQL | 5432 | Internal — database |
| Redis | 6379 | Internal — queue & cache |

Only the API Service (port 3000) should be exposed to the internet via a reverse proxy.

## Updating

```bash
cd /opt/argus-monitor
git pull
docker compose down
docker compose build
docker compose up -d
docker compose exec api-service npx prisma migrate deploy
```

## Troubleshooting

### Database connection refused
Ensure PostgreSQL is healthy: `docker compose ps postgres`

### JWT authentication fails
Verify `JWT_SECRET` is set and consistent across restarts.

### WebSocket connections fail
Ensure your reverse proxy supports WebSocket upgrades (see nginx config above).

### Helius API errors
Verify `HELIUS_API_KEY` is valid and has sufficient quota.
