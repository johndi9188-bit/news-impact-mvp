#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/vps-bootstrap.sh <repo-url> [app-dir]"
  exit 1
fi

REPO_URL="$1"
APP_DIR="${2:-/opt/news-impact-mvp}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Please install Docker first."
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$(id -u):$(id -g)" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example. Fill secrets before starting."
fi

docker compose -f docker-compose.prod.yml up -d --build
echo "Bootstrap done. App should be at http://<server-ip>:3001"
