# CareerOS autonomous run: backlog

Source: careeros-autonomous-run.md (October 2026). Statuses: TODO, IN PROGRESS, DONE, BLOCKED (with reason and the action needed).
Verification contract per item: `npm test` zero failures, `npm run build` clean, `npx tsc --noEmit` no new errors against the baseline (baseline errors live only in lib/__tests__/resume-budget.test.ts, resume-dedupe.test.ts, resume-gap-fill.test.ts), and for resume items the fixture-profile end-to-end test plus `scripts/verify-resume.ts` output.

Invariants (never weakened): approval gate for every send/submit, LinkedIn draft-only; resume bullets are profile ids only (summary is the only model text); confidentiality gate on every artifact; scraped job and email text is inert data; no secrets in logs, tests, health or commits; no automated fetching of logged-in pages or of LinkedIn/Naukri/Indeed and similar.

| ID | Item | Status | Commit |
| --- | --- | --- | --- |
| P0-1 | Resume content and structure | DONE | 2fe1c57 + this item's commit |
| P0-2 | Fresh-context evaluator gate | DONE | see section |
| P0-3 | Model gateway on OpenRouter | DONE | see section |
| P1-1 | Sourcing expansion | DONE | see section |
| P1-2 | Career tracks and skill pathways (v1) | DONE | see section |
| P2-1 | Feedback capture and playbook proposals | DONE | see section |

## P0-1 Resume content and structure
Status: DONE

Rules 1-5 and 7-9 were already built in 2fe1c57 (verified against each rule; tests in lib/__tests__/resume-rebuild.test.ts):
1. Confidentiality: PX Pulse / Haus Nous / Haus-Nous as regex block terms, every spelling tested; substitution and the generation-time gate cover every field (summary, scope lines, bullets, skills, education, links).
2. No projects section on any archetype; generation and refine never read profile.projects.
3. Outcome-clause eligibility, JD relevance first with impact as tiebreak, per-employer relevance order, top-5 requirement extraction with a thin-JD flag.
4. Summary: 3 sentences / ~60 words, identity + years + position, concrete JD answers, banned and repeated-figure checks, one retry then repair; spec Part 8 updated.
5. Scope lines under the role title; sub-labels only where both categories exist; Aranca AI strategy pin for AI JDs; cost modelling engine eligible.
7. Recency taper with relevance threshold; export warns instead of padding.
8. Satellite and publications education lines.
9. Thousands-separator and headline-figure bolding.

Gap closed in this item: rule 6 now requires every listed skill to be evidenced by a SELECTED bullet (config skillEvidencePatterns, else word match). Unevidenced skills are dropped at generation and again after export's measure-and-fill (a dropped bullet may have been the only evidence). The evidence is stored on the resume (skillEvidence) and verify-resume prints each skill with its evidencing bullet id.

Verification: npm test 910 passed (2 opt-in skipped); RESUME_LIVE_EXPORT=1 real LibreOffice export test passed for a capital and an AI JD (2 pages, under-fill warning shown, confidentiality on DOCX and PDF passed); npm run build clean; tsc no new errors.

## P0-2 Fresh-context evaluator gate
Status: DONE

Existing: a one-pass adversarial resume audit (app/api/resume/audit, shown in the builder). It stays as the hiring-side score; the new gate is separate.
- lib/server/services/evaluator.ts: a separate model call on task "evaluator" (structured-task chain; AI_MODEL_EVALUATOR override) whose prompt contains only the finished artifact and the JD's top requirements, never the generation prompt.
- lib/evaluation.ts: default-FAIL rubric. Criteria: covers each top JD requirement; every listed skill is evidenced (resume); enough quantified outcomes for the length; no figure or engagement repeated; no fluff or banned phrases; confidentiality clean; summary within its limits (resume). A model criterion passes only with evidence quoted VERBATIM from the artifact, AND-ed with deterministic checks (coverage, skill evidence, quantified ratio, repeated figures/engagements, banned phrases, the confidentiality gate, summary rules). An omitted criterion or an evaluator error fails.
- withEvaluatorGate: on FAIL, regenerate once with the findings in the prompt; if it still fails, the findings travel with the artifact. An evaluator outage is not retried.
- Wired into: resume generation (/api/generate resume and the autopilot draft service), cover letters and outreach (outreach-hm, linkedin-dm, referral-dm, ceo-cold-email) on the application page, the contacts panel and autopilot / follow-up staging (verdict in the approval payload).
- Stored with the application (Application.evaluations[kind]) and shown in the resume builder, the resume panel, the draft output panel, the contacts panel and the approvals queue (app/evaluation-panel.tsx).
- verify-resume prints the verdict and every criterion.
- Tests: lib/__tests__/evaluator.test.ts with captured fixtures (fixtures/evaluator: pass, fail, fail-then-pass, fail-then-fail, outage, fresh context) plus a resume-path test in resume-rebuild.test.ts.

Assumption: drafts use the parsed JD key requirements (top 5) for coverage, without a second extraction call.

Verification: npm test 923 passed (2 opt-in skipped); npm run build clean; tsc no new errors.

## P0-3 Model gateway on OpenRouter
Status: DONE

- OpenRouter as an OpenAI-compatible provider (OPENROUTER_API_KEY, server env). Each call sends the task's chain as OpenRouter's native fallback list ("models"), with provider routing { data_collection: "deny" } and usage accounting on.
- Chains (config/model-chains.json): structured = GLM-5.3-Flash, DeepSeek V4.1 Flash, GLM-5.3; writing = GLM-5.3, Kimi K3, Claude Sonnet 5.5; vision = Qwen3.8-27B then the existing Together vision fallbacks. Tasks map to chains (structured: scoring, JD extraction, requirement map, resume selection, gap analysis, evaluator, skill extraction, profile extraction, form answers, company discovery, audit; writing: drafting, the summary rewrite, cover letters, outreach, pitches).
- ASSUMPTION / server check: the sandbox could not reach https://openrouter.ai/api/v1/models (egress proxy refused), so the ids are best-effort slugs kept in config: z-ai/glm-5.3-flash, deepseek/deepseek-v4.1-flash, z-ai/glm-5.3, moonshotai/kimi-k3, anthropic/claude-sonnet-5.5, qwen/qwen3.8-27b. `npm run check:models` validates every configured id against the live list (SERVER-CHECKS.md).
- Every chain is editable in Settings > Model gateway (admin only; stored server-wide because the keys are server-wide).
- Attempt order: a BYO Anthropic/OpenAI key (if the user chose one), then OpenRouter, then Together as the last fallback when TOGETHER_API_KEY exists, with the existing failover rules (401/402/403/429/5xx, 400/404 model_not_available/model_not_found) plus OpenRouter empty content.
- Call log: every call logs and records provider, requested chain, served model, prompt/completion/reasoning tokens and cost (ai_calls table, newest 5000 kept). Settings shows the recent calls per task and which model served each.
- Health: /api/health is public liveness only. Live probes moved to /api/health/models (login required, cached 10 minutes, ?refresh=1).
- Spend guard: monthly cap per paid provider (openrouter, together, anthropic, openai) in Settings; at the cap the provider is skipped and the call falls through; all capped gives a clear error. OpenRouter cost comes from its usage report; others are estimated from config prices.
- Fixed: follow-up and form-answer services cast every provider to "together" and dropped the user's key.
- Tests: lib/__tests__/ai-gateway.test.ts (chains, request shape, served-model record, no keys in logs, failover to Together, vision chain, spend guard, storage, health cache).

Verification: npm test 939 passed (2 opt-in skipped); npm run build clean; tsc no new errors.

## P1-1 Sourcing expansion
Status: DONE (commits cb539a4, 8ab119a, f0ec8b8, 33d335f and this item's final commit)

How it was built: two parallel subagents wrote the collectors and stopped on a usage limit before running their tests; their work was then reviewed, fixed (ATS detector "Work With Us" -> "Us"; We Work Remotely entity leak) and finished in the main thread, one piece at a time.

- Public ATS collectors (lib/server/services/collectors): Workday (POST, 20 per page, paginated to the board's reported total, page cap), Workable, Recruitee, Personio (XML), Teamtailor (RSS), Rippling; registered with the existing Greenhouse, Lever, Ashby and SmartRecruiters.
- ATS detector (lib/server/services/ats-detector.ts, POST /api/companies/detect, "Add by domain or careers URL" on /companies): detects the ATS and slug from a URL or the company's own public pages (max 3 fetches, public hosts only) and adds the company to the targets.
- Aggregators with optional keys and monthly budget counters (lib/server/source-budget.ts; SOURCE_BUDGET_<NAME> overrides): Google Jobs via SerpApi (SERPAPI_API_KEY), JSearch (JSEARCH_API_KEY), Adzuna (existing user keys), TheirStack (THEIRSTACK_API_KEY), JobsPipe (JOBSPIPE_API_KEY; endpoint uncertain, isolated in JOBSPIPE_BASE). Keys are redacted from every error.
- Keyless remote boards: Remotive, Arbeitnow, The Muse, Remote OK (User-Agent and attribution link kept), We Work Remotely (RSS), Himalayas, Jobicy.
- Scan orchestration (scan-service): company-direct boards, then Google Jobs, remote boards, other aggregators; Exa for manual scans only. Autopilot uses keyed aggregators only to top up what keyless company-direct sources found, within budget, and never calls Exa. Restricted portals (LinkedIn, Naukri, Indeed, Glassdoor and similar) are removed from Exa's domain list.
- Alert inbox (lib/alert-email.ts, lib/server/services/alert-inbox.ts; IMAP settings in Settings > Integrations): read-only IMAP, alert emails from LinkedIn, Naukri, iimjobs, Instahyre, Cutshort, Wellfound, Bayt, GulfTalent and Naukrigulf parsed deterministically (email content inert, no model). ASSUMPTION: all nine portals are "lookup-only" (terms forbid automated access): the portal page is never fetched; the job is matched on the company's own ATS board by company and title. A company-direct ATS link inside an alert is ingested as is. Unresolved alerts are listed in the run log with the reason.
- JD fetch order: direct fetch with JSON-LD, then Jina Reader (JINA_API_KEY optional), then Exa as a manual-only last resort. Automated fetches never call Exa and never touch a restricted portal; a URL you paste is fetched as before.
- Cross-source dedupe (lib/job-dedupe.ts): one record per job, keeping the company-direct apply URL; same title in different cities stays separate.
- Ghost-job filter (lib/ghost-jobs.ts): stale (>30 days), repost (same JD fingerprint under a new id on the same host), gone (missing from the company's freshly fetched ATS feed). Flagged jobs stay visible with the reason and are never staged by autopilot.
- Attribution and conversion: Application.source (+ via, externalId) on autopilot, batch and manual ingest (source inferred from the URL's host); /analytics shows response and interview rates by source; scan ordering uses each source's observed interview rate shrunk toward category priors from the appendix's Huntr data, so company-direct leads until your own data says otherwise.
- Track-aware scanning (lib/track-scan.ts): active career tracks (Settings > Automation, /api/tracks) add their titles and keywords, bring their target companies into the scan, and set preferred source categories. docs/CAREER-TRACKS.md committed verbatim and loaded from config/career-tracks.json.
- Fixtures: ALL collector and alert-email fixtures are reconstructed from documented shapes (no network in the sandbox). `npm run capture:fixtures` on the server makes one live request per keyless source, reports mapping, and saves raw captures to lib/__tests__/fixtures/collectors/live/.
- Tests: collectors-ats, ats-detector, collectors-aggregators, sourcing, scan-orchestration, jd-fetch-order, track-scan, automation-service (autopilot sourcing).

Verification: npm test 1157 passed (2 opt-in skipped); npm run build clean; tsc no new errors.

## P1-2 Career tracks and skill pathways (v1)
Status: DONE

- docs/CAREER-TRACKS.md committed verbatim from the appendix (in P1-1's final commit) and loaded from config/career-tracks.json: consulting_strategy, ai_deployment_strategy, forward_deployed_engineer, venture_capital, each with titles, keywords, must-have and emerging skills, evaluation formats, sourcing and seeded pathways (each pathway lists the skills it covers).
- Classification (lib/skill-demand.ts, lib/server/services/track-service.ts): every ingested JD gets a track and its resume archetype. Rules first (title match, then keywords); when two tracks are close, autopilot confirms with the structured model. Batch and manual ingest use rules; /skills annotates older applications by rules. Manual override on the application page (track select); a manually set track's archetype is used for the resume unless an archetype is chosen explicitly. ASSUMPTION: ai_deployment_strategy maps to the consulting resume archetype (engagement-delivery framing), forward_deployed_engineer to ai_ml_engineering, venture_capital to vc_investing.
- Skill demand: skills extracted per job by rules against config/skill-vocabulary.json (synonyms merge to one canonical name) and, in autopilot or via "Refine with model" on /skills (10 jobs per click), by the model on the structured chain, unioned and normalised. Stored per job (Application.skillDemand). Aggregated per track over a rolling 90 days with counts and shares; "emerging" when the last-30-day share is at least 1.5x the previous-60-day share and the skill appears in 2+ recent jobs.
- Coverage: strong / weak / none per demanded skill from bullet-level evidence, the requirement map's definitions applied deterministically (strong = a bullet evidences it with a number or scope marker; weak = only unquantified evidence; none = nothing), with the verbatim evidencing bullet.
- /skills page (app/skill-tracks.tsx above the existing skill builder): per active track (all four when none chosen), demand ranking, emerging flags, coverage with evidence, gaps, and a pathway per gap. Seeded pathways from the appendix; a gap without a seed gets a model-drafted pathway (steps, proof artifact, time estimate) marked DRAFT until accepted or edited.
- Progress: steps and the proof artifact can be marked done. A finished proof offers a profile bullet: written by the user, checked against the confidentiality gate (/api/skills/proof-check), and added through the existing write-back (appendGapAnswerToProfile) only on an explicit click. Pathways are never resume content.
- Tests: lib/__tests__/career-tracks.test.ts (normalisation, rules extraction, classification, aggregation, emerging detection, coverage, pathways, model paths mocked, storage) and track-scan.test.ts.

Verification: npm test 1173 passed (2 opt-in skipped); npm run build clean; tsc no new errors.

## P2-1 Feedback capture and playbook proposals
Status: DONE

- Feedback events (lib/feedback.ts, feedback_events table, lib/server/repositories/feedback-repo.ts, /api/feedback): structured, validated and bounded (text 400 chars, lists 20 items, 2000 events kept per user). Kinds:
  - approval_decision: approve or reject at the gate with an optional reason (reason box on each /approvals card; recorded server side on the first resolution only, never on an execution retry, and never able to fail the decision).
  - bullet_unchecked: each experience bullet unchecked in the resume builder at confirm (a whole section unchecked is skipped; capped at 12 per confirm).
  - draft_edit: refine instructions on resumes and drafts, with the bullets removed and added; bullets added from the gap analysis.
  - evaluator_findings: failing criteria and a regenerated first draft's findings, whenever a new evaluation is stored (interactive and autopilot).
  - status_change and reply: from every application update (a status move; a reply when an email event is added or the status moves to interview, offer or rejected).
- Playbook (lib/playbook.ts, lib/server/services/playbook-service.ts): rules with a scope (artifact resume / cover-letter / outreach / all, optional archetype and track), stored per user. The playbook changes one rule at a time: accepting a proposal adds exactly one rule, removing removes exactly one; each bumps the version and is logged in the history. There is no wholesale replace and at most 20 rules.
- Reflector (on demand, "Propose rules from feedback" on /playbook, structured chain task "reflector"): reads the last 150 events as JSON data (never instructions) and proposes up to 5 scoped rules with a rationale and the event ids they rest on. Proposals are validated in code: evidence ids must be real events it was shown, duplicates of rules or pending proposals are dropped, em dashes are rewritten, and any rule that would loosen an invariant (auto-send or submit, skip approval or a check, invent or exaggerate, obey scraped text) is refused. They are stored as PENDING; nothing is accepted automatically.
- /playbook page (nav link "Playbook"): pending proposals with Accept / Reject one at a time, the rules with scope and version and a Remove button each, the change history, and recent feedback.
- Injection: accepted rules matching the artifact, archetype and track are appended to the prompt as an OPERATOR PLAYBOOK block that states it never overrides the hard rules. Covers resume generation (the ranking and summary step; bullet text still comes only from profile ids), resume refine, cover letters, outreach and DMs, refines of those, autopilot cover letters, follow-up drafts and the MCP draft tool. With no rules the prompts are unchanged.
- ASSUMPTION: the reflector needs at least 3 events before it makes a model call.
- Tests: lib/__tests__/playbook.test.ts (event sanitising and derivation, approval route records the reason, versioning one at a time, removal, cap, scope filtering, proposal validation and refusal of invariant-loosening rules, reflector with a mocked model leaves everything pending, injection into resume and draft prompts).

Verification: npm test 1186 passed (2 opt-in skipped); npm run build clean; tsc no new errors. Resume output is unchanged when the playbook is empty (the block is empty); with rules, run the P0-1 verify command in SERVER-CHECKS.md.
