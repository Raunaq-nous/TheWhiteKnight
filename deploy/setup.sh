#!/usr/bin/env bash
# deploy/setup.sh — CareerOS server bootstrap
# Ubuntu 22.04 / 24.04 · x86_64 · arm64
# Run as root on first boot. Logs everything to /var/log/careeros-setup.log.
# ────────────────────────────────────────────────────────────────────────────
# USAGE
#   1. Fill in every value in the PLACEHOLDERS block below.
#   2. chmod +x setup.sh && sudo ./setup.sh
#      (or paste into cloud-init / user-data — see deploy/README.md)
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ============================================================
# PLACEHOLDERS — fill these in before running.
# NEVER commit a copy with real values — see deploy/README.md.
# ============================================================

# SITE_DOMAIN — set this to skip DuckDNS entirely and use your own domain
# (e.g. one you already point at this server's IP with an A/AAAA record).
# Caddy will request its Let's Encrypt cert for this domain over HTTP.
# Leave empty to fall back to the DuckDNS flow below.
SITE_DOMAIN=""                         # e.g. careeros.example.com

# DuckDNS — free subdomain + auto-renewing DNS (used only if SITE_DOMAIN is empty)
# Register at https://www.duckdns.org → "Domains"
DUCKDNS_SUBDOMAIN="REPLACE_ME"          # e.g. my-careeros
DUCKDNS_TOKEN="REPLACE_ME"              # shown on your DuckDNS dashboard

# CareerOS admin credentials
ADMIN_EMAIL="REPLACE_ME"               # e.g. you@example.com
ADMIN_PASSWORD="REPLACE_ME"            # min 8 chars; choose a strong password

# Secrets — generate each with:  openssl rand -hex 32
SESSION_SECRET="REPLACE_ME"
SETUP_SECRET="REPLACE_ME"
CRON_SECRET="REPLACE_ME"

# Upstash Redis (auth store) — provision free tier at https://upstash.com
UPSTASH_REDIS_REST_URL="REPLACE_ME"    # https://YOUR-DB.upstash.io
UPSTASH_REDIS_REST_TOKEN="REPLACE_ME"

# AI providers
TOGETHER_API_KEY="REPLACE_ME"          # https://api.together.ai → API Keys
RESEND_API_KEY="REPLACE_ME"            # https://resend.com → API Keys
OPENROUTER_API_KEY="REPLACE_ME"        # https://openrouter.ai → Keys (used by Hermes)

# Repo settings
REPO_URL="https://github.com/raunaq-nous/thewhiteknight"
BRANCH="claude/analyze-repo-structure-pXSLI"

# AI model selection (defaults match .env.example; change only if needed)
AI_MODEL="deepseek-ai/DeepSeek-V4-Pro"
AI_VISION_MODEL="meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8"

# Full contents of private/admin-profile.json — paste your real profile below.
# Keys: name, email, phone, location, linkedin, website, summary,
#       experience (array), education (array), skills (array)
read -r -d '' ADMIN_PROFILE_JSON << 'PROFILE_END' || true
{
  "name": "REPLACE_ME",
  "email": "REPLACE_ME",
  "phone": "REPLACE_ME",
  "location": "REPLACE_ME",
  "linkedin": "https://linkedin.com/in/REPLACE_ME",
  "website": "https://REPLACE_ME",
  "summary": "REPLACE_ME",
  "experience": [],
  "education": [],
  "skills": []
}
PROFILE_END

# ============================================================
# END PLACEHOLDERS
# ============================================================

LOG=/var/log/careeros-setup.log
if [[ -n "$SITE_DOMAIN" ]]; then
  DOMAIN="$SITE_DOMAIN"
else
  DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"
fi
CAREEROS_HOME=/home/careeros
REPO_DIR="$CAREEROS_HOME/app"

# Tee everything — start BEFORE exec so the exec line itself is captured.
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

# ── helpers ──────────────────────────────────────────────────
log() { printf '[%s] %s\n' "$(date -u +%T)" "$*"; }
banner() { log ""; log "══════════════════════════════════════"; log "  $*"; log "══════════════════════════════════════"; }

wait_apt_lock() {
  local i=0
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
     || fuser /var/lib/apt/lists/lock     >/dev/null 2>&1; do
    ((i++))
    (( i % 6 == 0 )) && log "Waiting for apt lock (${i}0s)..."
    sleep 10
  done
}

apt_install() {
  wait_apt_lock
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    -o Dpkg::Options::='--force-confnew' "$@"
}

banner "CareerOS bootstrap started $(date -u)"

# ────────────────────────────────────────────────────────────
# 1. System baseline: ufw + non-root user
# ────────────────────────────────────────────────────────────
banner "Step 1: system baseline"
wait_apt_lock
DEBIAN_FRONTEND=noninteractive apt-get update -y
apt_install ufw curl git build-essential python3 gnupg ca-certificates \
  debian-keyring debian-archive-keyring apt-transport-https

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "ufw enabled (ssh/80/443)"

id -u careeros &>/dev/null || useradd -m -s /bin/bash careeros
log "user careeros ready"
log "Step 1 done"

# ────────────────────────────────────────────────────────────
# 2. Node 20 via NodeSource (detects x86 and arm64 automatically)
# ────────────────────────────────────────────────────────────
banner "Step 2: Node 20 + pm2"
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt_install nodejs
fi
log "node $(node -v) · npm $(npm -v)"
npm install -g pm2 --silent
log "pm2 $(pm2 -v) installed"
log "Step 2 done"

# ────────────────────────────────────────────────────────────
# 3. Clone repository
# ────────────────────────────────────────────────────────────
banner "Step 3: clone $REPO_URL @ $BRANCH"
if [[ -d "$REPO_DIR/.git" ]]; then
  log "Repo exists; resetting to origin/$BRANCH"
  su - careeros -c "
    git -C '$REPO_DIR' fetch origin
    git -C '$REPO_DIR' checkout '$BRANCH'
    git -C '$REPO_DIR' reset --hard 'origin/$BRANCH'
  "
else
  su - careeros -c "git clone --depth 1 --branch '$BRANCH' '$REPO_URL' '$REPO_DIR'"
fi
log "Step 3 done"

# ────────────────────────────────────────────────────────────
# 4. Write .env and private/admin-profile.json
# ────────────────────────────────────────────────────────────
banner "Step 4: write .env + private profile"
mkdir -p "$REPO_DIR/private"

# Use printf to avoid any interpretation of escape sequences or $ in values.
cat > "$REPO_DIR/.env" << ENV_EOF
NODE_ENV=production

# Auth
ADMIN_EMAIL=${ADMIN_EMAIL}
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}
SESSION_SECRET=${SESSION_SECRET}
SETUP_SECRET=${SETUP_SECRET}

# Cron
CRON_SECRET=${CRON_SECRET}

# AI
TOGETHER_API_KEY=${TOGETHER_API_KEY}
AI_MODEL=${AI_MODEL}
AI_VISION_MODEL=${AI_VISION_MODEL}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}

# Email
RESEND_API_KEY=${RESEND_API_KEY}

# Local data
CAREEROS_PRIVATE_DIR=${REPO_DIR}/private
CAREEROS_DB_PATH=${REPO_DIR}/private/careeros.db
ENV_EOF

printf '%s\n' "$ADMIN_PROFILE_JSON" > "$REPO_DIR/private/admin-profile.json"

chown -R careeros:careeros "$REPO_DIR"
chmod 600 "$REPO_DIR/.env" "$REPO_DIR/private/admin-profile.json"
log ".env and admin-profile.json written (mode 600)"
log "Step 4 done"

# ────────────────────────────────────────────────────────────
# 5. npm install + build (retry once on failure)
# ────────────────────────────────────────────────────────────
banner "Step 5: npm install + build"
npm_install_and_build() {
  su - careeros -c "cd '$REPO_DIR' && npm install" && \
  su - careeros -c "cd '$REPO_DIR' && npm run build"
}

if ! npm_install_and_build; then
  log "First attempt failed; retrying npm install + build in 15s"
  sleep 15
  npm_install_and_build
fi
log "Step 5 done"

# ────────────────────────────────────────────────────────────
# 6. PM2 — start app, configure systemd startup
# ────────────────────────────────────────────────────────────
banner "Step 6: PM2"
# Stop stale instance if any
su - careeros -c "pm2 delete careeros 2>/dev/null || true"

# Start — run from REPO_DIR so Next.js loads .env
su - careeros -c "cd '$REPO_DIR' && pm2 start npm --name careeros -- start"
su - careeros -c "pm2 save"

# Emit and run the startup command
STARTUP_CMD=$(env PATH="$PATH:/usr/bin:/usr/local/bin" \
  pm2 startup systemd -u careeros --hp "$CAREEROS_HOME" --silent | grep 'sudo env')
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD"
else
  # Fallback: pm2 startup output without --silent
  env PATH="$PATH:/usr/bin:/usr/local/bin" \
    pm2 startup systemd -u careeros --hp "$CAREEROS_HOME" | tail -1 | bash || true
fi

systemctl enable pm2-careeros 2>/dev/null || true
log "pm2 process 'careeros' running; systemd unit enabled"
log "Step 6 done"

# ────────────────────────────────────────────────────────────
# 7. DuckDNS — immediate update + cron every 5 min
#    Skipped entirely when SITE_DOMAIN is set (step 6b already ran instead).
# ────────────────────────────────────────────────────────────
banner "Step 7: DuckDNS"
if [[ -n "$SITE_DOMAIN" ]]; then
  log "SITE_DOMAIN set (${SITE_DOMAIN}); skipping DuckDNS update"
else
  DUCKDNS_API="https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip="
  UPDATE_RESULT=$(curl -sf "$DUCKDNS_API" 2>&1 || echo "ERROR")
  log "DuckDNS immediate update: $UPDATE_RESULT"

  # Idempotent crontab — remove old entry, add fresh one
  (crontab -l 2>/dev/null | grep -v 'duckdns.org/update'; \
    echo "*/5 * * * * curl -sf '${DUCKDNS_API}' >/dev/null 2>&1") | crontab -
  log "DuckDNS cron set (every 5 min)"
fi
log "Step 7 done"

# ────────────────────────────────────────────────────────────
# 8. Caddy — reverse proxy + auto TLS (Let's Encrypt)
# ────────────────────────────────────────────────────────────
banner "Step 8: Caddy"
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  wait_apt_lock && apt-get update -y
  apt_install caddy
fi

cat > /etc/caddy/Caddyfile << CADDY_EOF
${DOMAIN} {
    reverse_proxy localhost:3000
}
CADDY_EOF

systemctl enable caddy
systemctl restart caddy
log "Caddy configured for ${DOMAIN} → localhost:3000"
log "Step 8 done"

# ────────────────────────────────────────────────────────────
# 9. Wait for app + one-time admin setup
# ────────────────────────────────────────────────────────────
banner "Step 9: wait for app + admin setup"
APP_UP=false
for i in $(seq 1 72); do   # 72 × 5s = 6 min max
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    APP_UP=true
    log "App responded on attempt $i"
    break
  fi
  log "Waiting for app... attempt $i/72"
  sleep 5
done

if [[ "$APP_UP" != "true" ]]; then
  log "WARNING: app did not respond within 6 min; skipping admin setup"
  log "(Run: su - careeros -c 'pm2 logs careeros' to diagnose)"
else
  SETUP_HTTP=$(curl -sf -w '\n%{http_code}' -X POST http://localhost:3000/api/admin/setup \
    -H "Content-Type: application/json" \
    -d "{\"setupSecret\":\"${SETUP_SECRET}\",\"adminPassword\":\"${ADMIN_PASSWORD}\"}" \
    2>&1 || echo "CURL_FAILED")
  HTTP_CODE=$(printf '%s' "$SETUP_HTTP" | tail -1)
  SETUP_BODY=$(printf '%s' "$SETUP_HTTP" | head -1)

  if [[ "$HTTP_CODE" == "200" ]]; then
    log "Admin account created successfully"
  elif [[ "$HTTP_CODE" == "409" ]]; then
    log "Admin account already exists (idempotent re-run — OK)"
  else
    log "WARNING: admin setup returned HTTP $HTTP_CODE — body: $SETUP_BODY"
    log "(You can retry manually: POST /api/admin/setup with setupSecret + adminPassword)"
  fi
fi
log "Step 9 done"

# ────────────────────────────────────────────────────────────
# 10. OPTIONAL HERMES STAGE
#     Runs in a subshell; any failure writes HERMES-NEXT-STEPS.txt
#     and does NOT stop or affect the app.
# ────────────────────────────────────────────────────────────
banner "Step 10: optional Hermes stage"

run_hermes() {
  set -euo pipefail
  log "[hermes] Starting optional Hermes installation"

  # Hermes is an AI agent orchestrator. Installer source and config schema
  # vary by version — check https://docs.hermes-ai.dev or the project's
  # mcp/HERMES.md for the current installer URL before running.
  #
  # We probe two known installer locations; if neither is reachable we bail
  # gracefully so the operator can complete setup manually.

  local INSTALLER_URL=""
  local CANDIDATES=(
    "https://raw.githubusercontent.com/NousResearch/hermes/main/install.sh"
    "https://install.hermes-ai.dev/install.sh"
  )

  for url in "${CANDIDATES[@]}"; do
    if curl -sf --max-time 10 --head "$url" >/dev/null 2>&1; then
      INSTALLER_URL="$url"
      break
    fi
  done

  if [[ -z "$INSTALLER_URL" ]]; then
    log "[hermes] No installer URL reachable — see HERMES-NEXT-STEPS.txt"
    return 1
  fi

  log "[hermes] Installing from $INSTALLER_URL"
  curl -fsSL "$INSTALLER_URL" | bash

  # Locate the hermes binary (installer may put it in several places)
  HERMES_BIN=""
  for bin_path in /usr/local/bin/hermes "$CAREEROS_HOME/.local/bin/hermes" \
                  /usr/bin/hermes "$CAREEROS_HOME/.hermes/bin/hermes"; do
    if [[ -x "$bin_path" ]]; then
      HERMES_BIN="$bin_path"
      break
    fi
  done
  if [[ -z "$HERMES_BIN" ]]; then
    HERMES_BIN=$(command -v hermes 2>/dev/null || echo "")
  fi
  if [[ -z "$HERMES_BIN" ]]; then
    log "[hermes] hermes binary not found after install — see HERMES-NEXT-STEPS.txt"
    return 1
  fi
  log "[hermes] binary: $HERMES_BIN"

  # Write config — paths checked against common Hermes conventions.
  # If your version uses a different path, update manually; see NEXT-STEPS.
  local HERMES_CONFIG_DIR="$CAREEROS_HOME/.config/hermes"
  mkdir -p "$HERMES_CONFIG_DIR"

  cat > "$HERMES_CONFIG_DIR/config.yaml" << HERMES_CONF
provider: openrouter
openrouter:
  api_key: "${OPENROUTER_API_KEY}"
  model: "anthropic/claude-opus-4"

mcp_servers:
  careeros:
    command: npm
    args:
      - "--prefix"
      - "${REPO_DIR}"
      - "run"
      - "mcp:dev"
    env:
      CAREEROS_PRIVATE_DIR: "${REPO_DIR}/private"
      CAREEROS_DB_PATH: "${REPO_DIR}/private/careeros.db"
      ADMIN_EMAIL: "${ADMIN_EMAIL}"
      NODE_ENV: "production"
HERMES_CONF

  chown -R careeros:careeros "$HERMES_CONFIG_DIR"
  chmod 600 "$HERMES_CONFIG_DIR/config.yaml"

  # Test MCP server connectivity
  TEST_OUT=$(su - careeros -c "'$HERMES_BIN' mcp test careeros 2>&1" || echo "MCP_TEST_FAILED")
  log "[hermes] MCP test result: $TEST_OUT"
  echo "[hermes] MCP test: $TEST_OUT" >> /root/CAREEROS-STATUS.txt
}

# Capture failure and write manual steps without blocking
if ! run_hermes 2>&1; then
  log "Hermes stage did not complete — writing /root/HERMES-NEXT-STEPS.txt"
  cat > /root/HERMES-NEXT-STEPS.txt << 'HERMES_STEPS'
CareerOS — Manual Hermes Setup Steps
=====================================
The automated Hermes installation did not complete. Perform these steps
manually after logging into the server as root or the careeros user.

REPO_DIR = /home/careeros/app

1. Find the current Hermes installer in the project's mcp/HERMES.md or at
   the official Hermes documentation page (the URL may have changed since
   this script was written).

2. Install Hermes, for example:
     curl -fsSL <current-installer-url> | bash

3. Create/update the config at ~/.config/hermes/config.yaml
   (exact path may vary — check `hermes --help` or the docs):

     provider: openrouter
     openrouter:
       api_key: "<OPENROUTER_API_KEY>"
       model: "anthropic/claude-opus-4"

     mcp_servers:
       careeros:
         command: npm
         args:
           - "--prefix"
           - "/home/careeros/app"
           - "run"
           - "mcp:dev"
         env:
           CAREEROS_PRIVATE_DIR: /home/careeros/app/private
           CAREEROS_DB_PATH: /home/careeros/app/private/careeros.db
           ADMIN_EMAIL: <ADMIN_EMAIL>
           NODE_ENV: production

4. Test the MCP connection:
     hermes mcp test careeros

5. See mcp/HERMES.md in the repo for the full integration reference and
   the table of what the brain must never expose.
HERMES_STEPS
  log "HERMES-NEXT-STEPS.txt written"
fi
log "Step 10 done"

# ────────────────────────────────────────────────────────────
# 11. Final summary
# ────────────────────────────────────────────────────────────
banner "Step 11: final summary"
LIVE_URL="https://${DOMAIN}"

PM2_STATUS=$(su - careeros -c "pm2 list 2>&1" | grep careeros | \
  awk '{for(i=1;i<=NF;i++) if($i~/online|stopped|errored/) {print $i; exit}}' || echo "unknown")
CADDY_STATUS=$(systemctl is-active caddy 2>/dev/null || echo "unknown")
APP_LOCAL=$(curl -sf http://localhost:3000 >/dev/null 2>&1 && echo "responding" || echo "not responding")

cat > /root/CAREEROS-STATUS.txt << SUMM
CareerOS Bootstrap Summary
===========================
Completed : $(date -u)
Live URL  : ${LIVE_URL}
App user  : careeros
Repo      : ${REPO_DIR}
Log       : ${LOG}
DB        : ${REPO_DIR}/private/careeros.db

Service status
  pm2 careeros : ${PM2_STATUS}
  caddy        : ${CADDY_STATUS}
  app (local)  : ${APP_LOCAL}

Useful commands (run as root or careeros)
  su - careeros -c 'pm2 logs careeros'   # live app logs
  su - careeros -c 'pm2 status'          # process list
  systemctl status caddy                 # Caddy / TLS status
  tail -f ${LOG}                         # this bootstrap log

Next steps
  1. Open ${LIVE_URL} in a browser.
     (TLS cert provisions in 30-60 s; port 80 must reach this IP)
  2. Log in with ${ADMIN_EMAIL} and the password you set.
  3. If Hermes was not installed, follow /root/HERMES-NEXT-STEPS.txt.
SUMM

cat /root/CAREEROS-STATUS.txt
log "=== CareerOS bootstrap complete ==="
