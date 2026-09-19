# BACKLOG

Prioritized, top to bottom. Each item is marked `[ ]` (pending), `[x]` (done), or `[BLOCKED: reason]`.
Work one item at a time; commit once per completed item; never ask permission to commit (see
CLAUDE.md's VERIFICATION CONTRACT).

## [ ] 1. Autopilot throughput

Small batches (default 2, hard-clamped low) that finish inside the HTTP timeout. Per-job try/catch
so one failure is logged and skipped rather than killing the run. Keep-but-mark-unscored on
scoring failure. Survivor counts reported at every pipeline stage (fetched → keyword → recency →
location → dedup → scored → staged).

**DONE WHEN:** a manual cron trigger processes its batch, stages into approvals, logs stage-by-stage
counts, and a deliberately failing job is skipped with a reason rather than aborting the run.

## [ ] 2. Automated backups

Nightly SQLite `.backup` to `/root/backups` with 7-day retention, wired into `deploy/setup.sh`.
Document the off-box copy step in `RUN.md`.

**DONE WHEN:** the cron line exists in setup.sh, a manual run produces a dated `.db` file, and
RUN.md documents pulling a copy off the server.

## [ ] 3. Rules pre-filter before LLM scoring

Deterministic location/seniority/keyword filter running before any model call.

**DONE WHEN:** an obviously off-target job is rejected with zero tokens spent, and the rejection
reason appears in the survivor-count log.

## [ ] 4. Response analytics

A stats view over existing data: applications by status, reply rate, correlation between resume
score and response, time-to-response.

**DONE WHEN:** the view renders real numbers from the pipeline and handles the empty-data case.

## [ ] 5. Bullet ID drift

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

## [ ] 8. Adversarial resume evaluation

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

(Appended as items complete or are blocked.)
