import "server-only";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface Channel {
  sendEmail(payload: EmailPayload): Promise<{ messageId: string }>;
}
