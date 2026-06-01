# Deployment

## Runtime: SQLite on local machine or own VPS (canonical)

CareerOS is designed to run on **your own machine or a VPS you control.** The SQLite file is the canonical data store and must never leave your machine.

### Local development

```bash
cp .env.example .env.local
# Fill in TOGETHER_API_KEY, SESSION_SECRET, SETUP_SECRET, ADMIN_EMAIL
npm install
npm run dev
```

Visit `http://localhost:3000`. On first run, POST to `/api/admin/setup` with your chosen password and setup secret to create your admin account.

### Own VPS deploy (recommended for always-on access)

1. Provision a small VPS (1 GB RAM is enough).
2. Clone the repo, copy `.env.example` to `.env.local`, fill in values.
3. `npm install && npm run build && npm start` (or use PM2).
4. Optionally put Nginx in front for HTTPS.
5. Your SQLite file lives at the path configured in Phase 1 data layer.

## Vercel (stateless UI demo only)

Vercel can host the Next.js frontend as a stateless demo (profile stored in localStorage, no SQLite). It is **not** the actionable engine.

If you deploy to Vercel anyway, add these environment variables:

| Variable | Value |
|---|---|
| `TOGETHER_API_KEY` | Your Together AI API key |
| `AI_MODEL` | `deepseek-ai/DeepSeek-V4-Pro` |
| `AI_VISION_MODEL` | `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` |
| `SESSION_SECRET` | 32 random chars (`openssl rand -base64 32`) |
| `SETUP_SECRET` | One-time secret for admin account creation |
| `ADMIN_EMAIL` | Your email address |

## Environment variables reference

See `.env.example` for all variables with descriptions.
