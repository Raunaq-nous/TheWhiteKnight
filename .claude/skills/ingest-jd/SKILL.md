---
name: ingest-jd
description: Take a raw job description (URL or pasted text) and produce a clean canonical jd.md file in the application folder. Use when the user pastes a JD, gives a job URL, or when called from the auto-pipeline. Creates the application folder, fetches/parses the JD, normalizes it, and extracts structured metadata.
---

# Ingest JD

## Inputs

One of:
1. A URL — fetch with WebFetch tool, extract the JD content
2. Pasted text — use as-is, but clean it up
3. A screenshot path — OCR the image (delegate to subagent), extract text

## Output

A folder at `applications/<company-slug>-<role-slug>/` containing:

- `jd.md` — the clean, canonical JD in markdown
- `metadata.yml` — structured fields extracted from the JD

## Slug rules

`<company-slug>` = lowercase, hyphenated, no special chars. Examples: `bain-and-company` → `bain-and-co`, `J.P. Morgan` → `jpmorgan`.

`<role-slug>` = role title, abbreviated. Examples: "Senior Product Manager, AI" → `senior-pm-ai`. "Strategy & Operations Manager" → `strategy-ops-manager`.

If the folder already exists, append a numeric suffix: `-2`, `-3`, etc. Do not overwrite.

## jd.md format

```markdown
# <Role Title> — <Company>

**Source:** <URL or "manual entry">
**Captured:** <ISO date>
**Location:** <city, country, or "remote">

## Overview
<the company's pitch, 2-4 sentences>

## Responsibilities
<bullet list, exactly as the JD has them>

## Requirements
<bullet list>

## Nice to have
<bullet list, if present>

## Compensation & benefits
<if mentioned>

## Application process
<if mentioned>

---

## Extracted signals

- **Seniority:** <junior / mid / senior / staff / director>
- **Function:** <strategy / product / engineering / ops / commercial / data>
- **Sector:** <fintech / energy / consumer / saas / etc>
- **Tech keywords:** <comma-separated>
- **Soft signals:** <e.g., "values entrepreneurship", "fast-paced", "remote-first">
```

## metadata.yml format

```yaml
company: <name>
role: <title>
seniority: <enum>
function: <enum>
sector: <enum>
location: <city>
remote: <true|false|hybrid>
source_url: <url or null>
captured_at: <ISO timestamp>
status: sourced
killed: false
created_by: ingest-jd
```

## Process

1. Determine input type (URL, text, screenshot)
2. Fetch or read the content
3. Strip ads, related jobs, footer junk
4. Normalize bullet points and headings
5. Identify company and role title
6. Generate slug, check for collisions
7. Create the folder
8. Write jd.md and metadata.yml
9. Append a row to `data/applications-index.tsv` with: slug, company, role, seniority, captured_at, status

## Hard rules

- **Never modify a JD's content.** We capture it verbatim. The cleanup is whitespace, encoding, and section organization, not editing.
- **Never overwrite an existing application folder.** Use suffixes.
- **If the URL is paywalled, behind login, or the page is JS-only and WebFetch returns garbage, ask the user to paste the JD text manually instead.** Don't try harder — the cost of a bad ingest is a wasted tailoring cycle later.

## Edge cases

- **JD has no clear "responsibilities" / "requirements" sections.** Use your judgment to split. Mark sections as `## Inferred from JD body` with a note.
- **Company is a recruiter, actual employer is hidden.** Capture both. metadata.yml gets `company: <recruiter>` and a `client: <employer-if-known>` field.
- **Multiple roles in one posting.** Ingest as one application; note the variants in jd.md. User decides which to tailor for.
- **JD is in a non-English language.** Capture as-is, add `## English summary` section below with a translation. Don't auto-translate the whole JD — context can shift.

## Output to user

After ingest, return exactly this format:

```
Ingested: <Company> — <Role>
Folder: applications/<slug>/
Seniority: <X> | Function: <Y> | Sector: <Z>
Score against active buckets: not yet run
Next: /career-os score
```
