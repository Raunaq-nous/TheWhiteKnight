"use client";

export interface Application {
  id: string;
  slug: string;
  company: string;
  role: string;
  location: string;
  remote: boolean;
  status: "sourced" | "reviewed" | "applied" | "interview" | "offer" | "rejected" | "archived";
  score: number;
  bucket: string;
  sector: string;
  seniority: string;
  sourceUrl: string;
  capturedAt: string;
  jdRaw: string;
  jdParsed: ParsedJD | null;
  nextAction: string;
  contacts: Contact[];
  interviews: Interview[];
  reminders: Reminder[];
  resumeVersions: ResumeVersion[];
  notes: string;
  emailEvents: EmailEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ParsedJD {
  overview: string;
  requirements: string[];
  keywords: string[];
  signals: Record<string, string>;
}

export interface Contact {
  name: string;
  role: string;
  linkedin: string;
  email: string;
}

export interface Interview {
  id: string;
  round: number;
  type: string;
  date: string;
  interviewer: string;
  notes: string;
  outcome: "pending" | "passed" | "failed" | "rescheduled";
  prepNotes: string;
}

export interface Reminder {
  id: string;
  type: "follow-up" | "interview-prep" | "stale-warning" | "custom";
  message: string;
  dueDate: string;
  done: boolean;
}

export interface ResumeVersion {
  id: string;
  version: number;
  createdAt: string;
  content: string;
  bucket: string;
}

export interface EmailEvent {
  id: string;
  date: string;
  type: "confirmation" | "interview-invite" | "rejection" | "follow-up" | "other";
  subject: string;
  snippet: string;
}

export interface UserPersona {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  github: string;
  masterCv: string;
  voiceSamples: string;
  certifications: string;
  publications: string;
  githubProjects: string;
  websiteContent: string;
  targetBuckets: TargetBucket[];
  preferences: Record<string, string>;
  updatedAt: string;
}

export interface TargetBucket {
  id: string;
  name: string;
  description: string;
  titlesMatch: string[];
  titlesExclude: string[];
  sectorsPreferred: string[];
  geographies: string[];
  keywordsRequired: string[];
  keywordsBoost: string[];
  targetCompanies: string[];
  seniority: string[];
  weight: number;
}

export interface Notification {
  id: string;
  type: "info" | "warning" | "action" | "success";
  title: string;
  message: string;
  applicationId?: string;
  createdAt: string;
  read: boolean;
}

const STORAGE_KEYS = {
  APPLICATIONS: "careeros_applications",
  PERSONA: "careeros_persona",
  NOTIFICATIONS: "careeros_notifications",
  SETTINGS: "careeros_settings",
};

// ── Applications ──
export function getApplications(): Application[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEYS.APPLICATIONS);
  return raw ? JSON.parse(raw) : [];
}

export function saveApplication(app: Application): void {
  const apps = getApplications();
  const idx = apps.findIndex(a => a.id === app.id);
  app.updatedAt = new Date().toISOString();
  if (idx >= 0) apps[idx] = app;
  else apps.push(app);
  localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
  window.dispatchEvent(new Event("careeros-data-change"));
}

export function deleteApplication(id: string): void {
  const apps = getApplications().filter(a => a.id !== id);
  localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
  window.dispatchEvent(new Event("careeros-data-change"));
}

export function getApplication(id: string): Application | undefined {
  return getApplications().find(a => a.id === id);
}

// ── Persona ──
export function getPersona(): UserPersona | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.PERSONA);
  return raw ? JSON.parse(raw) : null;
}

export function savePersona(persona: UserPersona): void {
  persona.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.PERSONA, JSON.stringify(persona));
  window.dispatchEvent(new Event("careeros-data-change"));
}

// ── Notifications ──
export function getNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  return raw ? JSON.parse(raw) : [];
}

export function addNotification(n: Omit<Notification, "id" | "createdAt" | "read">): void {
  const notifs = getNotifications();
  notifs.unshift({
    ...n,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    read: false,
  });
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs.slice(0, 100)));
  window.dispatchEvent(new Event("careeros-data-change"));
}

export function markNotificationRead(id: string): void {
  const notifs = getNotifications();
  const n = notifs.find(x => x.id === id);
  if (n) n.read = true;
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
}

export function clearNotifications(): void {
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
}

// ── Generate ID ──
export function generateSlug(company: string, role: string): string {
  return `${company}-${role}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function generateId(): string {
  return crypto.randomUUID();
}