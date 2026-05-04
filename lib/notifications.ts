// Client-side notification / action queue stored in localStorage.
// Every high-stakes action (send DM, send outreach, follow up) queues here
// and waits for explicit user confirmation before anything is executed.

export type NotifType =
  | "pending_dm"
  | "pending_referral_dm"
  | "pending_outreach"
  | "pending_ceo_email"
  | "followup_reminder"
  | "interview_reminder"
  | "offer_deadline"
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

const KEY = "careeros_notifications";

function load(): Notification[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function save(notifs: Notification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(notifs));
  window.dispatchEvent(new Event("careeros-notif-change"));
}

export function getNotifications(): Notification[] {
  return load().filter(n => !n.dismissed).sort((a, b) =>
    (a.dueAt ?? a.createdAt) < (b.dueAt ?? b.createdAt) ? -1 : 1
  );
}

export function addNotification(n: Omit<Notification, "id" | "createdAt" | "dismissed">): string {
  const all = load();
  const id = Math.random().toString(36).slice(2, 10);
  all.push({ ...n, id, createdAt: new Date().toISOString(), dismissed: false });
  save(all);
  return id;
}

export function dismissNotification(id: string): void {
  const all = load().map(n => n.id === id ? { ...n, dismissed: true } : n);
  save(all);
}

export function updateNotification(id: string, changes: Partial<Notification>): void {
  const all = load().map(n => n.id === id ? { ...n, ...changes } : n);
  save(all);
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
): string {
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
): string {
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
): string {
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
): string {
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
  return load().filter(n => !n.dismissed && !n.sent && (!n.dueAt || n.dueAt <= now)).length;
}
