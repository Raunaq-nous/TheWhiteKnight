# RUN.md — Running CareerOS

This is a local-first app. The canonical data store is a SQLite file on your own machine or VPS. Vercel is for stateless demos only.

---

## Prerequisites

- Node 20 or later (`node --version`)
- npm 10 or later (`npm --version`)
- An [Upstash Redis](https://upstash.com/) database (used for auth/sessions until a later phase moves auth into SQLite)
- A [Together AI](https://api.together.ai/) API key for AI generation

---

## 1. Clone and install

```bash
git clone https://github.com/Raunaq-nous/TheWhiteKnight.git
cd TheWhiteKnight
npm install
```

---

## 2. Create your env file

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every value:

| Variable | Where to get it |
|---|---|
| `TOGETHER_API_KEY` | [api.together.ai](https://api.together.ai) → API Keys |
| `AI_MODEL` | Leave as `deepseek-ai/DeepSeek-V4-Pro` or pick another Together model |
| `AI_VISION_MODEL` | Leave as-is, or pick any multimodal Together model |
| `UPSTASH_REDIS_REST_URL` | Upstash console → your database → REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console → your database → REST API Token |
| `SESSION_SECRET` | Run: `openssl rand -base64 32` |
| `SETUP_SECRET` | Any secret string; used once to create the admin account, then can be removed |
| `ADMIN_EMAIL` | The email address for the admin (your) account |
| `CAREEROS_DB_PATH` | Optional. Defaults to `private/careeros.db` inside the repo. Set an absolute path if you want the DB elsewhere (e.g. `/data/careeros.db`) |

---

## 3. Place your admin profile (optional, for zero-re-entry setup)

If you have a `private/admin-profile.json` seed file (gitignored), it will be loaded automatically on first login as the admin account. The `private/` directory is gitignored; create it if it does not exist:

```bash
mkdir -p private
# Copy your profile seed here:
# private/admin-profile.json
```

The seed is tied to `ADMIN_EMAIL`. It only loads if no profile exists yet for that account, and never overwrites an existing profile.

---

## 4. One-time admin account setup

Run the app, then POST to `/api/admin/setup` **once** to create the admin account:

```bash
curl -s -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"adminPassword":"your-chosen-password","setupSecret":"your-SETUP_SECRET-value"}' | jq
```

Expected response: `{"ok":true}`. After this succeeds, you can remove `SETUP_SECRET` from `.env.local` or leave it (it's a no-op once the account exists).

---

## 5. Run in development

```bash
npm run dev
```

Opens at `http://localhost:3000`. Go to `/login` and sign in with `ADMIN_EMAIL` + the password you chose in step 4. On first login the admin profile seed is loaded automatically.

---

## 6. Run in production (local machine or VPS)

```bash
npm run build
npm start
```

`npm start` runs `next start` on port 3000. To use a different port:

```bash
npm start -- -p 8080
```

### Running with PM2 (recommended for VPS, survives SSH disconnect)

```bash
npm install -g pm2
npm run build
pm2 start "npm start" --name careeros
pm2 save          # persist across reboots
pm2 startup       # follow the printed command to enable startup on boot
```

To check logs: `pm2 logs careeros`
To restart after a code update: `npm run build && pm2 restart careeros`

---

## 7. VPS-specific steps (Ubuntu/Debian example)

```bash
# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone, install, configure
git clone https://github.com/Raunaq-nous/TheWhiteKnight.git /opt/careeros
cd /opt/careeros
npm install
cp .env.example .env.local
# fill in .env.local as described in step 2

# Optional: put your admin-profile.json in place
mkdir -p private
# scp private/admin-profile.json user@your-vps:/opt/careeros/private/

npm run build
pm2 start "npm start" --name careeros
pm2 save && pm2 startup
```

To put Nginx in front (HTTPS):
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    # ... ssl_certificate etc. ...
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 8. Data backup and restore

Export all your data from `/settings` → "Export All Data". The downloaded JSON can be re-imported via the same page.

The raw SQLite file lives at `private/careeros.db` (or `CAREEROS_DB_PATH`). You can back it up with:

```bash
cp private/careeros.db private/careeros.db.bak
```

---

## 9. Docker (see `docker-compose.yml`)

If you prefer containers, see the `Dockerfile` and `docker-compose.yml` at the repo root. The `private/` directory is mounted as a volume so the SQLite file and admin profile survive restarts and image rebuilds.

---

## Env vars reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TOGETHER_API_KEY` | Yes | — | AI generation (resume, cover letter, scoring) |
| `AI_MODEL` | No | `deepseek-ai/DeepSeek-V4-Pro` | Primary LLM |
| `AI_VISION_MODEL` | No | `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` | Vision/image extraction |
| `UPSTASH_REDIS_REST_URL` | Yes | — | Auth (users, sessions) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | — | Auth token |
| `SESSION_SECRET` | Yes | — | JWT signing secret (32+ random chars) |
| `SETUP_SECRET` | Yes (once) | — | Admin account creation guard |
| `ADMIN_EMAIL` | Yes | — | Admin account email; ties profile seed |
| `CAREEROS_DB_PATH` | No | `private/careeros.db` | SQLite file location |
