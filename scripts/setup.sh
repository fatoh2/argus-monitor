#!/usr/bin/env bash
# =============================================================================
# Argus Monitor — One-command local setup
# =============================================================================
# Usage:
#   bash scripts/setup.sh
#
# What it does:
#   1. Checks prerequisites (Node.js >= 18, Docker running)
#   2. Installs npm dependencies (workspaces)
#   3. Copies .env.example → .env if not present
#   4. Pulls Docker images
#   5. Runs Prisma migrations
#   6. Prints success message and next steps
# =============================================================================

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Determine project root (where this script lives) ─────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Argus Monitor — Local Development Setup${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Check Node.js >= 18 ──────────────────────────────────────────────
info "Checking Node.js version..."
if ! command -v node &>/dev/null; then
    fail "Node.js is not installed. Install Node.js >= 18 (https://nodejs.org) and try again."
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    fail "Node.js >= 18 is required. Found: $(node -v). Upgrade and try again."
fi
ok "Node.js $(node -v) — OK"

# ── Step 2: Check Docker is running ──────────────────────────────────────────
info "Checking Docker..."
if ! command -v docker &>/dev/null; then
    fail "Docker is not installed. Install Docker (https://docs.docker.com/get-docker/) and try again."
fi

if ! docker info &>/dev/null; then
    fail "Docker daemon is not running. Start Docker and try again."
fi
ok "Docker $(docker -v | awk '{print $3}' | sed 's/,//') — running"

# ── Step 3: Install npm dependencies ─────────────────────────────────────────
info "Installing npm dependencies (workspaces)..."
if [ ! -d "node_modules" ]; then
    npm install
    ok "npm dependencies installed"
else
    warn "node_modules already exists — skipping install (run 'npm install' manually if needed)"
fi

# ── Step 4: Copy .env.example → .env if not exists ───────────────────────────
info "Checking .env file..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    warn "╔══════════════════════════════════════════════════════════════════╗"
    warn "║  .env file created from .env.example                           ║"
    warn "║  Please edit .env and fill in required values:                 ║"
    warn "║    - JWT_SECRET (generate with: openssl rand -base64 32)       ║"
    warn "║    - HELIUS_API_KEY (get from https://helius.dev)              ║"
    warn "║    - TELEGRAM_BOT_TOKEN (if using notifications)               ║"
    warn "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
else
    ok ".env already exists — skipping"
fi

# ── Step 5: Pull Docker images ───────────────────────────────────────────────
info "Pulling Docker images..."
docker compose pull --quiet 2>/dev/null || docker compose pull
ok "Docker images pulled"

# ── Step 6: Run Prisma migrations ────────────────────────────────────────────
info "Running Prisma migrations..."
docker compose run --rm api-service npx prisma migrate deploy
ok "Prisma migrations applied"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   ✅ Setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Start the stack:${NC}"
echo -e "     docker compose up -d"
echo ""
echo -e "  2. ${YELLOW}Check health:${NC}"
echo -e "     curl http://localhost:3000/api/health"
echo ""
echo -e "  3. ${YELLOW}View logs:${NC}"
echo -e "     docker compose logs -f"
echo ""
echo -e "  4. ${YELLOW}Run tests:${NC}"
echo -e "     npm test"
echo ""
echo -e "  5. ${YELLOW}Stop the stack:${NC}"
echo -e "     docker compose down"
echo ""
echo -e "  ${CYAN}For more commands:${NC}  make help"
echo ""
