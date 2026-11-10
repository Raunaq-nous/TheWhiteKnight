# CLAUDE.md — CareerOS

> **What this file is:** Claude Code reads this at the start of every session. It's the project's persistent memory. Keep it under 100 lines. Every line must earn its place — if removing it doesn't break anything, delete it.

## What we are building

CareerOS — a personal AI-powered job application command center. Skill-mode architecture (mirrors `santifer/career-ops` pattern). Markdown + YAML on disk as the data layer. Claude Code as the orchestration layer.

Read `docs/build-kit/01-product-brief.md` for the full product context. Don't restate it here.

## Methodology

Spec-Driven Development. Four phases: Research → Specification → Refinement → Implementation. Read `docs/build-kit/02-sdd-workflow.md`. **Stop at every phase gate. Wait for explicit approval before proceeding.**

## Hard rules (these never change)

1. **Never overwrite User Layer files.** User Layer = `cv.md`, `persona/`, `config/profile.yml`, `config/target-roles.yml`, anything in `applications/`. System Layer = `.claude/skills/`, `templates/`, `scripts/`. See `DATA_CONTRACT.md` once it exists.
2. **No em dashes anywhere in any output.** Use commas, semicolons, or restructure. Validate generated PDFs with `grep -c '\u2014'` (must return 0).
3. **One-page resume always.** Max ~30 paragraphs total. Trim aggressively. Skill mode `tailor-resume` enforces this with a paragraph-count check.
4. **First principles thinking in every profile summary**, woven naturally — not as a buzzword.
5. **Aranca location is Mumbai.** Bain location is Gurgaon. Don't mix them up.
6. **Skill modes for everything recurring.** If we do it twice, it becomes a skill.
7. **Subagents for all research.** Main context stays clean. Skills > commands (commands are deprecated).
8. **Stop at 70% context usage.** Run `/clear` and start fresh. Never push into the dumb zone.
9. **Approve before external sends.** Resume export, cover letter export, LinkedIn DM, application submission, outreach email — all require my explicit approval. The two exceptions are the trusted-portal whitelist and the email-to-status sync.

## Layout (target state)

```
careerOS/
├── CLAUDE.md                    # this file
├── DATA_CONTRACT.md             # User Layer vs System Layer boundary
├── docs/
│   ├── build-kit/               # the inputs that bootstrapped the project
│   ├── research/                # Phase 1 outputs
│   └── spec/                    # PRD, SPEC, REFINEMENT, TASKS, tasks/
├── persona/                     # User Layer — my full persona corpus
├── config/                      # User Layer — buckets, profile, portals
├── applications/                # User Layer — one folder per job
├── .claude/
│   ├── skills/                  # System Layer — skill modes
│   ├── agents/                  # System Layer — subagent definitions
│   └── settings.json            # System Layer — hooks
├── templates/                   # System Layer — HTML/CSS for PDF rendering
├── scripts/                     # System Layer — helper scripts
└── data/                        # System Layer — generated state, gitignored
```

## How I want you to work

- Treat me as the founder and PM. You are the tech lead. Push back when my choices have known failure modes; do it once, then comply if I insist.
- Use `AskUserQuestion` aggressively. Never assume.
- Mark assumptions explicitly: `ASSUMPTION:` at the start of the line.
- Explain technical choices in plain language. I am a strategy consultant, not a software engineer. Always say what alternatives you considered and why you picked one.
- When you don't know something, search or ask. Never invent.

## Compaction policy

When the session compacts, preserve:
- The current phase and gate status
- Any open questions
- The list of files I've explicitly approved this session
- Any disagreements I overruled and the reasoning

## Working with the owner (clarity rules)

The owner is not a programmer. They must be able to understand, debug and judge every part of this
codebase, so clarity is a requirement, not a nice-to-have.

### How we build
- Plan first for anything that touches more than two files, sign-in, payments, data deletion or
  database changes: use the plan-first skill. Skip planning for one-sentence fixes.
- Work in small steps. After each step run the project's checks (tests, lint, type check) and show
  the output. Never claim something works without evidence from this session.
- Fix root causes. Do not silence errors, skip tests or wrap code in blanket try/except.
- If two attempts at the same fix fail, stop and explain what you have learned instead of a third.
- Before committing a multi-file change, run the reviewer subagent. An agent's approval never
  replaces the owner's.
- Ask the owner before anything that deletes data, migrates a real database, deploys, or sends
  email or messages.

### How code must read
- Names say what things are and do (`calculateCostOverrun`, not `calc2`).
- One job per function and one topic per file. Prefer plain, boring code over clever code.
- Comments explain why, in one or two lines. Delete comments and TODOs that are no longer true; a
  TODO must name an open issue.
- New or substantially changed files start with a short header: what the file is for, what uses
  it, and the main thing to be careful about.

### Keep the explanations true
- Plain-English notes for every file live in `docs/clarity/` (explain-code skill). They are for the
  owner and are large, so do not read them for ordinary coding tasks unless asked.
- After changing code, run `python3 .claude/clarity/clarity.py sync`, then re-explain the changed
  files (`next --changed`, explainer subagent, `apply`) before finishing.

## Codebase map
- For orientation, read docs/PROJECT_GUIDE.md first.
- If graphify-out/graph.json exists, use `graphify query "<question>"` or `graphify path "<A>" "<B>"` to see how parts connect. Read graphify-out/GRAPH_REPORT.md only for a broad review.
- Use `rg` or a direct file read for exact lookups and for any edit to a known file.
- Never say a function, route or table exists from the map alone; confirm it in the file.
- scripts/graph-refresh.sh rebuilds the map at session start. It is free (no model calls) and quiet; if Graphify cannot be installed, the session simply carries on without it.
- After code changes, run `graphify update .` to refresh the map.
