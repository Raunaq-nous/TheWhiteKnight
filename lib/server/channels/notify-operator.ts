import "server-only";
import type { ApprovalAction } from "../repositories/types";
import { buildEmailChannel } from "./email-channel";
import { settingsRepo } from "../repositories/index";

// Self-notification to the operator's pinned address is ungated; all third-party sends remain gated.
// Recipient is always ADMIN_EMAIL — never settable by the agent or any external input.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function notifyOperator(
  userEmail: string,
  approvalId: string,
  action: ApprovalAction,
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const settings = settingsRepo.getIntegrationSettings(userEmail);
  if (!settings.resendApiKey) return;

  const fromAddress = settings.senderEmail
    ? settings.senderEmail
    : `CareerOS <notifications@${new URL(APP_URL).hostname}>`;

  const approvalsUrl = `${APP_URL}/approvals`;
  const channel = buildEmailChannel(settings.resendApiKey, fromAddress);

  const subject = `Action pending approval: ${action.kind}`;
  const appIdLine = action.applicationId
    ? `<li><strong>Application:</strong> ${action.applicationId}</li>`
    : "";
  const html = `
    <p>A new action has been staged for your approval in CareerOS.</p>
    <ul>
      <li><strong>Kind:</strong> ${action.kind}</li>
      ${appIdLine}
      <li><strong>Approval ID:</strong> ${approvalId}</li>
    </ul>
    <p><a href="${approvalsUrl}">Review and approve in CareerOS</a></p>
  `;
  const text = `CareerOS: action pending approval — ${action.kind}. Review at ${approvalsUrl}`;

  await channel.sendEmail({ to: adminEmail, subject, html, text });
}
