# CareerOS MCP Sidecar

Exposes CareerOS brain capabilities to any MCP client (Claude, Hermes, etc.)
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
| `updateStatus` | Update application status |
| `scoreApplication` | Run AF scoring on a stored application |
| `draftMaterials` | Generate resume / cover letter / outreach |
| `queueApproval` | Stage an external action (never executes) |
| `getApprovals` | List pending approvals |
| `recordSend` | Log a send -- requires valid approvalToken |
| `scheduleFollowUp` | Schedule a follow-up (stages; never auto-sends) |

## Security invariant

`resolveApproval` (approve/reject token minting) is NOT an MCP tool. It is
only reachable from the logged-in web UI at `POST /api/approvals/[id]`.
This means the agent can never self-approve its own staged actions.
