// Client-side notification / action queue stored in localStorage.
// Every high-stakes action (send DM, send outreach, follow up) queues here
// and waits for explicit user confirmation before anything is executed.

export type NotifType =
  | "pending_dm"
  | "pending_outreach"
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
  createdAt: string;
  dueAt?: string;
  dismissed: boolean;
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

export function addNotification(n: Omit<Notification, "id" | "createdAt" | "dismissed">): void {
  const all = load();
  all.push({ ...n, id: Math.random().toString(36).slice(2, 10), createdAt: new Date().toISOString(), dismissed: false });
  save(all);
}

export function dismissNotification(id: string): void {
  const all = load().map(n => n.id === id ? { ...n, dismissed: true } : n);
  save(all);
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

export function queueDM(applicationSlug: string, company: string, role: string, generatedContent: string): void {
  addNotification({
    type: "pending_dm",
    title: `Send LinkedIn DM — ${company}`,
    body: `Review and confirm before sending your DM for the ${role} role at ${company}.`,
    applicationSlug,
    company,
    role,
    generatedContent,
  });
}

export function queueOutreach(applicationSlug: string, company: string, role: string, generatedContent: string): void {
  addNotification({
    type: "pending_outreach",
    title: `Send HM Outreach — ${company}`,
    body: `Review and confirm before sending your outreach email for the ${role} role.`,
    applicationSlug,
    company,
    role,
    generatedContent,
  });
}

export function getUnreadCount(): number {
  const now = new Date().toISOString();
  return load().filter(n => !n.dismissed && (!n.dueAt || n.dueAt <= now)).length;
}
