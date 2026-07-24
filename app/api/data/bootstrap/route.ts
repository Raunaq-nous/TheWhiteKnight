import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import {
  applicationRepo,
  profileRepo,
  contactRepo,
  skillRepo,
  notificationRepo,
  settingsRepo,
} from "../../../../lib/server/repositories";

export const runtime = "nodejs";

// Returns all user data in one payload. Client calls this once on mount.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = session;
  const adminEmail = process.env.ADMIN_EMAIL ?? "";

  // Seed admin profile from private/admin-profile.json if first run.
  profileRepo.seedIfEmpty(email, adminEmail);

  return NextResponse.json({
    applications: applicationRepo.list(email),
    profile:      profileRepo.get(email),
    contacts:     contactRepo.list(email),
    skillPlan:    skillRepo.getPlan(email),
    skillStatus:  skillRepo.getStatuses(email),
    notifications: notificationRepo.list(email),
    modelSettings:       settingsRepo.getModelSettings(email),
    integrationSettings: settingsRepo.getIntegrationSettings(email),
    companyTargets:      settingsRepo.getCompanyTargets(email),
    batchState:          settingsRepo.getBatchState(email),
    automationSettings:  settingsRepo.getAutomationSettings(email),
  });
}
