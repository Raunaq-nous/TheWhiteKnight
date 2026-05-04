import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "../../../../lib/resend-client";

export const runtime = "nodejs";

export type SendEmailRequest = {
  to: string;
  subject: string;
  body: string;             // plain text body; we'll wrap in basic HTML
  resendApiKey: string;
  senderEmail: string;
  senderName?: string;
  replyTo?: string;
};

function bodyToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;max-width:600px">${escaped.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("")}</body></html>`;
}

// Strip "Subject: ..." line from body if present (since LLM outputs include it)
function extractSubject(body: string, fallback: string): { subject: string; body: string } {
  const m = body.match(/^Subject:\s*(.+?)(?:\r?\n)+/i);
  if (m) {
    return { subject: m[1].trim(), body: body.slice(m[0].length).trimStart() };
  }
  return { subject: fallback, body };
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json() as SendEmailRequest;
    const { to, resendApiKey, senderEmail, senderName, replyTo } = data;

    if (!to || !data.body) return NextResponse.json({ error: "Missing recipient or body" }, { status: 400 });
    if (!resendApiKey) return NextResponse.json({ error: "Resend API key missing. Add it in Settings." }, { status: 400 });
    if (!senderEmail) return NextResponse.json({ error: "Sender email missing. Set it in Settings." }, { status: 400 });

    const { subject, body } = extractSubject(data.body, data.subject || "Hi");
    const from = senderName ? `${senderName} <${senderEmail}>` : senderEmail;

    const result = await sendEmail(resendApiKey, {
      from,
      to,
      subject,
      text: body,
      html: bodyToHtml(body),
      reply_to: replyTo ?? senderEmail,
    });

    return NextResponse.json({ ok: true, id: result.id, sentAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Send failed" }, { status: 500 });
  }
}
