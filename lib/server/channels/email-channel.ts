import "server-only";
import type { Channel, EmailPayload } from "./channel";

export function buildEmailChannel(apiKey: string, fromAddress: string): Channel {
  return {
    async sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from: fromAddress,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        ...(payload.text ? { text: payload.text } : {}),
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Resend send failed");
      }
      return { messageId: result.data!.id };
    },
  };
}
