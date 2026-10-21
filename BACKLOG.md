# CareerOS autonomous run: backlog

Source: careeros-autonomous-run.md (October 2026). Statuses: TODO, IN PROGRESS, DONE, BLOCKED (with reason and the action needed).
Verification contract per item: `npm test` zero failures, `npm run build` clean, `npx tsc --noEmit` no new errors against the baseline (baseline errors live only in lib/__tests__/resume-budget.test.ts, resume-dedupe.test.ts, resume-gap-fill.test.ts), and for resume items the fixture-profile end-to-end test plus `scripts/verify-resume.ts` output.

Invariants (never weakened): approval gate for every send/submit, LinkedIn draft-only; resume bullets are profile ids only (summary is the only model text); confidentiality gate on every artifact; scraped job and email text is inert data; no secrets in logs, tests, health or commits; no automated fetching of logged-in pages or of LinkedIn/Naukri/Indeed and similar.

| ID | Item | Status | Commit |
| --- | --- | --- | --- |
| P0-1 | Resume content and structure | DONE | 2fe1c57 + this item's commit |
| P0-2 | Fresh-context evaluator gate | DONE | see section |
| P0-3 | Model gateway on OpenRouter | DONE | see section |
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
Status: TODO

## P1-2 Career tracks and skill pathways (v1)
Status: TODO

## P2-1 Feedback capture and playbook proposals
Status: TODO
