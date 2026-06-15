import "server-only";
import type { Actuator, FillAndStageResult } from "./types";

/**
 * Brain-side record-keeper for results reported by an external MCP-client agent.
 *
 * ARCHITECTURE — backend-neutral design
 * ======================================
 * "Hermes" is one example of an external agent that can drive the fill-and-stage
 * flow. The same Actuator interface is equally drivable by:
 *   - Hermes  (autonomous browser agent connected as an MCP client)
 *   - Claude Code running locally with its own browser/computer-use tools
 *   - A VPS cron that runs Playwright and reports back via recordStagedForm
 *   - Any other agent that can call MCP tools over stdio or HTTP
 *
 * This module does NOT contact Hermes or any external service directly.
 * The fill-and-stage flow is always:
 *   1. Brain calls getFormAnswers → field suggestions returned to agent.
 *   2. External agent opens form URL in its own browser.
 *   3. Agent fills each field — and MUST NOT click submit.
 *   4. Agent takes a screenshot, then calls recordStagedForm MCP tool.
 *   5. Brain persists the staged result via persistStagedForm (form-service).
 *
 * This implementation is used for dry-run flows, integration testing, and
 * any context where the brain already holds the filled result and needs to
 * persist it through the standard interface contract.
 *
 * Status is always "staged". Submit is structurally impossible from this layer.
 */
export const hermesActuator: Actuator = {
  async fillAndStage(
    _applicationId: string,
    _formUrl: string,
    fields: Array<{ field: string; value: string }>,
  ): Promise<FillAndStageResult> {
    // Production: the external agent reports the result via recordStagedForm.
    // This method is the dry-run / test path only.
    return { status: "staged", screenshotRef: "", filledFields: fields };
  },
};
