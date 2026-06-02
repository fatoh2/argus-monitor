# =============================================================================
# Argus Monitor — Development Makefile
# =============================================================================
# Usage:
#   make up          — start all services in background
#   make down        — stop all services
#   make migrate     — run prisma migrations (dev)
#   make migrate-prod — run prisma migrations (production)
#   make seed        — seed the database
#   make check       — TypeScript type-check across all apps
#   make test        — run all workspace tests
#   make logs        — tail all container logs
#   make psql        — open psql shell in postgres
#   make redis-cli   — open redis-cli in redis
#   make reset       — full reset: down -v, up, migrate, seed
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

migrate: ## Run prisma migrations (development)
	docker compose run --rm api-service npx prisma migrate dev

migrate-prod: ## Run prisma migrations (production)
	npx prisma migrate deploy --schema=apps/api-service/prisma/schema.prisma

seed: ## Seed the database
	docker compose run --rm api-service npx prisma db seed

check: ## TypeScript type-check across all apps
	npx tsc --noEmit --project apps/api-service/tsconfig.json

test: ## Run all workspace tests
	npm test --workspaces

logs: ## Tail all container logs
	docker compose logs -f

psql: ## Open psql shell in postgres container
	docker compose exec postgres psql -U ${POSTGRES_USER:-argus} -d ${POSTGRES_DB:-argus}

redis-cli: ## Open redis-cli in redis container
	docker compose exec redis redis-cli

reset: ## Full reset: down -v, up, migrate, seed
	docker compose down -v
	docker compose up -d postgres redis
	@echo "Waiting for postgres to be healthy..."
	@sleep 5
	docker compose run --rm api-service npx prisma migrate dev
	docker compose run --rm api-service npx prisma db seed
	docker compose up -d
	@echo "✅ Stack is up and seeded!"
