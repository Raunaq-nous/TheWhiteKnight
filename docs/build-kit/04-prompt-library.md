# THE ONLY PROMPT YOU NEED — paste this into Claude Code

> **How to use:**
> 1. Open your terminal in your empty CareerOS GitHub repo
> 2. Run `claude`
> 3. Drag the `CareerOS-BuildKit.zip` file into the Claude Code window (or place it in the repo root)
> 4. Paste everything below the line as your first message
> 5. Walk away. Come back in 60-90 minutes to approve at the first phase gate.

---

You are bootstrapping CareerOS, my personal AI-powered job application command center. There is a file called `CareerOS-BuildKit.zip` in this directory (or attached to this message). It contains the complete starter kit including product brief, methodology, skills, agents, and configuration files.

Your job in this first session is to do EVERYTHING from setup through the end of Phase 1 (Research) without me touching the keyboard except to approve at the phase gate. I will NOT run any commands manually. I will NOT manually copy any files. You handle all of it.

## Stage 0 — Self-installation (do this silently and report when done)

Execute these steps yourself using your bash and file tools. Do not ask me to do them.

1. **Unzip the build kit** into the repo:
   ```bash
   unzip -o CareerOS-BuildKit.zip
   ```

2. **Move the files to their correct locations** in the repo:
   ```bash
   # Repo-root files
   cp CareerOS-BuildKit/03-Claude-Code-Files/CLAUDE.md ./CLAUDE.md
   cp CareerOS-BuildKit/03-Claude-Code-Files/DATA_CONTRACT.md ./DATA_CONTRACT.md

   # .claude directory (skills + agents) — for Claude Code
   mkdir -p .claude/skills .claude/agents
   cp -r CareerOS-BuildKit/03-Claude-Code-Files/.claude/skills/* .claude/skills/
   cp -r CareerOS-BuildKit/03-Claude-Code-Files/.claude/agents/* .claude/agents/

   # Documentation that Claude reads on demand
   mkdir -p docs/build-kit
   cp CareerOS-BuildKit/01-Product-Brief/product-brief.md docs/build-kit/01-product-brief.md
   cp CareerOS-BuildKit/02-Spec-Driven-Workflow/sdd-workflow.md docs/build-kit/02-sdd-workflow.md
   cp CareerOS-BuildKit/03-Claude-Code-Files/CLAUDE-template-explained.md docs/build-kit/03-CLAUDE-md-template.md
   cp CareerOS-BuildKit/04-Prompt-Library/prompt-library.md docs/build-kit/04-prompt-library.md
   cp CareerOS-BuildKit/05-Education/teenage-engineering-design-tokens.md docs/build-kit/05-design-tokens.md

   # Reference docs that stay in the kit folder for me to read later
   # (no action needed — already unzipped to ./CareerOS-BuildKit/)
   ```

3. **Create the User Layer skeleton folders** so the boundary is real from day one:
   ```bash
   mkdir -p persona/resumes persona/cover-letters
   mkdir -p config applications applications/_archived
   mkdir -p data docs/research docs/spec docs/spec/tasks docs/handoffs docs/reviews
   ```

4. **Make CareerOS Antigravity-ready by mirroring the configuration**:
   ```bash
   # Antigravity reads .agent/ and .gemini/ in addition to .claude/
   # Mirror the skills and agents so the same project works in both tools without re-setup
   mkdir -p .agent/skills .agent/agents
   cp -r .claude/skills/* .agent/skills/
   cp -r .claude/agents/* .agent/agents/

   # Antigravity also reads AGENTS.md as an emerging cross-platform standard
   cp CLAUDE.md AGENTS.md
   ```

   Then create a small `MIGRATION-NOTES.md` at the repo root documenting which files are mirrored and how to keep them in sync if I ever change one.

5. **Create a `.gitignore`** with the right entries for the User Layer / System Layer split:
   ```
   # generated artifacts
   *.pdf
   data/cache/
   .claude/local-cache/
   output/
   reports/

   # OS junk
   .DS_Store
   node_modules/
   __pycache__/
   *.pyc

   # build kit zip — keep extracted version, ignore the zip itself
   CareerOS-BuildKit.zip

   # secrets — never commit
   .env
   .env.local
   config/credentials.yml
   ```

6. **Create a sync-skills.sh script** at the repo root that keeps `.claude/` and `.agent/` mirrored. This is what makes the Antigravity migration zero-effort later:
   ```bash
   #!/usr/bin/env bash
   # Keeps .claude/ and .agent/ in sync so the project works identically in
   # Claude Code and Antigravity without any per-tool reconfiguration.
   set -euo pipefail
   rsync -a --delete .claude/skills/ .agent/skills/
   rsync -a --delete .claude/agents/ .agent/agents/
   cp CLAUDE.md AGENTS.md
   echo "Synced .claude/ → .agent/ and CLAUDE.md → AGENTS.md"
   ```
   Make it executable: `chmod +x sync-skills.sh`

7. **Create a SessionStart hook** at `.claude/settings.json` that runs the sync automatically:
   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "hooks": [
             { "type": "command", "command": "./sync-skills.sh" }
           ]
         }
       ]
     }
   }
   ```
   Mirror the same to `.agent/settings.json` so Antigravity also auto-syncs on session start.

8. **Initial git commit and push**:
   ```bash
   git add -A
   git commit -m "chore: bootstrap CareerOS with build kit + dual Claude Code / Antigravity setup"
   git push
   ```

When all eight steps are done, report a single status block to me:

```
✓ BOOTSTRAP COMPLETE
  • Build kit installed at correct paths
  • CLAUDE.md and DATA_CONTRACT.md at repo root
  • .claude/ and .agent/ mirrored (Antigravity-ready)
  • User Layer skeleton folders created
  • Sync hook configured (auto-runs on session start)
  • .gitignore configured
  • Initial commit pushed to GitHub
```

If any step fails, stop, show me the exact error, and ask one specific question. Do not proceed with broken setup.

## Stage 1 — Read your context (still silent, no questions)

Once setup is complete, read these files in order. Do not summarize them to me yet — just load them into your context:

1. `CLAUDE.md`
2. `DATA_CONTRACT.md`
3. `docs/build-kit/01-product-brief.md` (the full product context)
4. `docs/build-kit/02-sdd-workflow.md` (the methodology)
5. `docs/build-kit/04-prompt-library.md` (the named prompts)
6. `docs/build-kit/05-design-tokens.md` (the Teenage Engineering design language)
7. `.claude/skills/career-os/SKILL.md`
8. `.claude/skills/tailor-resume/SKILL.md`
9. `.claude/skills/ingest-jd/SKILL.md`
10. `.claude/agents/research-investigator.md`

## Stage 2 — Confirm understanding (the only place you talk to me before research)

After reading, say back to me in plain language:

1. **What I understood the goal to be**, in three sentences
2. **The methodology I'm following** and why we stop at phase gates
3. **The hard rules I will enforce** in every output (list them — em dashes, one page, first principles, Aranca = Mumbai, etc.)
4. **What I'm unsure about** — three specific things I'd want to ask you before writing the spec

Then say: *"Proceeding to Phase 1 — Research. I'll spawn four parallel subagents and report back when they've all returned. This will take ~15 minutes."*

## Stage 3 — Run Phase 1 Research (do this without asking permission)

Spawn four parallel subagents using the `research-investigator` agent. Each gets a clean context window. Each returns an 800-word structured report. Then YOU synthesize the four reports into `docs/research/synthesis.md` — I never read the raw reports.

**Subagent A — Reference Architecture:**
> Investigate `santifer/career-ops` on GitHub (https://github.com/santifer/career-ops). Map: directory structure, CLAUDE.md content, the 14 skill modes in `modes/`, the data contract pattern (User Layer vs System Layer), the slash command router. Return: what to copy verbatim, what to adapt, what to skip for our use case.

**Subagent B — Adjacent Tools:**
> Investigate three tools: `Pickle-Pixel/ApplyPilot` (browser-driven application submission via Playwright MCP), `olyaiy/resume-lm` (Next.js + Supabase tracker stack), `Gsync/jobsync` (self-hosted Docker tracker UX). For each: what it does well, what it does badly, what one pattern we should borrow.

**Subagent C — Claude Code Best Practices:**
> Read Anthropic's official Claude Code best practices at code.claude.com/docs and the community-distilled guide at github.com/shanraisshan/claude-code-best-practice. Surface the specific rules for: CLAUDE.md size budget, skill structure, subagent delegation, hook patterns, context window management, and the Antigravity migration path. Output as a checklist we can validate our setup against.

**Subagent D — Teenage Engineering Design Language:**
> Investigate Teenage Engineering's design vocabulary by reading teenage.engineering and three product pages (OP-1 field, OP-Z, TX-6). Extract: typography rules, color palette, spatial system, the "label" microtypography pattern, what they explicitly do NOT do (no shadows, no gradients, etc). Cross-reference against the design tokens already in `docs/build-kit/05-design-tokens.md` — flag anything missing or wrong there.

When all four reports return, synthesize into `docs/research/synthesis.md` with sections for: Architecture decisions, Tools to integrate, Best-practices checklist, Design language confirmation. Commit the synthesis with message `feat(research): Phase 1 synthesis from four parallel subagents`. Push.

## Stage 4 — Phase Gate (this is where I come back)

When the synthesis is committed and pushed, stop and tell me:

```
PHASE GATE — RESEARCH COMPLETE

Artifact: docs/research/synthesis.md

The three biggest decisions in this research:
1. <decision> — <rationale>
2. <decision> — <rationale>
3. <decision> — <rationale>

The three things I'm least confident about:
1. <uncertainty> — <what would resolve it>
2. <uncertainty> — <what would resolve it>
3. <uncertainty> — <what would resolve it>

Awaiting your approval to proceed to Phase 2 (Specification interview).
```

Then stop. Wait for me to type "approved, proceed" before doing anything else.

## How I want you to operate throughout

- **Treat me as the founder/PM, you as tech lead.** Push back once on bad decisions, then comply if I insist. Log overrides in `docs/tradeoffs.md`.
- **Use the AskUserQuestion tool aggressively in Phase 2.** Never assume. Mark assumptions explicitly with `ASSUMPTION:` so I can challenge them.
- **Subagents for ALL research.** Main context stays clean. The phrase is "spin up subagents."
- **Stop at every phase gate.** No advancing without my explicit approval.
- **Honest gaps over plausible filler.** "I don't know" is allowed. Inventing is not.
- **Commit and push after every meaningful step.** I want to see the GitHub repo evolve in real time.
- **No code in this session.** Phase 4 implementation is several gates away.

## What success looks like at the end of session 1

By the time I return to my keyboard:
- The repo has a real structure with CLAUDE.md, DATA_CONTRACT.md, skills, agents, hooks, gitignore, sync script
- Both `.claude/` and `.agent/` are populated and synced — switching to Antigravity later is one `cd` and one `antigravity` command
- A research synthesis is committed at `docs/research/synthesis.md`
- The repo is pushed to GitHub
- You're paused at the Phase 1 gate, waiting for me

If we get there, this works. Go.
