# CareerOS (TheWhiteKnight): Project Guide

## 1. What this is and who it is for

CareerOS is a personal job application command center. It helps one job seeker find roles, judge how well each role fits, and prepare the materials needed to apply: a tailored resume, a cover letter, and outreach messages to people at the company. It also tracks every application from "sourced" through to later stages.

The material shows it was built mainly for its owner, a strategy consultant moving toward AI product and strategy roles (the persona files are written about someone named Raunaq). It also includes sign-up with invite codes, a setup wizard, and a settings page, which suggests the owner intends other people to use it too. The material does not say who those people are or how many.

The project goes by two names. The repository and README use "TheWhiteKnight" (the README holds only that name). The owner's instruction file and the app itself use "CareerOS". This guide uses CareerOS for the product.

There are really two things in one project:

- **A web app** that a person opens in a browser.
- **A set of AI work instructions** that let Claude Code (an AI coding assistant that runs in a terminal) do the same job-search tasks from files on disk.

## 2. The big picture: the main parts

Here are nine main parts, each with what it does and where it lives.

**1. The dashboard and application tracker**
The home screen shows job applications as a pipeline by status, with summary numbers and buttons to add a job or scan for roles. A separate list page shows all applications with company, role, score and status. A detail page for each application holds status, notes, AI-written materials and contacts.
*Folders and files:* `app/` (`page.tsx`, `applications/`, `application/`), `lib/store.ts`, `app/data.ts` (sample records).

**2. Job intake (ingest and batch)**
You add a job by pasting or uploading its description. The app fills in company, role, location and seniority, then scores the job against your profile. The batch page does the same for many jobs at once, either by scanning job portals or by pasting several descriptions.
*Folders:* `app/ingest/`, `app/batch/`, `app/api/parse-jd/`, `app/api/fetch-url/`, `app/api/extract-pdf/`, `app/api/extract-jd/`, `app/api/scan/`, `lib/batch-runner.ts`.

**3. Scoring**
Each job gets a fit score and a recommendation, based on your profile and your "target buckets" (the categories of role you want, each with its own matching rules and weights).
*Folders:* `app/api/score/`, `lib/scoring.ts`, `lib/buckets.ts`, `config/target-roles.yml`.

**4. Document generation**
Creates tailored resumes, cover letters, outreach messages and refinements of those. It also drafts answers to application form questions, from a pasted link or screenshots, and can edit those answers on request. The resume has strict rules (see section 7).
*Folders:* `app/api/generate/`, `app/api/generate-form-answers/`, `app/api/refine-form-answers/`, `app/form-qa-section.tsx`, `lib/prompts.ts`, `lib/generate.ts`, `lib/ats.ts`.

**5. Contacts and outreach**
Finds people at a target company, such as hiring managers or possible referrers, stores them, and drafts messages. Drafts wait in an inbox (the bell icon) where you can edit, copy, send or dismiss them. Emails go out through an email service called Resend.
*Folders:* `app/contacts/`, `app/contacts-panel.tsx`, `app/notifications.tsx`, `app/api/contacts/`, `app/api/send/`, `lib/contacts-store.ts`, `lib/notifications.ts`, `lib/apollo-client.ts`, `lib/exa-client.ts`, `lib/resend-client.ts`.

**6. Company targeting and research**
Keeps a editable list of companies to watch, grouped by region and sector, with career page links. AI can suggest more. A research feature gathers recent business news about a company.
*Folders:* `app/companies/`, `app/api/companies/`, `app/api/research-company/`, `lib/company-targets.ts`.

**7. Profile and onboarding**
A multi-step wizard collects role, identity, targets, narrative and CV to build a profile. The profile has a read-only view and an edit page. A banner suggests new skills or achievements found in your text. A skills page builds a learning plan from your profile and your pipeline of jobs.
*Folders:* `app/onboard/`, `app/profile/`, `app/profile/edit/`, `app/skills/`, `app/profile-enrichment-banner.tsx`, `app/api/enrich-profile/`, `app/api/skill-builder/`, `lib/profile.ts`, `lib/skills-store.ts`.

**8. Accounts, settings and sign-in**
Sign-up needs an invite code. One admin account is created through a one-time setup page, and the admin can create invite codes. A middleware (a gatekeeper that checks every request) sends anyone not signed in to the login page. Settings let users pick the AI model and enter keys for optional services.
*Folders:* `app/login/`, `app/register/`, `app/admin/setup/`, `app/settings/`, `app/api/auth/`, `app/api/admin/`, `middleware.ts`, `lib/session.ts`, `lib/kv.ts`, `lib/model-settings.ts`, `lib/integration-settings.ts`.

**9. The Claude Code "skills" layer and persona library**
Plain-text instruction files that tell Claude Code how to do recurring tasks: a router skill, a job description capture skill, a resume tailoring skill, and a research helper agent. The "persona" files hold the owner's career record and writing style.
*Folders:* `.claude/` and `.agent/` (identical copies), `persona/`, `config/`, `docs/`, `templates/` and `scripts/` (planned in the layout; not listed in the file notes).

Supporting pieces: `app/api/health/` checks the AI connection, `.github/workflows/` and `vercel.json` handle publishing, and `public/manifest.json` lets the app be installed like a phone app.

## 3. How the pieces work together: one typical journey

Imagine the owner has spotted an interesting role.

1. **Sign in.** They open the site. The gatekeeper sees no valid login and sends them to the login page. After signing in, a signed cookie (a small tamper-proof note kept in the browser) keeps them recognized.
2. **Add the job.** On the ingest page they paste a link or the description text. If it is a link, the app downloads the page and turns it into plain text. If it is a PDF or an image, it reads the text out of the file.
3. **Auto-fill and score.** An AI reads the description and fills in company, role, location and seniority. A second AI call scores the job against the profile and target buckets and gives a recommendation.
4. **Save.** The job becomes an application record with a status such as sourced or applied.
5. **Prepare materials.** On the application page they ask for a tailored resume and cover letter. The app builds instructions from the profile and the job, sends them to an AI model, and shows the result. The user can ask for changes.
6. **Find people.** The contacts panel searches for hiring managers or referrers at the company and drafts a message.
7. **Approve and send.** The draft goes to the inbox bell. Nothing is sent until the user confirms. This matches the owner's rule that external sends need explicit approval.
8. **Track.** The user updates status and notes, including by typing a plain-English update that the app turns into structured changes.

The same journey can run through Claude Code instead: the router skill reads the request and hands it to the right specialist skill, which writes files into an application folder.

## 4. Where the data lives and how it gets in

There are two storage approaches, and the material does not fully explain how they relate.

**In the web app**
- **The browser's own storage** holds most of the working data: application records, the profile (with a sample profile preloaded), contacts, the notification queue, skills plan and progress, AI model choice, and optional service keys. This means data stays on one device and browser unless something else syncs it. The material does not describe any such sync.
- **A Redis database** (a fast online store of simple records) holds only user accounts and invite codes. It is accessed by `lib/kv.ts`.
- **Passwords** are stored only as hashes (scrambled so the original cannot be read back).

**On disk, for Claude Code**
- Plain Markdown and YAML files. Markdown is simple formatted text; YAML is a plain list-style settings format.
- `persona/` holds the master CV, certifications, GitHub projects, publications, voice samples and website content.
- `config/profile.yml` holds identity, location, work authorization, salary and outreach preferences. `config/target-roles.yml` holds the target role buckets and scoring weights.
- `applications/` holds one folder per job, each with `jd.md` (the saved job description) and `metadata.yml` (status, score, contacts, next step). Examples in the folder include Anthropic, Bain, BCG, McKinsey, Noon, OYO, Stripe, Careem, Swiggy and Talabat.
- `data/` is meant for generated state and is excluded from version control.

**How data gets in**
- The user types or pastes it, or uploads PDFs and images.
- The app fetches job pages from links, and scans company job boards and the Adzuna job search service.
- Exa (a search service) finds job postings and LinkedIn profiles; Apollo finds and enriches people at companies.
- A GitHub workflow can unzip a "persona pack" into the right folders.

The `app/persona` page reads approved persona files from the server so they can be shown in the app.

## 5. The AI parts

The AI does most of the thinking. A single server-side client (`lib/ai-client.ts`) talks to several AI providers, retries failed calls, cleans up reasoning text from the output, and can read text from images. Users can pick the provider and model in settings. The material mentions a deployment guide for DeepSeek, but does not list every provider supported.

What the AI does:

- **Reads job descriptions** and pulls out structured fields (`parse-jd`), including from images (`extract-jd`).
- **Reads resumes or portfolio images** (`extract-resume`).
- **Scores fit** between a job and the profile (`score`, `scan`).
- **Writes** resumes, cover letters, outreach emails, LinkedIn-style messages and CEO cold emails (`generate`, `prompts.ts`).
- **Answers application form questions** and revises them (`generate-form-answers`, `refine-form-answers`).
- **Suggests target companies** (`companies`) and **profile additions** (`enrich-profile`).
- **Plans skills to build** (`skill-builder`).
- **Turns plain-English updates into status changes** (`nl-update`).
- **Checks its own connection** (`health`).

Non-AI search tools (Exa, Apollo, Adzuna) fetch facts that the AI then uses.

In Claude Code, a **research-investigator agent** (a helper that works on one question and returns a short report) has read-only tools. The owner's rule is that all research goes through such helpers, so the main conversation stays uncluttered.

## 6. Glossary

- **Agent / subagent:** an AI helper given one narrow task, whose result is reported back to the main AI.
- **Apollo:** a service for finding professional contacts at companies.
- **Application:** one job you are pursuing, with its description, score, status and contacts.
- **ATS (applicant tracking system):** software employers use to read resumes. The project cleans resume text so these systems do not choke on it.
- **Bucket:** a category of target role with its own matching titles, sectors, locations, keywords and weight.
- **CLAUDE.md:** the owner's instruction file that Claude Code reads at the start of each session.
- **Claude Code:** an AI assistant that works in a terminal and can read and write project files.
- **Context window:** the working memory of an AI session. The owner says to restart at 70% full.
- **Data contract:** the rulebook (`DATA_CONTRACT.md`) saying which files are the user's and must never be overwritten.
- **Exa:** a search service used to find job postings and LinkedIn profiles.
- **Gate (phase gate):** a stop point where work pauses until the owner approves.
- **Hook:** an automatic action triggered by an event. Here, a script copies skills when a session starts.
- **Invite code:** a code required to create an account.
- **JD (job description):** the text of a job posting.
- **Markdown:** plain text with light formatting marks.
- **Middleware:** code that checks every request before the page loads.
- **Next.js:** the framework the web app is built with.
- **Persona:** the owner's career record and writing style, kept as files.
- **Redis:** the online database holding accounts and invite codes.
- **Resend:** the service that sends emails.
- **Skill (skill mode):** a saved instruction file for a recurring task.
- **Spec-Driven Development:** the build method with four phases: Research, Specification, Refinement, Implementation.
- **System Layer / User Layer:** System Layer is the tool's own files (skills, templates, scripts). User Layer is the owner's personal files (CV, persona, config, applications).
- **Vercel:** the hosting service the app is deployed to. GitHub Pages is also set up as a deployment path.
- **YAML:** a plain settings-file format.

## 7. Where to start reading, and what to be careful with

**Start here, in this order**
1. `CLAUDE.md` for the rules and goals.
2. `docs/build-kit/01-product-brief.md` for the problem and scope.
3. `docs/build-kit/02-sdd-workflow.md` to understand the build method.
4. `docs/research/synthesis.md` for the architecture decisions and the open decisions still awaiting approval.
5. `DATA_CONTRACT.md` for what must not be overwritten.
6. `app/page.tsx`, then `app/application/page.tsx`, the busiest screen in the app.
7. `docs/build-kit/05-design-tokens.md` if your work touches visuals.

**Be careful with**
- **Personal files.** Never overwrite the CV, `persona/`, the two config files, or anything in `applications/`.
- **External sends.** Resume export, cover letter export, LinkedIn messages, application submissions and outreach emails all need the owner's explicit approval. Two exceptions are named (a trusted-portal whitelist and email-to-status sync), but the material does not define them.
- **Writing rules.** No em dashes in any output. Resumes must be one page, about 30 paragraphs at most. Profile summaries should show first-principles thinking naturally. Aranca is in Mumbai and Bain is in Gurgaon; do not mix them up.
- **Duplicate files.** `.claude/` and `.agent/` are copies, and `AGENTS.md` copies `CLAUDE.md`. A script (`sync-skills.sh`) keeps them aligned at session start, so edit `.claude/` and `CLAUDE.md`, not the copies.
- **Duplicated persona material.** The `persona/` folder and `persona-unzipped/persona-pack/` hold overlapping files.
- **Keys and secrets.** AI and service keys, the admin setup secret and the session secret must stay on the server. `DEPLOYMENT.md` lists the settings. Optional service keys are also stored in the browser, which is worth a security review.
- **Personal data.** The persona and application files contain real career, salary and contact details.

## 8. Open questions

- **Name:** is the product "TheWhiteKnight" or "CareerOS"? The README holds only the first.
- **Audience:** is this for one person or for many? Invite codes suggest many, but the persona files are about one individual.
- **Two data layers:** the web app keeps data in the browser, while Claude Code uses files on disk. How do they stay in sync, if at all?
- **Missing files:** `DATA_CONTRACT.md` is described as existing "once it exists" in `CLAUDE.md`, yet it is listed in the files. Its full contents were not provided. `templates/`, `scripts/` and `data/` are in the planned layout but not described.
- **Project phase:** which Spec-Driven phase is the project in? The research summary says decisions await approval, but a working app already exists.
- **Unlisted skills:** CLAUDE.md names a `tailor-resume` check. Other skills for outreach, scoring or status tracking are not in the material.
- **Exceptions to approval:** what exactly is the "trusted-portal whitelist" and the "email-to-status sync"?
- **AI providers:** which providers and models are supported is not fully stated.
- **Deployment target:** both Vercel and GitHub Pages are configured. A static host like Pages cannot run the server-side parts, so which one is the real home is unclear.
- **Sample vs real data:** the sample applications and sample profile may be demo data or the owner's real pipeline.
- **Usage and results:** no numbers on usage, success or outcomes are given.