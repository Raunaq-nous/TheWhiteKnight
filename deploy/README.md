# CareerOS — Server Provisioning

Two interchangeable scripts in this directory turn a fresh Ubuntu 22.04/24.04
server (x86_64 **or** arm64) into a fully running CareerOS instance with HTTPS
in one unattended boot. No SSH required after pasting.

---

## Files

| File | Use it when… |
|------|-------------|
| `cloud-init.yaml` | Pasting into a cloud provider's "User data" / "Cloud config" field before launch |
| `setup.sh` | Running interactively on an already-booted server (`sudo bash setup.sh`) |

Both files are functionally identical. `cloud-init.yaml` wraps the script as a
`write_files` + `runcmd` pair so the provider's cloud-init agent executes it on
first boot.

---

## Provider field locations

| Provider | Where to paste |
|----------|---------------|
| **Hetzner Cloud** | Create server → "Cloud config" tab → paste `cloud-init.yaml` |
| **Oracle Cloud** | Create instance → "Advanced options" → "Initialization script" → paste `cloud-init.yaml` |
| **DigitalOcean** | Create Droplet → "Advanced options" → "User data" → paste `cloud-init.yaml` |

For `setup.sh`: SSH in as root after the server boots, paste the filled script,
and run `bash setup.sh`.

---

## Before you paste — fill in the placeholders

Open the file you want to use and replace every `REPLACE_ME` value in the
**PLACEHOLDERS block at the top**. There are 14 values:

| Variable | Where to get it |
|----------|----------------|
| `DUCKDNS_SUBDOMAIN` | Register a free subdomain at [duckdns.org](https://www.duckdns.org) |
| `DUCKDNS_TOKEN` | Shown on your DuckDNS dashboard |
| `ADMIN_EMAIL` | The email you will log in with |
| `ADMIN_PASSWORD` | Choose a strong password (min 8 chars) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `SETUP_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Provision free Redis at [upstash.com](https://upstash.com) |
| `UPSTASH_REDIS_REST_TOKEN` | Same Upstash dashboard |
| `TOGETHER_API_KEY` | [api.together.ai](https://api.together.ai) → API Keys |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys |
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) → Keys (optional; used by Hermes) |
| `ADMIN_PROFILE_JSON` | Paste the contents of your `private/admin-profile.json` |
| `REPO_URL` / `BRANCH` | Pre-filled; change only if you forked the repo |

---

## Architecture notes

- **Arch**: NodeSource auto-detects x86_64 vs arm64; `better-sqlite3` compiles
  natively via `build-essential` + `python3` on both.
- **Process manager**: PM2, configured with a systemd startup unit so the app
  restarts on reboot.
- **DNS**: DuckDNS is updated immediately on boot and every 5 minutes via cron
  (`ip=` blank means auto-detect the server's public IP).
- **TLS**: Caddy handles Let's Encrypt automatically — no Certbot, no manual
  certificate steps. The cert provisions within 60 seconds of first HTTPS hit,
  provided your DuckDNS record is pointing at the server.
- **Auth store**: Upstash Redis (temporary; a later phase moves auth into local
  SQLite). Redis is never used for user data.
- **Cron**: a single crontab entry pings `/api/cron/followups` and
  `/api/cron/automation` every 15 minutes, gated by `CRON_SECRET` (`x-cron-secret`
  header). Both endpoints decide internally whether anything is actually due —
  the automation endpoint additionally checks the enabled/schedule toggle set
  in Settings → Automation, so pinging often is safe and cheap. Automation
  scans your enabled target companies, scores new postings, drafts materials
  for good-fit jobs, and stages them for approval at `/approvals` — it never
  sends or submits anything.

---

## Watching progress

```bash
# From your laptop, after the server boots:
ssh root@<server-ip>
tail -f /var/log/careeros-setup.log
```

The full run takes 5-10 minutes on a typical 2-core instance. The log includes
timestamped banners for each step so you can see exactly where it is.

When it finishes, read the summary:

```bash
cat /root/CAREEROS-STATUS.txt
```

---

## Verifying on a phone

1. Open `https://YOUR_SUBDOMAIN.duckdns.org` in a mobile browser.
2. You should see the CareerOS login page with a valid HTTPS padlock.
3. Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

If the padlock is missing, Caddy is still provisioning the cert — wait 60 s and
reload. If it still fails, check:

```bash
systemctl status caddy
journalctl -u caddy -n 50
```

---

## Hermes (optional AI agent)

Step 10 of the script attempts to install and configure Hermes (the external
AI agent that connects to CareerOS via MCP). This step is non-blocking — if it
fails for any reason, the app continues running and the next steps are written
to `/root/HERMES-NEXT-STEPS.txt`.

To complete Hermes setup manually, read that file:

```bash
cat /root/HERMES-NEXT-STEPS.txt
```

Also see `mcp/HERMES.md` in the repo for the full integration reference.

---

## After setup

```bash
# Live app logs
su - careeros -c 'pm2 logs careeros'

# Restart the app
su - careeros -c 'pm2 restart careeros'

# Update to latest code
su - careeros -c "
  cd /home/careeros/app
  git pull
  npm install
  npm run build
  pm2 restart careeros
"
```

---

## SECURITY WARNING

> **The filled script contains live secrets** (API keys, passwords, Redis
> tokens). Treat it like a password file:
>
> - **Never commit a filled copy** to any repository.
> - Delete it from your clipboard / downloads after pasting.
> - The version in this repository contains only `REPLACE_ME` placeholders and
>   is safe to commit.
> - If you accidentally expose secrets, rotate them immediately at each
>   provider's dashboard and regenerate the three random secrets with
>   `openssl rand -hex 32`.
