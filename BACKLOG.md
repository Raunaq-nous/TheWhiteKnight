# BACKLOG

Prioritized, top to bottom. Each item is marked `[ ]` (pending), `[x]` (done), or `[BLOCKED: reason]`.
Work one item at a time; commit once per completed item; never ask permission to commit (see
CLAUDE.md's VERIFICATION CONTRACT).

## [x] 1. Autopilot throughput

Small batches (default 2, hard-clamped low) that finish inside the HTTP timeout. Per-job try/catch
so one failure is logged and skipped rather than killing the run. Keep-but-mark-unscored on
scoring failure. Survivor counts reported at every pipeline stage (fetched → keyword → recency →
location → dedup → scored → staged).

**DONE WHEN:** a manual cron trigger processes its batch, stages into approvals, logs stage-by-stage
counts, and a deliberately failing job is skipped with a reason rather than aborting the run.

## [x] 2. Automated backups

Nightly SQLite `.backup` to `/root/backups` with 7-day retention, wired into `deploy/setup.sh`.
Document the off-box copy step in `RUN.md`.

**DONE WHEN:** the cron line exists in setup.sh, a manual run produces a dated `.db` file, and
RUN.md documents pulling a copy off the server.

## [x] 3. Rules pre-filter before LLM scoring

Deterministic location/seniority/keyword filter running before any model call.

**DONE WHEN:** an obviously off-target job is rejected with zero tokens spent, and the rejection
reason appears in the survivor-count log.

## [x] 4. Response analytics

A stats view over existing data: applications by status, reply rate, correlation between resume
score and response, time-to-response.

**DONE WHEN:** the view renders real numbers from the pipeline and handles the empty-data case.

## [x] 5. Bullet ID drift

Saved resumes referencing edited profile bullets must warn on load, listing the specific
unresolvable bullets, and offer re-resolution or regeneration.

**DONE WHEN:** editing a profile bullet that a saved resume references produces a visible warning
naming it, never a silent drop.

## [ ] 6. Buckets config

One persisted source of truth, editable in the UI, consumed by both ingest and batch scan. Remove
the three hardcoded copies (`app/ingest` MOCK_BUCKETS, `lib/buckets` DEFAULT_BUCKETS, and the
static `app/config` page).

**DONE WHEN:** editing a bucket in the UI changes scoring behaviour in both ingest and batch scan,
and no hardcoded bucket array remains.

## [ ] 7. ATS language alignment

Compare resume vocabulary against the JD's and flag where different words are used for the same
skill (e.g. "forecasting model" vs "predictive analytics"). Surface in the requirement map. This
is terminology mapping, not keyword stuffing.

**DONE WHEN:** a JD term with a profile synonym is flagged with both phrasings shown.

## [x] 8. Adversarial resume evaluation (already implemented — verified, not rebuilt)

Score the generated resume from a screener's perspective: category scores, the evidence found for
each, and explicit deductions (missing quantification, vague bullets, unaddressed JD requirements,
formatting problems). Reference pattern: github.com/interviewstreet/hiring-agent. Use the cheap
model via the scoring task route. Store the score with the application.

**DONE WHEN:** an export shows a score with deductions before I generate the PDF, and the score
persists against the application.

*(Research-heavy — delegated to a subagent per CLAUDE.md's instruction.)*

## [ ] 9. Collector-per-source refactor

Abstract base interface, one module per source, then add Naukri and SmartRecruiters. Reference
pattern: github.com/algsoch/job_agentic collectors/.

**DONE WHEN:** existing ATS/Adzuna/Exa sources work unchanged through the new interface, and
Naukri and SmartRecruiters return results or fail cleanly with a reason.

*(Research-heavy — delegated to a subagent per CLAUDE.md's instruction.)*

---

## Run log

### Item 1 — Autopilot throughput (done)

- `lib/automation-settings.ts` / `lib/server/services/automation-service.ts`: `DEFAULT_MAX_JOBS_PER_RUN`
  8 → 2, `MAX_JOBS_PER_RUN_CEILING` 25 → 5 (both copies, kept in sync). `app/settings/page.tsx`'s
  own hardcoded `25` (a third copy of the ceiling) replaced with the imported constant.
- New `lib/server/services/rules-prefilter.ts`: deterministic, zero-token recency filter (drops
  postings >45 days old with a known date) and location filter (drops postings in a clearly
  different place than the candidate's open-to locations) — both permissive on ambiguity, run
  BEFORE any scoring call.
- `AutomationRunLog` gained `jobsFetched`, `jobsAfterRecencyFilter`, `jobsAfterLocationFilter`,
  `filteredOut` (stage + reason per rejected job) — full stage-by-stage counts now: fetched →
  keyword (`jobsFound`) → recency → location → dedup (`jobsSkippedDuplicate`) → scored → staged.
  Settings page's run-log line now prints the whole chain with a tooltip listing rejection reasons.
- Per-job try/catch and keep-but-mark-unscored on scoring failure were already implemented from
  prior work in this codebase — verified via existing + new tests, not re-built.
- Tests: `lib/__tests__/rules-prefilter.test.ts` (12 new), 3 new tests in
  `automation-service.test.ts` for the stage counts and zero-token rejection. Full suite 678/678,
  build clean, `tsc --noEmit` clean.

### Item 2 — Automated backups (done)

- New `deploy/backup.sh`: SQLite `.backup` (a consistent online snapshot, not a raw `cp`) to
  `/root/backups/careeros-<UTC timestamp>.db`, with 7-day retention (`find ... -mtime +7 -delete`).
  Manually verified end-to-end in this session (a fake `sqlite3` CLI standing in for the real
  binary, which isn't installable in this sandbox — no network access to the Ubuntu mirror): a
  dated `.db` file was produced, and a synthetic 10-day-old backup was deleted on the next run
  while a 2-day-old one survived.
- `deploy/setup.sh`: added `sqlite3` to the Step 1 apt install list; new "Step 7c: Automated
  nightly backups" installs a root crontab line running `backup.sh` at 03:00 UTC; the final
  summary block now lists the manual-backup and `/root/backups` commands.
- `RUN.md`'s backup section rewritten: documents the automated nightly backup, an `scp` example
  and an `rsync`/`rclone` suggestion for the OFF-box copy step (on-box backups alone don't survive
  losing the server), and a restore procedure.
- No TypeScript/JS touched — full suite 678/678 (unchanged), build clean, `tsc --noEmit` clean.

### Item 3 — Rules pre-filter before LLM scoring (done)

Location and recency were already fully handled by item 1's `rules-prefilter.ts`. The remaining
gap: `scan-service.ts`'s existing keyword/seniority relevance filter (already zero-token, already
ran before scoring) silently dropped jobs with no visibility into why.

- `lib/server/services/scan-service.ts`: new `explainLowRelevance()` distinguishes an explicit
  seniority/keyword exclusion match from a plain no-match; `scanJobs()` now returns a `rejected`
  array (optional, backward compatible) alongside `jobs`.
- `lib/automation-settings.ts`: `RulesFilterRejectionLog.stage` widened to include `"keyword"`.
- `automation-service.ts` folds `scanResult.rejected` into `filteredOut` under stage `"keyword"`,
  ahead of the recency/location entries — so the full pipeline (keyword → recency → location) now
  has both counts AND per-job reasons in one place.
- Tests: 3 new in `scan-service.test.ts` (no-match reason, excluded-term reason naming the term,
  never rejects a real match), 1 new integration test in `automation-service.test.ts` confirming
  the fold-in. Full suite 682/682, build clean, `tsc --noEmit` clean.

### Item 8 — Adversarial resume evaluation (already done, discovered during item 4 investigation)

While surveying the data model for item 4's response-analytics view, found this already fully
built from earlier work in this codebase (not part of any session summarized to me — genuinely
pre-existing): `lib/schemas.ts`'s `ResumeAuditResultSchema` (categories with evidence, deductions
typed `missing_quantification | vague_bullet | unaddressed_requirement | formatting_problem` with
severity, bonus points, overall score, verdict — matches the backlog's own wording almost
verbatim), `/api/resume/audit` (routes through the `"audit"` AI task, confirmed wired to
`CHEAP_MODEL` in `lib/ai-client.ts`'s task registry), `app/resume-builder.tsx` (runs the audit
automatically once a draft exists, renders score/verdict/categories/deductions, BEFORE the user
can confirm and move on to export), and `app/application/page.tsx`'s `persistResumeContent`
(saves `resumeAudit` with `scoredAt`/`atsReadable` onto the application). All DONE WHEN criteria
already satisfied. Verified `lib/__tests__/resume-audit.test.ts` (5/5 passing) rather than adding
duplicate coverage. No code changed for this item.

### Item 4 — Response analytics (done)

No dedicated inbound-reply/status-history tracking exists in this codebase
(`send-service.ts` only records outbound sends) — documented as a stated limitation rather than
silently faked: "responded" is inferred from status (interview/offer/rejected all count, a
rejection is still a response), and time-to-response uses `updatedAt - createdAt` as a proxy.

- New `lib/analytics.ts`: `countByStatus`, `computeReplyRate` (rate is `null`, not `0`, when
  nothing has been sent yet), `scoreResponseCorrelation` (Pearson/point-biserial between
  `Application.score` and response, `null` below 3 data points or with no variance),
  `averageTimeToResponseDays`, and `computeResponseAnalytics` combining all four.
- New `/analytics` page (added to nav): reply rate, avg. time to response, score↔response
  correlation as stat cards, a by-status bar breakdown, and an explicit empty-data state (distinct
  from a `0%`/`NaN` reply rate) plus a footnote stating the proxy limitations above.
- Tests: 16 new in `lib/__tests__/analytics.test.ts` covering the empty-data case, the reply-rate
  denominator (only "applied"-or-later), correlation edge cases (too little data, no variance),
  and a full realistic-pipeline scenario. Full suite 698/698, build clean (confirmed `/analytics`
  in the build's route list), `tsc --noEmit` clean.

### Item 5 — Bullet ID drift (done)

- New `lib/resume-bullet-drift.ts`: `findDriftedBullets(content, profile)` — pure detection,
  checks every experience bullet/project/key-win's `sourceBulletId` (a content-hash of the profile
  bullet's TEXT) against the current profile's bullet index; anything that no longer resolves
  (the bullet was edited or removed) is flagged, tagged with its stale text and, for experience
  bullets, the employer it's under. `replacementCandidates(profile, company)` lists current
  bullets from that SAME employer as re-resolve options — never a replacement from an unrelated
  role.
- `app/application/page.tsx`: a saved resume with any drifted bullet now shows a visible warning
  banner naming each one (with its stale text and location), a per-bullet re-resolve dropdown
  (only when the same employer still has current bullets to offer), and a "regenerate entire
  resume" button reusing the existing generate handler. Nothing was ever silently dropped even
  before this — the stale text was already fully rendered — this closes the actual gap: zero
  visibility that it had gone stale.
- Tests: 8 new in `resume-bullet-drift.test.ts` covering all three drift locations, the
  same-employer restriction on replacement candidates, and a no-mutation guarantee. Full suite
  706/706, build clean, `tsc --noEmit` clean.
