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

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = session;
  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: email,
    version: 1,
    applications:        applicationRepo.list(email),
    profile:             profileRepo.get(email),
    contacts:            contactRepo.list(email),
    skillPlan:           skillRepo.getPlan(email),
    skillStatus:         skillRepo.getStatuses(email),
    notifications:       notificationRepo.list(email),
    modelSettings:       settingsRepo.getModelSettings(email),
    integrationSettings: settingsRepo.getIntegrationSettings(email),
    companyTargets:      settingsRepo.getCompanyTargets(email),
    batchState:          settingsRepo.getBatchState(email),
    automationSettings:  settingsRepo.getAutomationSettings(email),
    automationRuns:      settingsRepo.getAutomationRuns(email),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="careeros-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
