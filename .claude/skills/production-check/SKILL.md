---
name: production-check
description: Decide, with evidence, whether this repository is ready for real use, and explain the answer in plain English with a scorecard of twelve questions (starts, tests, errors, inputs, secrets, access, data, dependencies, logs, performance, deploy, docs). Use this whenever the owner asks "is this production ready", "can I put this online", "what would break", "how safe is this", for a readiness or launch review, before any first deployment, and after large changes.
---

# Production check

The owner needs an honest yes, no or "not yet" they can act on, not a feeling. Every answer must
rest on evidence you gathered in this session: a command and its output, a file and line, or a
clear absence ("no tests folder exists"). Where you could not check something, say "Not checked" and
why; never guess a pass.

## Steps

1. **Find out how the project runs.** Read the README, `package.json` scripts, `pyproject.toml`,
   `requirements.txt`, `Dockerfile`, CI workflows and deployment config. Note the start, build, test
   and lint commands that actually exist.
2. **Run what is safe to run.** Build, tests, lint and type checks, using the project's own commands.
   Do not deploy, migrate a real database, delete data or contact outside services. If a command
   needs secrets or a network you do not have, record "Not checked" with the reason.
3. **Answer the twelve questions** in `docs/clarity/repo.json` under `readiness.checks` (the ids are
   already there). For each, set `status` (pass, partial, fail or unknown), `evidence` (what you ran
   or saw, with file names in backticks) and `next_step` (the smallest useful fix). What to look for:
   - starts: one documented command that works from a clean checkout.
   - tests: tests exist, they ran, and they passed. Quote the summary line.
   - errors: failures show a clear message; nothing swallows errors silently.
   - inputs: what people type or upload is checked (type, size, required fields).
   - secrets: no keys or passwords in code or git history (`git log -p` search for likely patterns),
     `.env` files ignored, example files hold placeholders only.
   - access: sign-in exists where needed and each action checks permission.
   - data: backups exist; database changes go through migrations, not hand edits.
   - dependencies: versions pinned; run `npm audit --omit=dev` or `pip-audit` if available.
   - logs: errors and key events are logged somewhere the owner could read.
   - performance: anything obviously slow (loading everything into memory, queries in loops).
   - deploy: written deploy and rollback steps; debug switches off in production settings.
   - docs: a newcomer could run and understand it, including the Code Explorer.
4. **Set file-level readiness** for files you inspected (`readiness` in their note cards) where your
   evidence changes the earlier rating.
5. **Overall verdict** in `readiness.overall` and `readiness.summary`: `ready` only when no check
   fails and the critical ones (tests, errors, secrets, access, data, deploy) pass; `not-ready` when a
   critical check fails; otherwise `needs-work`. One or two sentences, plain English, naming the top
   three fixes. Set `readiness.checked_at` to now.
6. Run `python3 .claude/clarity/clarity.py build` so the scorecard appears in the Code Explorer, and
   give the owner the verdict, the top three fixes, and what you could not check.

## Tone

Be direct and specific. "Not ready: anyone can overwrite the data because there is no sign-in" is
useful. "Consider improving security" is not. Do not soften a fail into a partial.
