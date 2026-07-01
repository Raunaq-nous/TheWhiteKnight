import "server-only";

/**
 * Result of a fill-and-stage operation.
 *
 * `status` is the narrow literal "staged" — not a union, not optional.
 * There is no submit variant. Submit is structurally impossible: no type
 * in this module can represent a submitted state, and no Actuator method
 * accepts or returns one.
 */
export type FillAndStageResult = {
  readonly status: "staged";
  screenshotRef: string;
  filledFields: Array<{ field: string; value: string }>;
};

/**
 * Interface for any backend that can fill a form and stage the result.
 *
 * Implementations (manual, Hermes, Claude Code local scheduler, VPS cron)
 * are all required to return FillAndStageResult whose status is "staged".
 * No implementation may return a different status — the type enforces this.
 */
export interface Actuator {
  fillAndStage(
    applicationId: string,
    formUrl: string,
    fields: Array<{ field: string; value: string }>,
  ): Promise<FillAndStageResult>;
}
