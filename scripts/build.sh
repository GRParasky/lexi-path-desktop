#!/usr/bin/env bash
# =============================================================================
# LexiPath Desktop — full build script (macOS / Linux)
#
# Usage:
#   chmod +x scripts/build.sh
#   ./scripts/build.sh
#
# Prerequisites (must be installed and on PATH before running):
#   - Node.js + npm
#   - Python 3.11+ with a virtualenv at backend/venv/
#     (pip install -r backend/requirements.txt already run)
#   - PyInstaller  (pip install pyinstaller)
#   - UPX optional (improves compression — install via package manager)
#
# What this script does, in order:
#   1. Build the React frontend (Vite → frontend/dist/)
#   2. Collect Django static files (frontend/dist/ → backend/staticfiles/)
#   3. Bundle the Python backend with PyInstaller (→ backend/dist/lexi-path-server/)
#   4. Install Electron dependencies
#   5. Package the Electron app with electron-builder (→ electron/dist/)
# =============================================================================

set -euo pipefail  # exit on error, treat unset vars as errors, fail on pipe errors

# Resolve the project root regardless of where the script is called from
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "=== LexiPath build starting ==="
echo "    Project root: $ROOT"
echo ""

# ---------------------------------------------------------------------------
# Step 1 — Build React frontend
# ---------------------------------------------------------------------------
echo "--- [1/5] Building React frontend ---"
cd "$ROOT/frontend"
npm install --silent
npm run build
echo "    Done: frontend/dist/"

# ---------------------------------------------------------------------------
# Step 2 — Collect Django static files
# ---------------------------------------------------------------------------
echo ""
echo "--- [2/5] Collecting Django static files ---"
cd "$ROOT/backend"

# Activate the virtualenv if it exists; otherwise use the system Python
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

# collectstatic copies frontend/dist/ into backend/staticfiles/
# SECRET_KEY is required by Django to start even for management commands
SECRET_KEY="build-placeholder" \
    python manage.py collectstatic --noinput --clear -v 0
echo "    Done: backend/staticfiles/"

# ---------------------------------------------------------------------------
# Step 3 — Bundle Python backend with PyInstaller
# ---------------------------------------------------------------------------
echo ""
echo "--- [3/5] Bundling Python backend with PyInstaller ---"
cd "$ROOT/backend"

# Remove previous build artifacts so we don't ship stale files
rm -rf build/ dist/

pyinstaller lexi-path-server.spec --noconfirm
echo "    Done: backend/dist/lexi-path-server/"

# ---------------------------------------------------------------------------
# Step 4 — Install Electron dependencies
# ---------------------------------------------------------------------------
echo ""
echo "--- [4/5] Installing Electron dependencies ---"
cd "$ROOT/electron"
npm install --silent
echo "    Done."

# ---------------------------------------------------------------------------
# Step 5 — Package Electron app
# ---------------------------------------------------------------------------
echo ""
echo "--- [5/5] Packaging Electron app ---"
cd "$ROOT/electron"
npm run build
echo "    Done: electron/dist/"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Build complete ==="
echo ""
echo "Output files:"
ls "$ROOT/electron/dist/"
echo ""
echo "Install the app from the file(s) listed above."
