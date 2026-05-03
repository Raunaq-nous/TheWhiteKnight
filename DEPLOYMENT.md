# Deployment

## Build status

The build succeeds. The "vulnerable Next.js" warning from 15.3.2 is resolved — upgraded to 16.x.

## Required environment variables in Vercel

Go to your Vercel project → **Settings → Environment Variables** and add these:

| Variable | Required | Value |
|---|---|---|
| `PORTKEY_API_KEY` | yes | Your Portkey API key |
| `AI_PROVIDER` | yes (if no virtual key) | `together-ai` |
| `AI_PROVIDER_KEY` | yes (if no virtual key) | Your Together AI key |
| `PORTKEY_VIRTUAL_KEY` | alternative | A Portkey virtual key pre-configured for your provider |
| `AI_MODEL` | optional | `deepseek-ai/DeepSeek-V3` (default) |
| `AI_VISION_MODEL` | optional | `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` |

### Quickest path to working AI calls

**Option A — Via Portkey virtual key (no extra keys needed):**
1. Log into https://app.portkey.ai
2. Go to Virtual Keys → Add Virtual Key → select Together AI → paste your Together AI key
3. Copy the virtual key ID and paste it as `PORTKEY_VIRTUAL_KEY` in Vercel
4. Leave `AI_PROVIDER` and `AI_PROVIDER_KEY` blank

**Option B — Direct provider routing:**
1. Get a Together AI key at https://api.together.ai
2. In Vercel env vars, set:
   - `AI_PROVIDER` = `together-ai`
   - `AI_PROVIDER_KEY` = `your_together_ai_key`
3. Leave `PORTKEY_VIRTUAL_KEY` blank

In both cases, `AI_MODEL` defaults to `deepseek-ai/DeepSeek-V3`.

## Recommended model: DeepSeek V3

DeepSeek V3 is the best open-source model for complex reasoning and generation tasks.
It matches Claude Opus-class performance on writing, analysis, and structured output.

Available through Together AI, Fireworks AI, and Groq.
Together AI free tier includes generous credits to start.

Get a Together AI key: https://api.together.ai → Sign up → API Keys

## Vercel deploy steps

1. Push to GitHub (already done)
2. Import repo at https://vercel.com/new
3. Add the environment variables above
4. Click Deploy

Auto-redeploys on every push to `main`.
