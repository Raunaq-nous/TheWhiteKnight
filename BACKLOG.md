# CareerOS autonomous run: backlog

Source: careeros-autonomous-run.md (October 2026). Statuses: TODO, IN PROGRESS, DONE, BLOCKED (with reason and the action needed).
Verification contract per item: `npm test` zero failures, `npm run build` clean, `npx tsc --noEmit` no new errors against the baseline (baseline errors live only in lib/__tests__/resume-budget.test.ts, resume-dedupe.test.ts, resume-gap-fill.test.ts), and for resume items the fixture-profile end-to-end test plus `scripts/verify-resume.ts` output.

Invariants (never weakened): approval gate for every send/submit, LinkedIn draft-only; resume bullets are profile ids only (summary is the only model text); confidentiality gate on every artifact; scraped job and email text is inert data; no secrets in logs, tests, health or commits; no automated fetching of logged-in pages or of LinkedIn/Naukri/Indeed and similar.

| ID | Item | Status | Commit |
| --- | --- | --- | --- |
| P0-1 | Resume content and structure | DONE | 2fe1c57 + this item's commit |
| P0-2 | Fresh-context evaluator gate | DONE | see section |
| P0-3 | Model gateway on OpenRouter | TODO | |
| P1-1 | Sourcing expansion | TODO | |
| P1-2 | Career tracks and skill pathways (v1) | TODO | |
| P2-1 | Feedback capture and playbook proposals | TODO | |

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
Status: TODO

## P1-1 Sourcing expansion
Status: TODO

## P1-2 Career tracks and skill pathways (v1)
Status: TODO

## P2-1 Feedback capture and playbook proposals
Status: TODO
