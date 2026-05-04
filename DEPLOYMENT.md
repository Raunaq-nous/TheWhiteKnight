# Deployment

## Vercel environment variables

Go to your Vercel project → **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `TOGETHER_API_KEY` | Your Together AI API key |
| `AI_MODEL` | `deepseek-ai/DeepSeek-V4-Pro` |
| `AI_VISION_MODEL` | `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` |

Get a Together AI key: https://api.together.ai → Sign up → API Keys

After adding the vars, click **Redeploy** in Vercel.

## Model: DeepSeek V4 Pro

Default model is `deepseek-ai/DeepSeek-V4-Pro` — available on Together AI with Chat, JSON Mode, and Tool Calling support.

## Vercel deploy steps

1. Repo is already on GitHub.
2. Import at https://vercel.com/new → select `Raunaq-nous/TheWhiteKnight`.
3. Add the environment variables above.
4. Deploy. Auto-redeploys on every push to `main`.
