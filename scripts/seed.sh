#!/usr/bin/env bash
# =============================================================================
# LexiPath — dev seed script
#
# Wipes and recreates the developer's learning paths in the local database,
# giving a known, reproducible environment for testing bugfixes and new features.
#
# Usage:
#   ./scripts/seed.sh
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/backend"

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

SECRET_KEY="dev-seed-placeholder" \
APP_DATA_DIR="$HOME/.local/share/LexiPath" \
    python manage.py seed_dev
