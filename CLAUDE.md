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
  shared-types/             NormalizedTransaction, ChainAdapter interface, queue names
  ui/                       Shared React components
k8s/apps/                   Helm charts for all services
docker-compose.yml          Local dev — all services + PostgreSQL + Redis
docker-compose.prod.yml     Self-hosted production
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
- Queue names are defined in `packages/shared-types/src/queues.ts` — never hardcode
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
Do NOT create a separate auth-service until explicitly instructed.

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
