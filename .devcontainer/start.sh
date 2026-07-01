#!/usr/bin/env bash
# Runs every time the Codespace/devcontainer starts.
# Starts the production server, waits for it, runs one-time admin setup, publishes port.
set -euo pipefail

echo "[start] Starting CareerOS on port 3000..."
npm start &
DEV_PID=$!

# -- Wait up to 60s for port 3000 --------------------------------------------
echo "[start] Waiting for port 3000..."
TRIES=0
until curl -sf http://localhost:3000 >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -ge 30 ]]; then
    echo "[start] WARNING: port 3000 did not respond after 60s; skipping post-start steps."
    wait "$DEV_PID"
    exit $?
  fi
  sleep 2
done
echo "[start] Port 3000 is up."

# -- Admin setup (idempotent; 409 = already exists, that is fine) ------------
if [[ -n "${SETUP_SECRET:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3000/api/admin/setup \
    -H "Content-Type: application/json" \
    -d "{\"setupSecret\":\"${SETUP_SECRET}\",\"adminPassword\":\"${ADMIN_PASSWORD}\"}" \
    2>/dev/null || echo "000")
  case "$HTTP" in
    200) echo "[start] Admin account created." ;;
    409) echo "[start] Admin account already exists (OK)." ;;
    *)   echo "[start] Admin setup returned HTTP $HTTP; run manually if needed." ;;
  esac
else
  echo "[start] SETUP_SECRET or ADMIN_PASSWORD not set; skipping admin setup."
  echo "[start] To create the admin account, POST /api/admin/setup with setupSecret + adminPassword."
fi

# -- Make port 3000 public in Codespaces -------------------------------------
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" 2>/dev/null \
    && echo "[start] Port 3000 is now public." \
    || echo "[start] Auto-publish failed. Manual: Ports tab -> right-click 3000 -> Port Visibility -> Public"
fi

echo "[start] CareerOS running. Streaming server output..."
wait "$DEV_PID"
