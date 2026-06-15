#!/usr/bin/env bash
# Runs every time the Codespace/devcontainer starts (after setup.sh has run once).
set -euo pipefail

echo "[start] CareerOS dev server starting on port 3000"
exec npm run dev
