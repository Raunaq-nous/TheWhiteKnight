import "server-only";
import { buildEmailChannel } from "../channels/email-channel";
import { settingsRepo } from "../repositories/settings-repo";
import { applicationRepo } from "../repositories/application-repo";

export type SendResult =
  | { channel: "email"; messageId: string; sentAt: string }
  | { channel: "linkedin_manual"; draft: string; stagedAt: string };

/**
 * Execute a real send or record a LinkedIn draft-for-manual-send.
 *
 * "email"           — pulls Resend key + sender from integration settings, sends
 *                     via Resend, then records the event on the application.
 *                     Throws on send failure; caller must not consume the approval.
 *
 * "linkedin_manual" — NEVER makes a network call. Returns the drafted message for
 *                     the human to send by hand. Records it as staged-for-manual.
 *                     No LinkedIn API is called on any code path.
 */
export async function executeSend(
  userEmail: string,
  applicationId: string,
  channel: "email" | "linkedin_manual" | string,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  if (channel === "email") {
    const settings = settingsRepo.getIntegrationSettings(userEmail);
    if (!settings.resendApiKey) {
      throw new Error("Resend API key not configured; cannot send email");
    }
    const fromAddress = settings.senderEmail ?? `CareerOS <noreply@careeros.local>`;
    const emailCh = buildEmailChannel(settings.resendApiKey, fromAddress);

    const to = payload.to as string;
    const subject = payload.subject as string;
    const html = payload.html as string;
    const text = payload.text as string | undefined;

    if (!to || !subject || !html) {
      throw new Error("Email payload missing required fields: to, subject, html");
    }

    // Send first. If this throws, the caller must not mark the approval consumed.
    const { messageId } = await emailCh.sendEmail({ to, subject, html, text });
    const sentAt = new Date().toISOString();

    // Record event after successful send.
    const app = applicationRepo.getById(userEmail, applicationId);
    if (app) {
      applicationRepo.update(userEmail, applicationId, {
        emailEvents: [
          ...app.emailEvents,
          { channel, to, subject, sentAt, messageId },
        ],
      });
    }

    return { channel: "email", messageId, sentAt };
  }

  if (channel === "linkedin_manual") {
    // Never send on any LinkedIn path. Return the draft for human hand-send.
    const draft = (payload.draft ?? payload.message ?? "") as string;
    const stagedAt = new Date().toISOString();

    const app = applicationRepo.getById(userEmail, applicationId);
    if (app) {
      applicationRepo.update(userEmail, applicationId, {
        emailEvents: [
          ...app.emailEvents,
          { channel, draft, stagedAt, status: "staged_for_manual" },
        ],
      });
    }

    return { channel: "linkedin_manual", draft, stagedAt };
  }

  throw new Error(`Unsupported channel: ${channel}`);
}
