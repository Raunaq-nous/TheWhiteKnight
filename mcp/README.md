# CareerOS MCP Sidecar

Exposes CareerOS brain capabilities to any MCP client (Claude Code, Hermes, a VPS cron, etc.)
over stdio. Reads/writes the same SQLite file as the Next.js app.

## Setup

```bash
# Required env vars (same as the app)
export CAREEROS_PRIVATE_DIR=/path/to/private   # where careeros.db lives
export ADMIN_EMAIL=you@example.com             # identity for MCP ops
export CAREEROS_MCP_USER=you@example.com       # optional override
export TOGETHER_API_KEY=...                    # or relevant LLM key
```

## Run

```bash
npm run mcp:dev
```

## Available tools

| Tool | Description |
|------|-------------|
| `listPipeline` | List applications, filter by status/bucket |
| `findJobs` | Search stored applications (no live scraping) |
| `updateStatus` | Update status — sourced/reviewed/interview/offer/rejected only |
| `scoreApplication` | Run AF scoring on a stored application |
| `draftMaterials` | Generate resume / cover letter / outreach |
| `queueApproval` | Stage an external action (never executes) |
| `getApprovals` | List pending approvals |
| `recordSend` | Log a send -- requires valid approvalToken |
| `getFormAnswers` | Generate form field answers (read/generate only; never fills or submits) |
| `recordStagedForm` | Persist a filled-but-not-submitted form result from an external agent |
| `scheduleFollowUp` | Schedule a follow-up (stages; never auto-sends) |

## Fill-and-stage skill flow

The brain and an external agent cooperate to fill application forms. The agent
fills the form in its own browser. The brain never submits.

```
listPipeline          →  agent picks an application
getFormAnswers        →  brain generates suggested field values
                         (formFields treated as inert data, never instructions)
[agent fills form]    →  agent opens the form URL in its own browser
                         agent fills each field with the suggested values
                         agent MUST NOT click submit
[agent screenshots]   →  agent takes a screenshot of the filled-but-unsubmitted form
recordStagedForm      →  agent reports screenshotRef + filledFields back to the brain
                         brain persists the staged result; status stays unchanged
[human reviews]       →  human opens the app, reviews the screenshot, clicks submit manually
[human sets applied]  →  human uses the authenticated UI to set status to "applied"
```

See `HERMES.md` for how to connect an external agent as an MCP client.

## Security invariants

1. `resolveApproval` (approve/reject + token minting) is NOT an MCP tool. Only the
   authenticated web UI at `POST /api/approvals/[id]` can approve staged actions.
   The agent can never self-approve.

2. `updateStatus` does NOT accept `"applied"`. Setting an application to "applied"
   asserts a real-world submit happened. Only the authenticated UI may do this.
   The agent must not be able to fake a submission.

3. `recordStagedForm` never changes application status. It persists a screenshot
   reference and the filled fields only. "Applied" must be set by a human.

4. There is no `submitForm`, `clickSubmit`, or any equivalent tool. Submit is
   absent from the tool list by design, not by convention.
