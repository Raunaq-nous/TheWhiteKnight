# Server checks

Exact commands to verify this run's work live, on the server, from the app directory. The build sandbox had no provider keys and no access to openrouter.ai, Together or the job boards, so everything below needs a live check. Replace `https://<host>` with your deployment, `<email>` with your login email and `<slug>` with an application slug. Commands that need login use a session cookie: sign in in the browser, copy the `careeros_session` cookie value, then `export CAREEROS_COOKIE='careeros_session=<value>'`.

## 0. Deploy
```
git pull origin claude/analyze-repo-structure-pXSLI
npm ci
npm run build
# restart your process manager, e.g.
pm2 restart careeros   # or: systemctl restart careeros
```

## P0-1 Resume content and structure
```
npm run verify:resume -- <email> <slug> consulting
```
Expect: the top 5 JD requirements with the bullet covering each; the summary (at most 3 sentences, about 60 words) with its rule check; bullets per employer with scope lines and sub-labels only at Bain and Aranca; each skill with the bullet id that evidences it (no "NO EVIDENCE" lines); education satellite and publications lines; the measured page count and page-two fill.

## P0-2 Fresh-context evaluator gate
```
npm run verify:resume -- <email> <slug> consulting | sed -n '/INDEPENDENT REVIEW/,/GATES/p'
```
Expect: a PASS or FAIL verdict with every criterion; on FAIL, "regenerated once" and the findings. In the app, generate a cover letter and check the "INDEPENDENT REVIEW" panel under it, and in the resume builder.

## P0-3 Model gateway on OpenRouter
```
# 1. Every configured model id is real (OpenRouter list) and every Together model is serverless:
npm run check:models
# 2. Public health is liveness only (no model calls, no key details):
curl -s https://<host>/api/health
# 3. Live probes need login and are cached 10 minutes (?refresh=1 forces a new probe):
curl -s -H "Cookie: $CAREEROS_COOKIE" "https://<host>/api/health/models?refresh=1" | jq '.ok, .openrouter.unknownIds, .together.nonServerlessModels'
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/health/models   # expect 401 without login
# 4. Which model served recent calls, and this month's spend per provider:
curl -s -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/gateway | jq '.resolved, .spend, (.recentCalls | map_values(.[0] | {provider, modelServed, ok}))'
```
If `check:models` reports an UNKNOWN ID, open Settings > Model gateway (admin) and replace it with the matching id from https://openrouter.ai/api/v1/models, or edit config/model-chains.json and redeploy.
