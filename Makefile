# =============================================================================
# Argus Monitor — Development Makefile
# =============================================================================
# Usage:
#   make up          — start all services in background
#   make down        — stop all services
#   make migrate     — run prisma migrations (development)
#   make migrate-prod — run prisma migrations (production-style deploy)
#   make seed        — seed the database
#   make check       — TypeScript type-check (api-service)
#   make test        — run all workspace tests
#   make logs        — tail all container logs
#   make psql        — open psql shell in postgres (requires running containers)
#   make redis-cli   — open redis-cli in redis (requires running containers)
#   make reset       — full reset: down -v, start infra, migrate, seed, start all
# =============================================================================

.DEFAULT_GOAL := help

.PHONY: help up down migrate migrate-prod seed check test logs psql redis-cli reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
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

check: ## TypeScript type-check (api-service) — runs inside Docker for consistency
	docker compose run --rm api-service npx tsc --noEmit --project apps/api-service/tsconfig.json

test: ## Run all workspace tests
	npm test --workspaces

logs: ## Tail all container logs
	docker compose logs -f

psql: ## Open psql shell in postgres (requires running containers)
	docker compose exec postgres psql -U ${POSTGRES_USER:-argus} -d ${POSTGRES_DB:-argus}

redis-cli: ## Open redis-cli in redis (requires running containers)
	docker compose exec redis redis-cli

reset: ## Full reset: down -v, start infra, wait for healthy, migrate (deploy), seed, start all
	docker compose down -v
	docker compose up -d postgres redis
	@echo "Waiting for postgres to be healthy..."
	@sleep 3
	@for i in $$(seq 1 30); do \
		if docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-argus} -d ${POSTGRES_DB:-argus} >/dev/null 2>&1; then \
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
