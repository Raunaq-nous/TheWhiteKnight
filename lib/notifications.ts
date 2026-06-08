// Notification/approval queue — reads from cache, writes through to server.
// Every high-stakes action (send DM, send outreach, follow up) queues here
// and waits for explicit user confirmation before anything is executed.

import { getCache, wt_addNotification, wt_updateNotification } from "./data-cache";

export type NotifType =
  | "pending_dm"
  | "pending_referral_dm"
  | "pending_outreach"
  | "pending_ceo_email"
  | "followup_reminder"
  | "follow_up_scheduled"
  | "interview_reminder"
  | "offer_deadline"
  | "approval_pending"
  | "info";

export type Notification = {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  applicationSlug?: string;
  company?: string;
  role?: string;
  generatedContent?: string;
  generatedSubject?: string;
  contactName?: string;
  contactEmail?: string;
  contactLinkedIn?: string;
  contactId?: string;
  createdAt: string;
  dueAt?: string;
  dismissed: boolean;
  sent?: boolean;
  sentAt?: string;
};

export function getNotifications(): Notification[] {
  return getCache().notifications
    .filter(n => !n.dismissed)
    .sort((a, b) => ((a.dueAt ?? a.createdAt) < (b.dueAt ?? b.createdAt) ? -1 : 1));
}

export function addNotification(n: Omit<Notification, "id" | "createdAt" | "dismissed">): Promise<string> {
  return wt_addNotification(n);
}

export function dismissNotification(id: string): void {
  wt_updateNotification(id, { dismissed: true }).catch(e =>
    console.error("[CareerOS] dismissNotification failed:", e)
  );
}

export function updateNotification(id: string, changes: Partial<Notification>): void {
  wt_updateNotification(id, changes).catch(e =>
    console.error("[CareerOS] updateNotification failed:", e)
  );
}

export function markSent(id: string): void {
  updateNotification(id, { sent: true, sentAt: new Date().toISOString() });
}

export function scheduleFollowUp(applicationSlug: string, company: string, role: string, daysFromNow = 7): void {
  const due = new Date();
  due.setDate(due.getDate() + daysFromNow);
  addNotification({
    type: "followup_reminder",
    title: `Follow up: ${company}`,
    body: `It's been ${daysFromNow} days since you applied to ${role} at ${company}. Time to send a nudge?`,
    applicationSlug,
    company,
    role,
    dueAt: due.toISOString(),
  });
}

export function queueDM(
  applicationSlug: string,
  company: string,
  role: string,
  generatedContent: string,
  contact?: { name: string; linkedinUrl?: string; contactId?: string }
): Promise<string> {
  return addNotification({
    type: "pending_dm",
    title: contact ? `Send LinkedIn DM to ${contact.name} — ${company}` : `Send LinkedIn DM — ${company}`,
    body: `Review and confirm before sending your DM for the ${role} role at ${company}.`,
    applicationSlug,
    company,
    role,
    generatedContent,
    contactName: contact?.name,
    contactLinkedIn: contact?.linkedinUrl,
    contactId: contact?.contactId,
  });
}

export function queueReferralDM(
  applicationSlug: string,
  company: string,
  role: string,
  generatedContent: string,
  contact: { name: string; linkedinUrl?: string; contactId?: string }
): Promise<string> {
  return addNotification({
    type: "pending_referral_dm",
    title: `Referral DM to ${contact.name} — ${company}`,
    body: `Review and send a referral request to ${contact.name} for the ${role} role.`,
    applicationSlug,
    company,
    role,
    generatedContent,
    contactName: contact.name,
    contactLinkedIn: contact.linkedinUrl,
    contactId: contact.contactId,
  });
}

export function queueOutreach(
  applicationSlug: string,
  company: string,
  role: string,
  generatedContent: string,
  contact?: { name: string; email?: string; linkedinUrl?: string; contactId?: string }
): Promise<string> {
  return addNotification({
    type: "pending_outreach",
    title: contact ? `Send HM Outreach to ${contact.name} — ${company}` : `Send HM Outreach — ${company}`,
    body: `Review and send your outreach email for the ${role} role.`,
    applicationSlug,
    company,
    role,
    generatedContent,
    contactName: contact?.name,
    contactEmail: contact?.email,
    contactLinkedIn: contact?.linkedinUrl,
    contactId: contact?.contactId,
  });
}

export function queueCEOEmail(
  applicationSlug: string,
  company: string,
  role: string,
  generatedContent: string,
  contact?: { name: string; email?: string; linkedinUrl?: string; contactId?: string }
): Promise<string> {
  return addNotification({
    type: "pending_ceo_email",
    title: contact ? `CEO Cold Email to ${contact.name} — ${company}` : `CEO Cold Email — ${company}`,
    body: `Review and send your cold email to the CEO of ${company}.`,
    applicationSlug,
    company,
    role,
    generatedContent,
    contactName: contact?.name,
    contactEmail: contact?.email,
    contactLinkedIn: contact?.linkedinUrl,
    contactId: contact?.contactId,
  });
}

export function getUnreadCount(): number {
  const now = new Date().toISOString();
  return getCache().notifications.filter(
    n => !n.dismissed && !n.sent && (!n.dueAt || n.dueAt <= now)
  ).length;
}
