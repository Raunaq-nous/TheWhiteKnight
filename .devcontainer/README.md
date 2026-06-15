# CareerOS — Codespaces Setup

One-time steps to get a fully functional Codespace.

## 1. Add Codespaces secrets

Go to **GitHub → Settings → Codespaces → Secrets → New secret** and scope each
secret to this repository (`raunaq-nous/thewhiteknight`).

| Secret | Description |
|---|---|
| `ADMIN_EMAIL` | Your login email for CareerOS |
| `ADMIN_PASSWORD` | Password for the admin account (min 8 chars) |
| `SESSION_SECRET` | Random 32-byte hex: `openssl rand -hex 32` |
| `SETUP_SECRET` | Random 32-byte hex: `openssl rand -hex 32` |
| `CRON_SECRET` | Random 32-byte hex: `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | From your Upstash Redis dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | From your Upstash Redis dashboard |
| `TOGETHER_API_KEY` | From api.together.ai → API Keys |
| `RESEND_API_KEY` | From resend.com → API Keys |
| `ADMIN_PROFILE_JSON` | JSON object with your full profile (see shape below) |

### ADMIN_PROFILE_JSON shape

```json
{
  "name": "Your Name",
  "email": "you@example.com",
  "phone": "+1 555 000 0000",
  "location": "City, Country",
  "linkedin": "https://linkedin.com/in/yourhandle",
  "website": "https://yoursite.com",
  "summary": "One-paragraph bio.",
  "experience": [],
  "education": [],
  "skills": []
}
```

## 2. Create the Codespace on the right branch

1. Open this repository on GitHub.
2. Click **Code → Codespaces → New codespace**.
3. In the branch dropdown select `claude/analyze-repo-structure-pXSLI`.
4. Click **Create codespace**.

What happens automatically:

- `setup.sh` (postCreateCommand, runs once): installs `python3` + `build-essential`
  so `better-sqlite3` can compile, writes `.env` and `private/admin-profile.json`
  from your secrets, and runs `npm install`.
- `start.sh` (postStartCommand, runs on every start): launches `npm run dev`,
  waits for port 3000, creates the admin account on first run (idempotent; 409 is
  ignored on subsequent starts), then tries to make port 3000 public.

## 3. Set port 3000 public (if auto-publish fails)

`start.sh` calls `gh codespace ports visibility 3000:public` automatically.
If it fails for any reason, set the port public manually:

**Option A — VS Code Ports tab**

1. Open the **Ports** panel (bottom bar or View → Ports).
2. Right-click port **3000**.
3. Choose **Port Visibility → Public**.

**Option B — Codespaces CLI**

```bash
gh codespace ports visibility 3000:public -c "$CODESPACE_NAME"
```
