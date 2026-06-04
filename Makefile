# =============================================================================
# Argus Monitor — Development Makefile
# =============================================================================
# Usage:
#   make up          — start all services in background
#   make down        — stop all services
#   make migrate     — run prisma migrations (development)
#   make migrate-prod — run prisma migrations (production-style deploy)
#   make seed        — seed the database
#   make check       — TypeScript type-check (all apps)
#   make test        — run all workspace tests
#   make logs        — tail all container logs
#   make psql        — open psql shell in postgres (requires running containers)
#   make redis-cli   — open redis-cli in redis (requires running containers)
#   make reset       — full reset: down -v, start infra, migrate, seed, start all
#   make test-local  — full stack smoke test (reset, health checks, type-check, tests)
#   make test-local-e2e — full stack smoke test + e2e tests
#   make e2e-setup   — install Playwright browsers (chromium) for E2E tests
#   make e2e         — run Playwright E2E tests (requires stack running)
# =============================================================================

.DEFAULT_GOAL := help

# ── Default environment variables ────────────────────────────────────────────
# These are used by targets that connect to postgres/redis containers.
# Override via shell environment or by passing on the command line:
#   make psql POSTGRES_USER=admin POSTGRES_DB=mydb
POSTGRES_USER ?= argus
POSTGRES_DB   ?= argus

.PHONY: help up down migrate migrate-prod seed check test logs psql redis-cli reset test-local test-local-e2e e2e-setup e2e

help: ## Show this help
	@grep -E '^[-a-zA-Z_][-a-zA-Z0-9_]*:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## docker compose up -d (start all services in background)
	docker compose up -d

down: ## docker compose down (stop all services)
	docker compose down

migrate: ## Run prisma migrations (development — uses migrate dev)
	docker compose run --rm api-service npx prisma migrate dev

migrate-prod: ## Run prisma migrations (production-style — uses migrate deploy)
	docker compose run --rm api-service npx prisma migrate deploy

seed: ## Seed the database
	docker compose run --rm api-service npx prisma db seed

# ── check ────────────────────────────────────────────────────────────────────
# Runs tsc --noEmit inside the api-service container for environment consistency.
# $(PWD) is a Make variable that expands to the project root directory.
# Source directories (apps/, packages/) and tsconfig files are mounted as
# volumes so the container can access TypeScript source files for type-checking.
# The api-service runner image includes node_modules (with tsc) from the build stage.
check: ## TypeScript type-check (all apps) — runs inside Docker for consistency
	docker compose run --rm --no-deps \
		-v $(PWD)/apps:/app/apps \
		-v $(PWD)/packages:/app/packages \
		-v $(PWD)/tsconfig.json:/app/tsconfig.json \
		-v $(PWD)/tsconfig.base.json:/app/tsconfig.base.json \
		api-service npx tsc --noEmit --project tsconfig.json

test: ## Run all workspace tests (inside Docker for consistency)
	docker compose run --rm api-service npm test

logs: ## Tail all container logs
	docker compose logs -f

psql: ## Open psql shell in postgres (requires running containers)
	docker compose exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

redis-cli: ## Open redis-cli in redis (requires running containers)
	docker compose exec redis redis-cli

reset: ## Full reset: down -v, start infra, wait for healthy, migrate (deploy), seed, start all
	docker compose down -v
	docker compose up -d postgres redis
	@echo "Checking that containers started..."
	@docker compose ps --status running --format '{{.Name}}' postgres | grep -q postgres || { echo "ERROR: postgres container failed to start"; exit 1; }
	@docker compose ps --status running --format '{{.Name}}' redis | grep -q redis || { echo "ERROR: redis container failed to start"; exit 1; }
	@echo "Waiting for postgres to be healthy..."
	@sleep 2
	@for i in $$(seq 1 30); do \
		if docker compose exec -T postgres pg_isready -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; then \
			echo "Postgres is healthy!"; \
			break; \
		fi; \
		if [ "$$i" = "30" ]; then \
			echo "ERROR: Postgres failed to become healthy after 30 attempts."; \
			docker compose logs postgres --tail 20; \
			exit 1; \
		fi; \
		echo "Waiting... ($$i/30)"; \
		sleep 2; \
	done
	@echo "Waiting for redis to be healthy..."
	@sleep 2
	@for i in $$(seq 1 30); do \
		if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then \
			echo "Redis is healthy!"; \
			break; \
		fi; \
		if [ "$$i" = "30" ]; then \
			echo "ERROR: Redis failed to become healthy after 30 attempts."; \
			docker compose logs redis --tail 20; \
			exit 1; \
		fi; \
		echo "Waiting... ($$i/30)"; \
		sleep 2; \
	done
	docker compose run --rm api-service npx prisma migrate deploy
	docker compose run --rm api-service npx prisma db seed
	docker compose up -d
	@echo "✅ Stack is up and seeded!"


# ── Test targets ──────────────────────────────────────────────────────────────

test-local: ## Full stack smoke test: reset stack, migrate, seed, health checks, type-check, unit tests
	@echo "=========================================="
	@echo "  Argus Monitor — test-local"
	@echo "=========================================="
	@echo ""
	@echo "📦 Step 1/7: Resetting stack..."
	@docker compose down -v 2>/dev/null || true
	@docker compose up -d postgres redis
	@echo ""
	@echo "⏳ Step 2/7: Waiting for postgres and redis to be healthy..."
	@sleep 2
	@for i in $$(seq 1 30); do \
		if docker compose exec -T postgres pg_isready -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; then \
			echo "  ✅ postgres is healthy!"; \
			break; \
		fi; \
		if [ "$$i" = "30" ]; then \
			echo "  ❌ FAIL: postgres failed to become healthy after 30 attempts."; \
			docker compose logs postgres --tail 20; \
			exit 1; \
		fi; \
		sleep 2; \
	done
	@sleep 2
	@for i in $$(seq 1 30); do \
		if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then \
			echo "  ✅ redis is healthy!"; \
			break; \
		fi; \
		if [ "$$i" = "30" ]; then \
			echo "  ❌ FAIL: redis failed to become healthy after 30 attempts."; \
			docker compose logs redis --tail 20; \
			exit 1; \
		fi; \
		sleep 2; \
	done
	@echo ""
	@echo "📋 Step 3/7: Running migrations and seed..."
	@docker compose run --rm api-service npx prisma migrate deploy || { echo "  ❌ FAIL: migrations failed"; exit 1; }
	@echo "  ✅ migrations complete"
	@docker compose run --rm api-service npx prisma db seed || { echo "  ❌ FAIL: seed failed"; exit 1; }
	@echo "  ✅ seed complete"
	@echo ""
	@echo "🚀 Step 4/7: Starting all services..."
	@docker compose up -d
	@echo ""
	@echo "🔍 Step 5/7: Waiting for all service health checks..."
	@echo "  (waiting 10s for containers to initialize before polling)..."
	@sleep 10
	@for service in \
		"api-service http://localhost:3000/api/health" \
		"chain-indexer http://localhost:3001/health" \
		"solana-adapter http://localhost:3002/health" \
		"alert-service http://localhost:3003/health" \
		"notification http://localhost:3004/health"; do \
		name=$$(echo $$service | cut -d' ' -f1); \
		url=$$(echo $$service | cut -d' ' -f2); \
		printf "  Waiting for %s... " $$name; \
		ok=0; \
		for i in $$(seq 1 30); do \
			if curl -sf "$$url" >/dev/null 2>&1; then \
				ok=1; \
				break; \
			fi; \
			sleep 2; \
		done; \
		if [ "$$ok" = "1" ]; then \
			echo "✅"; \
		else \
			echo "❌"; \
			echo "  ❌ FAIL: $$name did not become healthy after 60 seconds"; \
			docker compose logs $$name --tail 20; \
			exit 1; \
		fi; \
	done
	@echo ""
	@echo "🔧 Step 6/7: Running type check (make check)..."
	@make check || { echo "  ❌ FAIL: type check failed"; exit 1; }
	@echo "  ✅ type check passed"
	@echo ""
	@echo "🧪 Step 7/7: Running unit tests (make test)..."
	@make test || { echo "  ❌ FAIL: unit tests failed"; exit 1; }
	@echo "  ✅ unit tests passed"
	@echo ""
	@echo "=========================================="
	@echo "  ✅ PASS — All checks passed!"
	@echo "=========================================="

test-local-e2e: ## Full stack smoke test + e2e tests: same as test-local, then runs e2e
	@$(MAKE) test-local
	@echo ""
	@echo "🧪 Running Playwright E2E tests..."
	@$(MAKE) e2e || { echo "  ❌ FAIL: e2e tests failed"; exit 1; }
	@echo "  ✅ e2e tests passed"
	@echo ""
	@echo "=========================================="
	@echo "  ✅ PASS — All checks (incl. e2e) passed!"
	@echo "=========================================="
	@echo ""
	@echo "🧹 Cleaning up..."
	@docker compose down -v 2>/dev/null || true
	@echo "  ✅ cleanup complete"


# ── E2E (Playwright) targets ──────────────────────────────────────────────────

e2e-setup: ## Install Playwright browsers (chromium) for E2E tests
	@echo "📥 Installing Playwright Chromium browser..."
	node $(PWD)/node_modules/@playwright/test/cli.js install chromium 2>&1
	@echo "  ✅ Playwright Chromium installed"

e2e: ## Run Playwright E2E tests (requires stack running — make up)
	@echo "🔍 Checking that the stack is running..."
	@if ! curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then \
		echo ""; \
		echo "  ❌ ERROR: stack not running — run 'make up' first"; \
		exit 1; \
	fi
	@echo "  ✅ api-service is healthy"
	@echo ""
	@echo "🧪 Running Playwright E2E tests..."
	@cd apps/frontend && node $(PWD)/node_modules/@playwright/test/cli.js test --reporter=line
	@echo ""
	@echo "=========================================="
	@echo "  ✅ E2E tests passed!"
	@echo "=========================================="
