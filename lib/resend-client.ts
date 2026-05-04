// Resend email client. Sends real emails for HM outreach + CEO cold outreach.
// Docs: https://resend.com/docs/api-reference/emails/send-email

export type ResendSendParams = {
  from: string;     // "Name <verified@yourdomain.com>"
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  cc?: string | string[];
  bcc?: string | string[];
};

export type ResendResponse = {
  id: string;
};

export async function sendEmail(apiKey: string, params: ResendSendParams): Promise<ResendResponse> {
  if (!apiKey) throw new Error("Resend API key missing. Add it in Settings → Integrations.");
  if (!params.from) throw new Error("Sender email missing. Set it in Settings → Integrations.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${err}`);
  }
  return res.json();
}
