# CareerOS — Product Brief

> **What this document is:** the AI Product Manager's opening artifact. It defines the problem, the user, the principles, the scope, and what we explicitly will not build. Claude reads this first to understand intent before writing any spec.

## 1. Problem statement

Job searching at the senior strategy/AI level is a high-friction, high-repetition workflow with low information density per hour spent. The pattern looks like this:

1. Source jobs across LinkedIn, company career pages, Greenhouse, Lever, Ashby
2. Read each JD (800-1500 words)
3. Decide if it's worth applying
4. Tailor a resume to it (current process: paste JD into Claude.ai, iterate, export PDF)
5. Write a cover letter
6. Find the hiring manager and write outreach
7. Find a referral and write to them
8. Apply on the portal (often 15-30 form fields)
9. Track everything across spreadsheet, email, LinkedIn DMs, calendar
10. Follow up at the right moment
11. Capture interview feedback
12. Repeat 50-200 times

Each step is doable manually. The aggregate is a part-time job. The information is fragmented across five tools none of which talk to each other.

## 2. Who this is for

**Primary user (v1):** Raunaq Rakesh — Strategy consultant + AI builder, 7+ years, targeting senior strategy, AI product, and chief-of-staff roles. India, with global remote and Middle East roles in scope.

**Secondary user (vN):** Anyone running a serious senior-level job search where:
- The jobs require tailoring (not just spray-and-pray)
- The candidate has a deep persona (multiple resumes, builds, certs, publications)
- Outreach matters more than form-filling speed
- The user wants to own their data

The system is single-tenant per user but the data model supports N profiles from day one.

## 3. North star

**One canonical place where the entire job search lives, and where every repeatable task is automated by an agent that knows me.**

Specifically:
- Jobs sourced automatically against my target profiles
- Each job becomes its own "application page" with full context
- One click generates tailored resume + cover letter + outreach + referral asks
- Auto-apply runs in supervised mode for portals I trust
- Email and LinkedIn updates flow back into the application page
- Status moves automatically based on signals (interview scheduled, rejection received, etc.)
- I can update anything in natural language: *"Got a call from Bain, second round next Tuesday"*

## 4. Design principles (non-negotiable)

These are decisions that bind every feature. Claude must enforce them; I must not break them in moments of weakness.

1. **Local-first, my data on my machine.** GitHub for code, local SQLite or filesystem for data. No SaaS lock-in. Cloud APIs (Anthropic, Gmail OAuth) are integrations, not destinations.
2. **Automate analysis, not decisions.** The system filters, scores, drafts, and suggests. I approve every external send (resume, cover letter, LinkedIn message, application submission). Two exceptions allowed: (a) a "trusted portal whitelist" for auto-apply with daily cap, (b) automatic email-to-status sync.
3. **Markdown as the universal format.** Resumes, cover letters, JDs, notes — all markdown until the moment they need to be PDFs. Plain text is searchable, diffable, and AI-native.
4. **Skill modes, not monolithic prompts.** Every recurring task lives in `.claude/skills/<name>/SKILL.md`. The system grows by adding skills, not by getting longer.
5. **User layer vs system layer.** Files I personalize (cv.md, profile.yml, target-roles.yml) are never overwritten by updates. Files the system generates (reports, drafts, tracker rows) are versioned and replaceable. This boundary is encoded in `DATA_CONTRACT.md`.
6. **One page resume rule, every time.** Already encoded in my Claude memory. The system enforces it programmatically (paragraph count check, em-dash check, AI-tone check) before any export.
7. **First principles thinking in every profile summary.** Already encoded in memory. System enforces.
8. **Teenage Engineering design language.** Functional, monospaced, dense, label-heavy, controlled palette, no decoration that doesn't carry information.
9. **Graceful degradation.** If an integration breaks (Gmail rate limit, LinkedIn DOM change), the manual workflow still works.
10. **Multi-profile from day one in the data model**, even if v1 ships with only my profile populated. Cheaper to design for N now than refactor later.

## 5. The five capabilities (v1 scope)

These are the capabilities we are committing to build in v1. Anything else is out of scope until v1 ships.

### Capability 1: Job sourcing and bucket management

- I define 4-5 "target profile buckets" in a YAML file: title patterns, seniority bands, geographies, sectors, exclusions
- A scanner agent runs against LinkedIn, Greenhouse, Lever, Ashby, and a configurable list of company career pages
- Manual JD entry: I paste a URL or full JD text and the system ingests it
- New jobs are scored against my buckets and tagged with the matching bucket(s)
- Buckets are editable; updating a bucket re-scores existing jobs in the database

### Capability 2: Application page (one per job)

Each job in the database has a folder structure:

```
applications/<company>-<role-slug>/
├── jd.md                      # canonical JD
├── score.md                   # bucket match, A-F evaluation
├── resume.pdf + resume.md     # tailored deliverables
├── cover-letter.pdf + .md
├── outreach/
│   ├── hiring-manager.md
│   ├── referral-asks.md
│   └── linkedin-dm.md
├── log.md                     # natural language updates I write
├── emails/                    # synced threads from Gmail
└── status.yml                 # current state, dates, contacts
```

A page is "killed" by moving the folder to `applications/_archived/<reason>/`. Reason is one of: `not-interested`, `rejected`, `withdrawn`, `stale-30d`, `accepted-elsewhere`. A configurable rule auto-archives stale applications.

### Capability 3: Persona-driven generation

The system maintains my full persona in a structured corpus:

```
persona/
├── master-cv.md                # canonical version, source of truth
├── resumes/                    # all variants we've ever built
├── cover-letters/
├── github-projects.md          # auto-synced from my GH
├── certifications.md
├── publications.md
├── website-content.md
└── voice-samples.md            # examples of my actual writing tone
```

Generation skill modes:
- `/career-os tailor` → resume + cover letter for the current application
- `/career-os outreach hiring-manager` → cold message draft
- `/career-os outreach referral` → ask-for-referral message to a named contact
- `/career-os linkedin-dm` → short DM variant

Every generation reads from persona/, applies my hard rules (no em dashes, one page, first principles, etc.), and writes to the application folder.

### Capability 4: Auto-apply (supervised)

Two modes:
- **Manual + assist:** I open the portal, the system fills the form via browser automation, I review and submit. This is the default.
- **Trusted auto-apply:** Whitelisted portals only (configurable list, starts empty). System fills, submits, logs. Hard daily cap. Hard score threshold. Always logged with screenshot.

We are using Playwright (or Playwright MCP server) for browser automation, mirroring the ApplyPilot and career-ops pattern.

### Capability 5: Pipeline tracking and natural language updates

- A status board showing every active application by stage: `sourced → reviewed → applied → response → interview → offer/rejection`
- Natural language input: *"Got a call from Bain. Recruiter is Priya Mehta. Second round Tuesday."* Claude parses → updates status.yml → adds to log.md → schedules a reminder.
- Email integration (Gmail OAuth, read-only): inbound mail referencing a tracked company is auto-attached to the application, status hints are extracted, I confirm or override.
- Calendar integration: interview emails create calendar events I can confirm.
- Rejection feedback flow: when status moves to `rejected`, system drafts a feedback request email I can send.

## 6. Out of scope for v1 (explicit)

These are things I will want and we are deliberately not building first:

- Mobile app (web/desktop only)
- Multi-user authentication and team features
- Salary negotiation tooling (career-ops has this; v2 candidate)
- Behavioral interview prep / STAR story library (v2 candidate)
- Job market analytics dashboards (v2 candidate)
- Slack / Discord integration
- Anything requiring me to host a server somewhere

## 7. Success metrics

How I'll know v1 worked:

- **Speed:** Time from "saw a JD" to "applied with tailored materials" drops from ~90 min to under 15 min
- **Coverage:** I'm tracking 100% of active applications in one place (vs. ~60% manually)
- **Quality:** Tailored materials pass the same quality bar as the ones we built manually in this conversation
- **Retention of voice:** A recipient cannot tell my outreach is AI-drafted
- **Maintainability:** I can add a new skill mode in under 30 minutes

## 8. Tech stack — opinionated default (challenge me on this in the research phase)

Per my research, the strongest default for this build is:

- **Application core:** Claude Code as the orchestration layer (skills, subagents, hooks). No traditional backend framework yet. Markdown files + YAML on disk are the database for v1.
- **Browser automation:** Playwright via MCP server
- **PDF generation:** Headless Chromium (Puppeteer) with HTML/CSS templates — same as career-ops
- **Email:** Gmail API via OAuth (read-only scope first)
- **UI for the tracker:** Either a Go TUI dashboard like career-ops uses, OR a local Next.js + Tailwind app that reads the same markdown files. **This is a Phase 2 decision; I want Claude to do a tradeoff analysis.**
- **Calendar:** Google Calendar API
- **Local data:** plain markdown + YAML; if we need indexing, SQLite via better-sqlite3

When (not if) v1 outgrows markdown-as-database, we migrate to Postgres or DuckDB. Not before.

## 9. The bet

The bet behind this product is: **the right level of abstraction for a personal job search tool is "skill modes operating on markdown files," not "a SaaS app with an ORM."** career-ops proved this works at 740+ applications and 37k stars. We are extending the pattern, not inventing a new one.

If that bet is wrong, we'll feel it when the application count grows past ~500 and querying gets slow. That's a known migration path, not a design flaw.
