# Connecting an External Agent as an MCP Client

CareerOS exposes a stdio MCP server. Any MCP-compatible client can connect to
it: Hermes, Claude Code running locally, a VPS cron with Playwright, or any
other agent. The brain is backend-neutral; Hermes is one option, not a
hard-wired dependency.

## Starting the MCP server

```bash
npm run mcp:dev
# or in production
node dist/mcp/server.js
```

The server speaks MCP over stdio. Connect any MCP client to the process.

## Fill-and-stage skill (step by step)

This is the recommended flow for form-filling. The agent fills; the human submits.

### Step 1 — Find a target application

```json
{ "tool": "listPipeline", "arguments": { "status": "reviewed", "limit": 10 } }
```

Pick an application ID from the results.

### Step 2 — Get form field answers

```json
{
  "tool": "getFormAnswers",
  "arguments": {
    "applicationId": "<id>",
    "formFields": [
      "Why do you want to work here?",
      "Describe a time you led a cross-functional team.",
      "What is your expected salary?"
    ]
  }
}
```

The brain generates tailored answers. Form field labels are treated as inert
text by the brain — they are never executed or used to select tools.

### Step 3 — Fill the form (agent-side, in the agent's own browser)

The agent navigates to the form URL, fills each field with the suggested
answer, and verifies the content looks correct.

**The agent MUST NOT click submit.** The brain exposes no tool that could
trigger a submit, and the agent must not find another way to do so.
The CareerOS architecture makes this a structural guarantee, not a convention:
there is no submit tool, and no status mutation from the agent can assert
"applied."

### Step 4 — Take a screenshot

Before leaving the page, the agent takes a screenshot of the filled-but-
unsubmitted form. Store it somewhere accessible (object storage, local path,
content-addressed hash).

### Step 5 — Report the staged result

```json
{
  "tool": "recordStagedForm",
  "arguments": {
    "applicationId": "<id>",
    "screenshotRef": "s3://my-bucket/screenshots/acme-2024-06-01.png",
    "filledFields": [
      { "field": "Why do you want to work here?", "value": "..." },
      { "field": "Describe a time you led a cross-functional team.", "value": "..." }
    ],
    "formUrl": "https://apply.acme.com/careers/pm-role"
  }
}
```

The brain persists the result. Application status is NOT changed.

### Step 6 — Human review and submit

The human opens CareerOS, reviews the screenshot, and submits the form
manually. The human then sets the application status to "applied" via the
authenticated UI. The agent cannot do this.

## What the brain will never expose

| Action | Why it is absent |
|--------|-----------------|
| Click submit | Submits a real application without human sign-off |
| Set status to "applied" | Falsely asserts a real-world submit happened |
| Approve a staged action | Self-approval breaks the human-in-the-loop gate |

These are structural absences enforced in the type system and the tool registry,
not runtime guards that could be bypassed.

## Using a different backend

Hermes is one MCP-client implementation. The same flow works with any agent:

- **Claude Code local scheduler** — use computer-use or browser tools, then
  call `recordStagedForm` with the screenshot reference.

- **VPS cron + Playwright** — run headless Playwright, fill fields, screenshot,
  then call `recordStagedForm` over stdio or via a thin HTTP wrapper.

- **Manual testing** — connect with `claude mcp add careeros -- npm run mcp:dev`
  and call tools interactively.

The brain does not care which agent fills the form; it only cares that the
result is reported back via `recordStagedForm` in the correct shape.
