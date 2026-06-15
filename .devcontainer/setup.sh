#!/usr/bin/env bash
# Runs once when the Codespace/devcontainer is first created.
# Requires Codespaces secrets injected as env vars — see devcontainer.json.
set -euo pipefail

echo "=== CareerOS devcontainer setup ==="

# ── Write .env from Codespaces secrets ──────────────────────────────────────
echo "[setup] Writing .env"
mkdir -p private

cat > .env << ENV_EOF
NODE_ENV=development

# Auth
ADMIN_EMAIL=${ADMIN_EMAIL:-}
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL:-}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN:-}
SESSION_SECRET=${SESSION_SECRET:-}
SETUP_SECRET=${SETUP_SECRET:-}

# Cron
CRON_SECRET=${CRON_SECRET:-}

# AI
TOGETHER_API_KEY=${TOGETHER_API_KEY:-}
AI_MODEL=deepseek-ai/DeepSeek-V4-Pro
AI_VISION_MODEL=meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8

# Email
RESEND_API_KEY=${RESEND_API_KEY:-}

# Local data — workspace-relative
CAREEROS_PRIVATE_DIR=$PWD/private
CAREEROS_DB_PATH=$PWD/private/careeros.db
ENV_EOF

chmod 600 .env
echo "[setup] .env written"

# ── Write admin profile if secret is present ─────────────────────────────────
if [[ -n "${ADMIN_PROFILE_JSON:-}" ]]; then
  printf '%s\n' "$ADMIN_PROFILE_JSON" > private/admin-profile.json
  chmod 600 private/admin-profile.json
  echo "[setup] private/admin-profile.json written"
else
  echo "[setup] ADMIN_PROFILE_JSON not set; create private/admin-profile.json manually if needed"
fi

# ── Install deps (retry once) ────────────────────────────────────────────────
echo "[setup] npm install"
if ! npm install; then
  echo "[setup] retrying npm install in 10s"
  sleep 10
  npm install
fi

echo "=== CareerOS devcontainer setup complete. Run 'npm run dev' to start. ==="
