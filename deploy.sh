#!/usr/bin/env bash
# ============================================================
# Remedy — deploy / update script
# Pulls latest code, ensures the database is up, installs deps,
# builds the frontend, and (re)starts the app under PM2.
#
# Usage:
#   ./deploy.sh            # pull, build, restart
#   ./deploy.sh --no-pull  # skip git pull (deploy local changes)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

say() { printf "\n\033[1;32m▶ %s\033[0m\n" "$1"; }

# 1. Environment file -----------------------------------------
if [ ! -f backend/.env ]; then
  say "No backend/.env found — creating from .env.example"
  cp backend/.env.example backend/.env
  echo "  ⚠️  Edit backend/.env and set real secrets before going live, then re-run."
  exit 1
fi

# 2. Latest code ----------------------------------------------
if [ "${1:-}" != "--no-pull" ] && [ -d .git ]; then
  say "Pulling latest code"
  git pull --ff-only
fi

# 3. Database (Docker PostgreSQL) -----------------------------
say "Ensuring PostgreSQL is up"
docker compose up -d

# 4. Backend dependencies -------------------------------------
say "Installing backend dependencies"
( cd backend && { npm ci || npm install; } )

# 5. Frontend build (backend serves frontend/dist) -----------
say "Building frontend"
( cd frontend && { npm ci || npm install; } && npm run build )

# 6. (Re)start under PM2 --------------------------------------
say "Starting Remedy under PM2"
if pm2 describe remedy >/dev/null 2>&1; then
  pm2 restart remedy --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

PORT="$(grep -E '^PORT=' backend/.env | cut -d= -f2 | tr -d '[:space:]')"
say "Remedy is live on http://localhost:${PORT:-5190}"
