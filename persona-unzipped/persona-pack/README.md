# Raunaq Rakesh — Persona Pack for CareerOS

> **What this is:** the complete persona corpus for CareerOS, derived from 27+ tailored resumes, multiple cover letters, full career history, GitHub projects, certifications, IEEE publications, and writing voice samples accumulated across our conversations.
>
> **Where this goes:** drop into the root of your TheWhiteKnight repo. The folder structure mirrors CareerOS's expected layout exactly.

## What's inside

```
persona/
├── master-cv.md                # canonical career corpus, single source of truth
├── voice-samples.md            # writing tone reference, real samples
├── github-projects.md          # AI builds described by capability
├── certifications.md           # all certs with role-relevance metadata
├── publications.md             # 5 IEEE papers, when to include them
├── website-content.md          # snapshot of the portfolio site
└── resumes/
    └── INDEX.md                # archive of 25+ tailored resumes by archetype

config/
├── profile.yml                 # contact info, location, comp targets
└── target-roles.yml            # 4 buckets: MBB, AI Product, CoS, Strategy & Ops

applications/
└── anthropic-ai-product-manager/   # one example application folder
    ├── jd.md
    └── metadata.yml
```

## How to integrate (Antigravity workflow)

You have two paths. Pick whichever fits how you're working in Antigravity right now.

### Path A — Drop and commit (simplest, 2 minutes)

1. **Unzip** this pack on your laptop
2. **Open your TheWhiteKnight folder** in Antigravity
3. **Drag the entire `persona/` folder** into your repo root in Antigravity's file explorer
4. **Drag the entire `config/` folder** into your repo root (it'll merge with your existing `config/`, overwriting `profile.yml` and `target-roles.yml` with the more complete versions)
5. **Drag the `applications/anthropic-ai-product-manager/` folder** into your existing `applications/`
6. In the Antigravity chat, type:

   > Stage all the new files in `persona/`, `config/`, and `applications/`. Commit with the message `feat(persona): import full persona corpus from master pack`. Push to GitHub.

That's it. Refresh `github.com/Raunaq-nous/TheWhiteKnight` and you'll see all the files. The dashboard at raunaq-nous.github.io/TheWhiteKnight will rebuild automatically via your existing GitHub Actions setup.

### Path B — Have Antigravity install it (if drag-and-drop is awkward)

1. **Place this zip file** (`persona-pack.zip`) anywhere accessible — Downloads folder works
2. **In Antigravity chat**, paste:

   > I have a file called `persona-pack.zip` in my Downloads folder. Move it into this project's root, unzip it, merge the contents into the existing `persona/`, `config/`, and `applications/` folders (overwriting where files already exist), delete the zip after extraction, then stage everything, commit with the message `feat(persona): import full persona corpus from master pack`, and push to GitHub.

3. Watch Antigravity do the work. Approve any permission prompts.

## After integration — what your dashboard shows

Once pushed, your CareerOS dashboard will reflect:

**Persona page:**
- Master CV: ✓ populated (was pending, now complete)
- Voice samples: ✓ populated
- GitHub projects: ✓ populated
- Certifications: ✓ populated
- Publications: ✓ populated
- Website content: ✓ populated
- Resume archive: 25+ entries (was 5, now full)

**Config page:**
- Profile info: ✓ complete with all contact details, comp targets, work auth
- Target roles: 4 buckets fully specified with scoring rubric and archive rules

**Applications page:**
- Anthropic application: 1 backed by real `jd.md` + `metadata.yml`
- The other 9 cards on your dashboard will need their own folders created (next step below)

## Next steps after integration

### 1. Backfill the other 9 application folders

Your dashboard shows 10 cards but only 1 (Anthropic) has a backing folder in this pack. To populate the rest, in Antigravity:

> Read `applications/anthropic-ai-product-manager/jd.md` and `metadata.yml` as templates. Create matching folders for the other 9 applications shown on the dashboard (Bain, BCG, talabat, MoonPay, KernelDAO, etc.). Use the metadata I've provided in the dashboard as the starting point. For JDs you don't have full text for, write a one-line placeholder I can fill in later.

### 2. Tie your existing 25+ docx resumes into the archive

If you have the actual `.docx` files saved locally, drop them into `persona/resumes/` so the `tailor-resume` skill can reference them. If you don't, leave the INDEX.md as a manifest — CareerOS uses the index to find archetype matches even without the underlying files (it just won't be able to skim them as references).

### 3. Verify the design language matches expectations

Open the dashboard. Compare against the Teenage Engineering principles. Specifically check:
- Are the status pills monospace and uppercase?
- Are dividers hairline (1px) rather than shadows?
- Is the only saturated color orange (or the royal blue you chose)?
- Are dates ISO format or DD MMM YYYY?

If anything looks off, tell Antigravity:

> Audit the dashboard against the design tokens at `docs/build-kit/05-design-tokens.md`. Flag any divergences. Show me the proposed fixes before applying them.

## Hard rules baked into this pack

These rules are encoded across `master-cv.md`, `voice-samples.md`, and the skill files. CareerOS will enforce them on every output:

1. Single page maximum, ~30 paragraphs
2. Zero em dashes anywhere
3. No double-spaced hyphens
4. First principles thinking woven naturally
5. **Aranca = Mumbai** (Bain, Evalueserve, Tecnova = Gurgaon; Madcue = Bangalore; Delbomblr = Delhi)
6. AI tools described by capability, never by product name (especially Haus-Nous)
7. GitHub repos described by function, not parenthetical
8. No team size numbers
9. No "consumer-facing"
10. No two projects combined in a single bullet
11. Skills sections lean (2-3 rows, no Leadership row)
12. Pipe separators for certifications, dates, education
13. Verb-first bullets, selective bold inside
14. Years of experience accurate (7+ default, 9+ broader, 10 from Madcue)

## Placeholders to fill in when ready

These are explicitly marked as gaps so they don't ship as fabrications:

- **`$XXM` Series A figure** for the Aranca EMEA marketplace project — fill in `master-cv.md` Aranca section
- **`XX ppt` IRR improvement** for the Bain solar project — fill in `master-cv.md` Bain section
- **Delbomblr Inc** project details for 2018-2019 — fill in `master-cv.md` Delbomblr section
- **Fifth IEEE publication** title and conference — fill in `publications.md`
- **Salary expectations** — review and adjust in `config/profile.yml` to your current actual targets

## The integration test

After pushing, run this in Antigravity to verify CareerOS is wired up correctly:

> Read `persona/master-cv.md` and `config/target-roles.yml`. Score this hypothetical JD against my buckets: "Senior AI Product Manager at a Series B fintech startup, Bangalore hybrid, building agentic AI workflows for B2B sales operations." Report which bucket(s) match and what score, with reasoning.

Expected output: should match strongly against `ai-product` bucket (high keyword density on agentic, AI, B2B, fintech), score around 8.5-9.0, with a side-match on `strategy-ops` for the fintech sector. If the response looks reasonable, the persona is wired up correctly.

## Repo links for reference

- **CareerOS source code:** github.com/Raunaq-nous/TheWhiteKnight
- **CareerOS deployed dashboard:** raunaq-nous.github.io/TheWhiteKnight
- **Personal portfolio:** raunaq-nous.github.io/raunaq-portfolio/builds
- **GitHub profile:** github.com/Raunaq-nous

## What this pack does NOT include

- The actual `.docx` files of the 25+ tailored resumes — those live on your local machine from earlier conversations. The INDEX.md is the manifest; copy the actual files into `persona/resumes/` separately when you're ready.
- Your real Gmail OAuth tokens or LinkedIn cookies — those go in `config/credentials.yml` (gitignored) when you set up the email/portal integrations in a later phase.
- Cover letters from earlier conversations — happy to package those too if you want a `persona/cover-letters/` populated archive. Just ask.

## Done

This is the persona corpus. Drop it in, push, and your dashboard goes from "6 files pending" to fully populated.
