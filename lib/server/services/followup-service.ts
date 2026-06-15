import "server-only";
import { approvalRepo, markApprovalConsumed } from "../repositories/approval-repo";
import { applicationRepo } from "../repositories/application-repo";
import { profileRepo } from "../repositories/profile-repo";
import { settingsRepo } from "../repositories/settings-repo";
import { queueApproval } from "../approval-gate";
import { generateDraft } from "./draft-service";

export type FollowUpResult = {
  processed: number;
  skipped: number;
};

/**
 * Find all due follow_up approvals (payload.when <= now), generate a draft,
 * stage a follow_up_draft approval, and mark the original consumed.
 *
 * Idempotent: the original follow_up is marked consumed after processing, so a
 * second call finds nothing due and returns { processed: 0, skipped: 0 }.
 *
 * NEVER sends anything — only stages approvals for human review.
 */
export async function runDueFollowUps(
  userEmail: string,
  now: Date,
): Promise<FollowUpResult> {
  const nowIso = now.toISOString();

  const dueFollowUps = approvalRepo
    .list(userEmail, "pending")
    .filter(a => {
      if (a.action.kind !== "follow_up") return false;
      const when = a.action.payload?.when as string | undefined;
      return !!when && when <= nowIso;
    });

  let processed = 0;
  let skipped = 0;

  for (const fu of dueFollowUps) {
    const { applicationId } = fu.action;
    if (!applicationId) { skipped++; continue; }

    const app = applicationRepo.getById(userEmail, applicationId);
    if (!app) { skipped++; continue; }

    const profile = profileRepo.get(userEmail);
    if (!profile) { skipped++; continue; }

    const modelSettings = settingsRepo.getModelSettings(userEmail);
    const providerSettings = { provider: modelSettings.provider as "together", model: modelSettings.model };

    let draft: unknown;
    try {
      draft = await generateDraft({ action: "outreach-hm", profile, app, providerSettings });
    } catch {
      skipped++;
      continue;
    }

    // Stage the draft for human review — never execute.
    queueApproval(userEmail, {
      kind: "follow_up_draft",
      applicationId,
      payload: {
        sourceApprovalId: fu.id,
        note: (fu.action.payload?.note as string) ?? "",
        draft,
      },
    });

    // Mark the original follow_up consumed so this run is never re-processed.
    markApprovalConsumed(fu.id);
    processed++;
  }

  return { processed, skipped };
}
