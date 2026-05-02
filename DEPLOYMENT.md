# Deployment

The app moved from static GitHub Pages to a full Next.js app with API routes. GitHub Pages can no longer host it because the AI calls now run server-side.

## Required environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORTKEY_API_KEY` | yes | — | Routes all AI traffic through Portkey |
| `PORTKEY_VIRTUAL_KEY` | optional | — | If your Portkey config doesn't have a default, set the virtual key for the underlying provider |
| `AI_MODEL` | optional | `gpt-4o-mini` | Model name passed to the gateway |

Local development: copy `.env.example` to `.env.local` and fill in the key. Never commit `.env.local`.

## Recommended host: Vercel

1. Push the repo to GitHub.
2. Import the repo at https://vercel.com/new.
3. In Vercel project settings, add the env vars above.
4. Deploy. Vercel auto-detects Next.js — no other config required.

Each push to `main` redeploys automatically.

## Other hosts

Any Node host that runs Next.js in production mode works:
- Netlify (with the Next.js plugin)
- Railway
- Self-hosted: `npm run build && npm run start`

## What changed from the static export

- `next.config.js` no longer has `output: 'export'`, `basePath`, or `assetPrefix`.
- `lib/ai-client.ts` is the server-only Portkey client. The Portkey key never reaches the browser.
- API routes under `app/api/*` proxy AI requests:
  - `/api/generate` — resume, cover letter, executive summary, problem solver, skill gap, outreach
  - `/api/score` — JD scoring against target role buckets
  - `/api/extract-jd` — image OCR via Portkey (vision)
  - `/api/skill-builder` — personalized skill progression plan
- The old `careeros_openai_key` localStorage entry and Settings page key field are no longer used by these routes (kept for backward compatibility but inert).
