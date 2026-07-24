import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import {
  applicationRepo,
  profileRepo,
  contactRepo,
  skillRepo,
  notificationRepo,
  settingsRepo,
} from "../../../../lib/server/repositories";
import type { Application } from "../../../../lib/store";
import type { Contact } from "../../../../lib/contacts-store";

export const runtime = "nodejs";

// POST body: { data: <export JSON>, mode: "replace" | "merge" }
// replace: wipes all current data and restores from export
// merge:   adds/updates records, dedupes applications by id
//          and contacts by email or linkedinUrl — safe to re-run
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, mode } = await req.json() as { data: Record<string, any>; mode: "replace" | "merge" };
  if (!data || !["replace", "merge"].includes(mode)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { email } = session;

  if (mode === "replace") {
    // Full replace: remove existing data first
    const existing = applicationRepo.list(email);
    for (const a of existing) applicationRepo.delete(email, a.id);
    const existingContacts = contactRepo.list(email);
    for (const c of existingContacts) contactRepo.delete(email, c.id);
  }

  // Applications — dedupe by id
  const apps: Application[] = data.applications ?? [];
  for (const app of apps) {
    const exists = applicationRepo.getById(email, app.id);
    if (mode === "merge" && exists) {
      applicationRepo.update(email, app.id, app);
    } else {
      applicationRepo.save(email, app);
    }
  }

  // Profile — only write if not already set (merge) or always (replace)
  if (data.profile) {
    if (mode === "replace" || !profileRepo.has(email)) {
      profileRepo.save(email, data.profile);
    }
  }

  // Contacts — dedupe by email or linkedinUrl using add() which handles dedup
  const contacts: Contact[] = data.contacts ?? [];
  if (mode === "replace") {
    for (const c of contacts) {
      applicationRepo; // ensure db open
      contactRepo.add(email, c);
    }
  } else {
    for (const c of contacts) {
      contactRepo.add(email, c); // add() is idempotent via dedup logic
    }
  }

  // Skills
  if (data.skillPlan) skillRepo.savePlan(email, data.skillPlan);
  if (data.skillStatus) {
    for (const [name, status] of Object.entries(data.skillStatus as Record<string, any>)) {
      skillRepo.setStatus(email, name, status);
    }
  }

  // Notifications (append — don't overwrite dismissed state in merge)
  const notifs = data.notifications ?? [];
  if (mode === "replace") {
    for (const n of notifs) notificationRepo.add(email, n);
  }

  // Settings
  if (data.modelSettings)       settingsRepo.saveModelSettings(email, data.modelSettings);
  if (data.integrationSettings) settingsRepo.saveIntegrationSettings(email, data.integrationSettings);
  if (data.companyTargets)      settingsRepo.saveCompanyTargets(email, data.companyTargets);
  if (data.batchState)          settingsRepo.saveBatchState(email, data.batchState);
  if (data.automationSettings)  settingsRepo.saveAutomationSettings(email, data.automationSettings);
  // appendAutomationRun prepends each call, so replay oldest-first to preserve
  // the original (newest-first) order after import.
  if (data.automationRuns)      for (const run of [...data.automationRuns].reverse()) settingsRepo.appendAutomationRun(email, run);

  return NextResponse.json({ ok: true, imported: { applications: apps.length, contacts: contacts.length } });
}
