import "server-only";
import type { Actuator, FillAndStageResult } from "./types";

/**
 * No-op actuator for tests and for deployments where no external browser
 * agent is connected. Returns an empty screenshotRef and echoes filledFields
 * back unchanged. Status is always "staged".
 */
export const manualActuator: Actuator = {
  async fillAndStage(
    _applicationId: string,
    _formUrl: string,
    fields: Array<{ field: string; value: string }>,
  ): Promise<FillAndStageResult> {
    return { status: "staged", screenshotRef: "", filledFields: fields };
  },
};
