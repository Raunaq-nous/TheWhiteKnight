---
name: tailor-resume
description: Generate a tailored one-page resume for a specific job description. Use when the user asks to tailor a resume for a job, generate a CV for an application, or when called from the auto-pipeline in the career-os router. Reads from persona/master-cv.md, applies hard rules (no em dashes, one page, first principles), and writes to applications/<slug>/resume.md plus resume.pdf.
---

# Tailor Resume

You are generating a one-page tailored resume that will be exported to PDF and sent to a real employer. The output goes through zero further review by Claude — only the user reviews. Get it right the first time.

## Inputs

1. The JD at `applications/<slug>/jd.md` (current application, slug from context)
2. The score at `applications/<slug>/score.md` (which bucket this is, what's emphasized)
3. The persona at `persona/master-cv.md` (canonical career data — Bain, Aranca, Evalueserve, Tecnova, Madcue)
4. Voice samples at `persona/voice-samples.md` (real examples of the user's writing tone)
5. The user profile at `config/profile.yml` (contact info, location, links)

## Hard rules (NON-NEGOTIABLE — validate before writing)

1. **Single page maximum.** Target ~30 paragraphs total including header, sections, bullets, education, skills. If over, trim. Never let it spill to a second page.
2. **Zero em dashes.** None in the markdown, none in the PDF. Use commas, semicolons, "is," "and," or restructure. Validate with `grep -c '\u2014' resume.md` — must return 0.
3. **No double-spaced hyphens** like `  -  `.
4. **First principles thinking** in the profile summary, woven naturally — never as a buzzword phrase.
5. **Aranca = Mumbai. Bain = Gurgaon. Evalueserve, Tecnova = Gurgaon. Madcue = Bangalore. Delbomblr = Delhi (details unknown — never fabricate).**
6. **AI tools described by capability, never by product name.** Especially Haus-Nous — describe by what it does, not what it's called.
7. **GitHub repos by function**, not parenthetical. Don't write "(Schedule_Optimization_Version_1)" — say what the tool does.
8. **No team size numbers.** Use "lead cross-functional teams" only.
9. **No "consumer-facing"** ever.
10. **No two projects combined in a single bullet.**
11. **Skills sections lean** — 2-3 rows max, no "Leadership" row.
12. **Years of experience accurate**: 7+ default, 9+ broader arc, 10+ from Madcue 2015.
13. **Pipe separators (`|`) for certifications, dates, education.**
14. **Verb-first bullets, selective bold inside** (not bold label prefixes).

## Process

### Step 1 — Read and analyze

Read all four input files. Build a mental model of:
- What the JD prioritizes (top 3 priorities)
- Which Raunaq experiences map most directly to those priorities
- Which bucket this is (target-roles.yml) and what that bucket emphasizes
- Whether this is a strategy role, AI/product role, chief-of-staff role, or hybrid (this changes which experiences lead)

### Step 2 — Pick the lead angle

Strategy roles → Bain leads, AI toolkit as differentiator
AI/Product roles → AI Builds section first (before Experience), Bain second
Chief-of-staff roles → Bain leads with founder-partnering framing
Commercial/sales roles → Aranca leads with deal/pricing/contract framing
Engineering-adjacent → Education section gets IEEE publications

### Step 3 — Write the markdown

Use this exact structure:

```markdown
# RAUNAQ RAKESH
Gurgaon | +91-7982271861 | raunaq1509@gmail.com | [LinkedIn](url) | [Portfolio](url)

## PROFILE
[80-100 word paragraph. First principles thinking woven in. Years of experience, sectors, what's distinctive about this user vs other consultants — usually the AI builder + strategy combination.]

## EXPERIENCE
**Bain & Company** | Project Leader | Jun 2025 – Present | Gurgaon
- [Bullet — verb first, selective bold inside, ends with the impact or scope]
- [Bullet]
- [Bullet]

**Aranca** | Engagement Lead, Growth Advisory | Mar 2022 – Jun 2025 | Mumbai
- [Bullet]
- [Bullet]

[... and so on through Evalueserve, Tecnova, Madcue ...]

## EDUCATION
B.Tech, Mechanical Engineering | Manipal Institute of Technology | 2016 | CGPA 8.0/10.0
[Optional Parikshit line for engineering/aerospace roles]
**Certifications:** [pipe-separated list, role-relevant ones first]

## SKILLS
**[Category 1]:** [comma-separated]
**[Category 2]:** [comma-separated]
```

### Step 4 — Validate before exporting

Run these checks. If any fail, fix and re-validate:

- [ ] `grep -c '\u2014' applications/<slug>/resume.md` returns 0
- [ ] Paragraph count ≤ 30 (count lines starting with `-`, headers, paragraphs)
- [ ] Profile summary contains "first principles" naturally
- [ ] Aranca location is "Mumbai" not "Gurgaon"
- [ ] No bullet contains the phrase "consumer-facing"
- [ ] No bullet combines two distinct projects
- [ ] No raw GitHub repo names in parentheses
- [ ] Verb-first on every bullet
- [ ] Pipe separators in certs and education

### Step 5 — Export to PDF

Use the script at `scripts/markdown-to-pdf.sh` (created in Phase 4 implementation). Calls Pandoc or wkhtmltopdf with the template at `templates/resume.html`. Outputs to `applications/<slug>/resume.pdf`.

If the PDF spills to page 2: do NOT shrink the font. Trim content. Always.

### Step 6 — Report

Tell the user:
1. The lead angle you picked and why
2. The location of resume.md and resume.pdf
3. Whether all 14 hard rules passed validation
4. One specific thing the user should review before sending

## Reference: existing resumes that worked

The user has 25+ tailored resumes in `persona/resumes/` from prior conversations. Skim 2-3 that match the current role's archetype before drafting. Don't copy bullets verbatim — but match the rhythm, the bolding pattern, and the section weighting.

Examples:
- Strategy/MBB → see `persona/resumes/Resume_OliverWyman_EngagementManager.docx`
- AI Product → see `persona/resumes/Resume_talabat_SeniorPM_AI.docx`
- Chief of Staff → see `persona/resumes/Resume_KernelDAO_ChiefOfStaff.docx`
- Commercial/Sales → see `persona/resumes/Resume_GE_Aerospace.docx`

## Failure modes I've seen and how to avoid them

- **Spilling to two pages.** Cause: copying too many bullets from master-cv. Fix: pick 2-3 bullets per role, not all of them.
- **Generic profile summary.** Cause: didn't pick a lead angle. Fix: Step 2 is required, not optional.
- **Em dashes sneaking in.** Cause: Claude defaults to em dashes in fluent prose. Fix: validate with grep, don't trust the eye.
- **Aranca becomes Gurgaon.** Cause: Claude pattern-matches "Indian consulting firm = Gurgaon." Fix: hardcoded in the rules above.
- **Profile mentions "first principles" as a buzzword.** Wrong: *"Applies first principles thinking to..."* Right: *"Approaches every engagement from first principles, breaking each problem back to its economic fundamentals before reaching for frameworks."*
