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

## P1-1 Sourcing expansion
```
# 1. Every keyless source answers and maps (one public request each); saves raw captures:
npm run capture:fixtures -- --greenhouse=stripe --lever=<slug> --ashby=<slug> \
  --workday=https://<tenant>.wd<N>.myworkdayjobs.com/<site> --workable=<slug> --recruitee=<slug> \
  --personio=<slug> --teamtailor=<slug> --rippling=<slug>
# 2. Keys present and this month's budget use per keyed source (names only, never values):
curl -s -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/sources | jq '.sources'
# 3. ATS detector on a real company:
curl -s -H "Cookie: $CAREEROS_COOKIE" -H "Content-Type: application/json" -d '{"input":"stripe.com"}' https://<host>/api/companies/detect | jq '.detected, .detection'
# 4. One autopilot run, then read its per-source counts, ghost flags, alert-inbox results and skipped budgets:
curl -s -X POST -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/automation/run
curl -s -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/automation/runs | jq '.[0] | {bySource, jobsGhostFlagged, existingMarkedGone, alertEmailsRead, alertUnresolved, budgetSkipped, errors}'
```
Expect: no Exa source in an autopilot run's bySource; alert jobs resolved to company-direct URLs (or listed in alertUnresolved with the reason); /analytics shows the "Response and interview rates by source" table.
For the alert inbox, set Settings > Integrations > Job-alert inbox (IMAP host, port 993, user, app password, folder) first.

## P1-2 Career tracks and skill pathways
```
# Demand, coverage and pathways per track (annotates unclassified applications by rules first):
curl -s -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/skills/demand | jq '.unclassified, (.tracks[] | {label, jobs, top: [.skills[:5][] | {skill, count, emerging, rating: .coverage.rating}]})'
# Refine 10 jobs with the model (structured chain):
curl -s -X POST -H "Cookie: $CAREEROS_COOKIE" -H "Content-Type: application/json" -d '{"modelLimit":10}' https://<host>/api/skills/demand | jq '.withModel'
```
In the app: open /skills, pick your tracks, check the demand ranking and coverage, draft a pathway for a gap with no seed (it shows DRAFT), accept it, tick its steps and proof, and confirm the "Offer as a profile bullet" flow blocks a forbidden term (try "PX Pulse") before adding.

## P2-1 Feedback capture and playbook
```
# Feedback events recorded so far (counts per kind, newest 100):
curl -s -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/feedback | jq '.counts, (.events[:5])'
# The playbook, pending proposals and recent feedback:
curl -s -H "Cookie: $CAREEROS_COOKIE" https://<host>/api/playbook | jq '{version: .playbook.version, rules: [.playbook.rules[].text], pending: [.proposals[] | select(.status=="pending") | .text]}'
# Run the reflector once (structured chain); proposals come back PENDING:
curl -s -X POST -H "Cookie: $CAREEROS_COOKIE" -H "Content-Type: application/json" -d '{}' https://<host>/api/playbook/propose | jq
# Accept or reject one proposal, remove one rule:
curl -s -X POST -H "Cookie: $CAREEROS_COOKIE" -H "Content-Type: application/json" -d '{"proposalId":"<id>","decision":"accept"}' https://<host>/api/playbook/decide | jq '.playbook.version'
curl -s -X POST -H "Cookie: $CAREEROS_COOKIE" -H "Content-Type: application/json" -d '{"ruleId":"<id>"}' https://<host>/api/playbook/remove | jq '.playbook.version'
# Without a cookie every playbook route answers 401:
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/playbook
```
In the app: reject one item on /approvals with a reason, uncheck a bullet in the resume builder and confirm, refine a cover letter, and move an application's status; each shows up under RECENT FEEDBACK on /playbook. Click "Propose rules from feedback", accept one proposal, regenerate a matching draft, and check the server log or the draft for the rule's effect. Remove the rule and confirm the version goes up by one. With a rule active, re-run `npm run verify:resume -- <email> <slug> consulting` to confirm the page-count and confidentiality gates still pass.
