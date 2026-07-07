#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

PORT="${PRISMA_STUDIO_PORT:-5555}"

exec npm exec prisma studio -- --browser none --hostname 127.0.0.1 --port "$PORT"