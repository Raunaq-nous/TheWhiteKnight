// Client-side in-memory cache. Populated once from /api/data/bootstrap.
// All store modules read here; writes are write-through to the server.
// careeros-theme is intentionally NOT here — it stays in localStorage.

import type { Application } from "./store";
import type { Profile } from "./profile";
import type { Contact } from "./contacts-store";
import type { StoredPlan, SkillStatus } from "./skills-store";
import type { Notification } from "./notifications";
import type { ModelSettings } from "./model-settings";
import type { IntegrationSettings } from "./integration-settings";
import type { CompanyTarget } from "./company-targets";
import type { BatchState } from "./batch-runner";
import type { AutomationSettings } from "./automation-settings";

export type CacheData = {
  applications: Application[];
  profile: Profile | null;
  contacts: Contact[];
  skillPlan: StoredPlan | null;
  skillStatus: Record<string, SkillStatus>;
  notifications: Notification[];
  modelSettings: ModelSettings;
  integrationSettings: IntegrationSettings;
  companyTargets: CompanyTarget[];
  batchState: BatchState | null;
  automationSettings: AutomationSettings;
};

const EMPTY: CacheData = {
  applications: [],
  profile: null,
  contacts: [],
  skillPlan: null,
  skillStatus: {},
  notifications: [],
  modelSettings: { provider: "together", model: "deepseek-ai/DeepSeek-V4-Pro" },
  integrationSettings: {},
  companyTargets: [],
  batchState: null,
  automationSettings: { enabled: false, schedule: "24h", lastRunAt: null, maxJobsPerRun: 8 },
};

let cache: CacheData = { ...EMPTY };
let hydrated = false;

// --- Safe authed fetch ---
// Never JSON.parse a redirect or HTML body. A protected endpoint should either
// return real JSON or a clean 401; anything else (a followed redirect landing on
// the HTML /login page, a blocked opaque redirect) is treated as "not logged in".
export type AuthedFetchResult =
  | { ok: true; data: any }
  | { ok: false; unauthenticated: true }
  | { ok: false; unauthenticated: false; status?: number; error?: string };

export async function fetchAuthedJson(url: string, init: RequestInit = {}): Promise<AuthedFetchResult> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "include", redirect: "manual" });
  } catch (e: any) {
    return { ok: false, unauthenticated: false, error: e?.message ?? "Network error" };
  }

  // Blocked/opaque redirect, or an explicit 3xx — the server tried to send us to /login.
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (!res.ok) {
    return { ok: false, unauthenticated: false, status: res.status };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // Got HTML (or something else) where JSON was expected — never JSON.parse this.
    return { ok: false, unauthenticated: true };
  }

  return { ok: true, data: await res.json() };
}

export function setCache(data: Partial<CacheData>) {
  cache = { ...EMPTY, ...data };
  hydrated = true;
}

export function isHydrated() { return hydrated; }
export function getCache(): CacheData { return cache; }

// Granular updaters used by write-through helpers.
export function updateCacheApplications(apps: Application[]) {
  cache = { ...cache, applications: apps };
}
export function updateCacheProfile(profile: Profile) {
  cache = { ...cache, profile };
}
export function updateCacheContacts(contacts: Contact[]) {
  cache = { ...cache, contacts };
}
export function updateCacheNotifications(notifs: Notification[]) {
  cache = { ...cache, notifications: notifs };
}
export function updateCacheSkillPlan(plan: StoredPlan) {
  cache = { ...cache, skillPlan: plan };
}
export function updateCacheSkillStatus(status: Record<string, SkillStatus>) {
  cache = { ...cache, skillStatus: status };
}
export function updateCacheModelSettings(s: ModelSettings) {
  cache = { ...cache, modelSettings: s };
}
export function updateCacheIntegrationSettings(s: IntegrationSettings) {
  cache = { ...cache, integrationSettings: s };
}
export function updateCacheCompanyTargets(targets: CompanyTarget[]) {
  cache = { ...cache, companyTargets: targets };
}
export function updateCacheBatchState(state: BatchState | null) {
  cache = { ...cache, batchState: state };
}
export function updateCacheAutomationSettings(s: AutomationSettings) {
  cache = { ...cache, automationSettings: s };
}

// --- Write-through helpers ---
// Each returns the server response. On failure, reverts the optimistic cache update.

type WriteResult = { ok: boolean; error?: string };

async function serverPut(url: string, body: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { ok: false, error: d.error ?? `Server error ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Network error" };
  }
}

async function serverPost(url: string, body: unknown): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { ok: false, error: d.error ?? `Server error ${res.status}` };
    }
    return { ok: true, data: await res.json() };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Network error" };
  }
}

async function serverDelete(url: string): Promise<WriteResult> {
  try {
    const res = await fetch(url, { method: "DELETE", credentials: "include" });
    if (!res.ok) return { ok: false, error: `Server error ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Network error" };
  }
}

// --- Application write-through ---

export async function wt_saveApplication(app: Application): Promise<void> {
  const prev = cache.applications;
  const existing = prev.findIndex(a => a.id === app.id);
  const next = existing >= 0
    ? prev.map((a, i) => (i === existing ? app : a))
    : [...prev, app];
  updateCacheApplications(next);
  window.dispatchEvent(new Event("careeros-data-change"));

  const result = await serverPost("/api/data/applications", app);
  if (!result.ok) {
    updateCacheApplications(prev);
    window.dispatchEvent(new Event("careeros-data-change"));
    throw new Error(result.error ?? "Save failed");
  }
}

export async function wt_updateApplication(id: string, changes: Partial<Application>): Promise<void> {
  const prev = cache.applications;
  const idx = prev.findIndex(a => a.id === id);
  if (idx < 0) return;
  const next = prev.map((a, i) => (i === idx ? { ...a, ...changes, updatedAt: new Date().toISOString() } : a));
  updateCacheApplications(next);
  window.dispatchEvent(new Event("careeros-data-change"));

  const result = await serverPut(`/api/data/applications/${id}`, changes);
  if (!result.ok) {
    updateCacheApplications(prev);
    window.dispatchEvent(new Event("careeros-data-change"));
    throw new Error(result.error ?? "Update failed");
  }
}

export async function wt_deleteApplication(id: string): Promise<void> {
  const prev = cache.applications;
  updateCacheApplications(prev.filter(a => a.id !== id));
  window.dispatchEvent(new Event("careeros-data-change"));

  const result = await serverDelete(`/api/data/applications/${id}`);
  if (!result.ok) {
    updateCacheApplications(prev);
    window.dispatchEvent(new Event("careeros-data-change"));
    throw new Error(result.error ?? "Delete failed");
  }
}

// --- Profile write-through ---

export async function wt_saveProfile(profile: Profile): Promise<void> {
  const prev = cache.profile;
  updateCacheProfile(profile);
  window.dispatchEvent(new Event("careeros-profile-change"));

  const result = await serverPut("/api/data/profile", profile);
  if (!result.ok) {
    if (prev) updateCacheProfile(prev);
    else cache = { ...cache, profile: null };
    window.dispatchEvent(new Event("careeros-profile-change"));
    throw new Error(result.error ?? "Save failed");
  }
}

// --- Contact write-through ---

export async function wt_addContact(c: Omit<Contact, "id" | "createdAt" | "tags" | "applicationSlugs"> & { tags?: string[]; applicationSlugs?: string[] }): Promise<Contact> {
  const result = await serverPost("/api/data/contacts", c);
  if (!result.ok) throw new Error(result.error ?? "Add failed");
  const contact: Contact = result.data;
  // Merge into cache (server deduped, so replace any matching entry)
  const prev = cache.contacts.filter(x => x.id !== contact.id);
  updateCacheContacts([contact, ...prev]);
  window.dispatchEvent(new Event("careeros-contacts-change"));
  return contact;
}

export async function wt_updateContact(id: string, changes: Partial<Contact>): Promise<void> {
  const prev = cache.contacts;
  updateCacheContacts(prev.map(c => (c.id === id ? { ...c, ...changes } : c)));
  window.dispatchEvent(new Event("careeros-contacts-change"));

  const result = await serverPut(`/api/data/contacts/${id}`, changes);
  if (!result.ok) {
    updateCacheContacts(prev);
    window.dispatchEvent(new Event("careeros-contacts-change"));
    throw new Error(result.error ?? "Update failed");
  }
}

export async function wt_deleteContact(id: string): Promise<void> {
  const prev = cache.contacts;
  updateCacheContacts(prev.filter(c => c.id !== id));
  window.dispatchEvent(new Event("careeros-contacts-change"));

  const result = await serverDelete(`/api/data/contacts/${id}`);
  if (!result.ok) {
    updateCacheContacts(prev);
    window.dispatchEvent(new Event("careeros-contacts-change"));
    throw new Error(result.error ?? "Delete failed");
  }
}

// --- Notification write-through ---

export async function wt_addNotification(n: Omit<Notification, "id" | "createdAt" | "dismissed">): Promise<string> {
  const result = await serverPost("/api/data/notifications", n);
  if (!result.ok) throw new Error(result.error ?? "Add failed");
  const id: string = result.data.id;
  const notif: Notification = { ...n, id, createdAt: new Date().toISOString(), dismissed: false };
  updateCacheNotifications([...cache.notifications, notif]);
  window.dispatchEvent(new Event("careeros-notif-change"));
  return id;
}

export async function wt_updateNotification(id: string, changes: Partial<Notification>): Promise<void> {
  const prev = cache.notifications;
  updateCacheNotifications(prev.map(n => (n.id === id ? { ...n, ...changes } : n)));
  window.dispatchEvent(new Event("careeros-notif-change"));

  const result = await serverPut(`/api/data/notifications/${id}`, changes);
  if (!result.ok) {
    updateCacheNotifications(prev);
    window.dispatchEvent(new Event("careeros-notif-change"));
    throw new Error(result.error ?? "Update failed");
  }
}

// --- Settings write-through (fire-and-forget variant, UI doesn't need to wait) ---

export async function wt_saveSettings(key: string, value: unknown): Promise<void> {
  const result = await serverPut(`/api/data/settings/${key}`, value);
  if (!result.ok) console.error(`[CareerOS] Settings save failed for key=${key}:`, result.error);
}

// --- One-time localStorage migration ---

const MIGRATION_FLAG = "careeros_migrated_v1";

export async function runMigration() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  // Only migrate if server is empty for this user (cache just loaded blank from bootstrap).
  if (cache.applications.length > 0 || cache.profile !== null) {
    localStorage.setItem(MIGRATION_FLAG, "1");
    return;
  }

  const legacyKeys: Record<string, string> = {
    careeros_apps:               "applications",
    careeros_profile:            "profile",
    careeros_contacts:           "contacts",
    careeros_skill_plan:         "skillPlan",
    careeros_skill_status:       "skillStatus",
    careeros_notifications:      "notifications",
    careeros_model_settings:     "modelSettings",
    careeros_integration_settings: "integrationSettings",
    careeros_company_targets:    "companyTargets",
    careeros_batch_state:        "batchState",
  };

  const found: Record<string, unknown> = {};
  let hasAny = false;
  for (const [lsKey, cacheKey] of Object.entries(legacyKeys)) {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      try { found[cacheKey] = JSON.parse(raw); hasAny = true; } catch { /* skip */ }
    }
  }

  if (hasAny) {
    // NOTE: same-origin migration only. Data from a different origin (e.g. Vercel demo)
    // must be moved via Export JSON → Import, not this localStorage migration.
    const res = await fetch("/api/data/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ data: found, mode: "merge" }),
    });
    if (res.ok) {
      // Reload cache from server after migration
      const fresh = await fetchAuthedJson("/api/data/bootstrap");
      if (fresh.ok) setCache(fresh.data);
    }
  }

  localStorage.setItem(MIGRATION_FLAG, "1");
}
