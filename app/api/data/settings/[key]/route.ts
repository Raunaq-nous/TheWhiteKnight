import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/session";
import { settingsRepo, skillRepo } from "../../../../../lib/server/repositories";

export const runtime = "nodejs";

type SettingsKey =
  | "model_settings"
  | "integration_settings"
  | "company_targets"
  | "batch_state"
  | "skill_plan"
  | "skill_status";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await params;
  const data = readKey(session.email, key as SettingsKey);
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await params;
  const value = await req.json();
  writeKey(session.email, key as SettingsKey, value);
  return NextResponse.json({ ok: true });
}

function readKey(email: string, key: SettingsKey) {
  switch (key) {
    case "model_settings":       return settingsRepo.getModelSettings(email);
    case "integration_settings": return settingsRepo.getIntegrationSettings(email);
    case "company_targets":      return settingsRepo.getCompanyTargets(email);
    case "batch_state":          return settingsRepo.getBatchState(email);
    case "skill_plan":           return skillRepo.getPlan(email);
    case "skill_status":         return skillRepo.getStatuses(email);
    default: return null;
  }
}

function writeKey(email: string, key: SettingsKey, value: unknown) {
  switch (key) {
    case "model_settings":       settingsRepo.saveModelSettings(email, value as any); break;
    case "integration_settings": settingsRepo.saveIntegrationSettings(email, value as any); break;
    case "company_targets":      settingsRepo.saveCompanyTargets(email, value as any); break;
    case "batch_state":          settingsRepo.saveBatchState(email, value as any); break;
    case "skill_plan":           skillRepo.savePlan(email, value as any); break;
    case "skill_status": {
      const statuses = value as Record<string, any>;
      for (const [name, status] of Object.entries(statuses)) {
        skillRepo.setStatus(email, name, status);
      }
      break;
    }
  }
}
