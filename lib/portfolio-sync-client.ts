// Client wrappers for the portfolio sync feature (app/api/portfolio/*).

import type { Profile } from "./profile";
import type { MergeDiffItem } from "./profile-merge";
import type { PortfolioBuildDraft } from "./schemas";
import { getModelSettings } from "./model-settings";
import { getIntegrationSettings } from "./integration-settings";

function providerSettings() {
  const s = getModelSettings();
  return s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export function hasPortfolioToken(): boolean {
  return !!getIntegrationSettings().portfolioGithubToken?.trim();
}

export async function pullFromPortfolio(profile: Profile): Promise<MergeDiffItem[]> {
  const { items } = await postJson<{ items: MergeDiffItem[] }>("/api/portfolio/pull", {
    profile, githubToken: getIntegrationSettings().portfolioGithubToken,
  });
  return items;
}

export type PortfolioPushResult = { pr: { url: string; number: number }; draft: PortfolioBuildDraft };

export async function pushProjectToPortfolio(project: {
  name: string; description: string; outcomes?: string | null; stack?: string | null; repoUrl?: string | null;
}): Promise<PortfolioPushResult> {
  return postJson<PortfolioPushResult>("/api/portfolio/push", {
    ...project,
    githubToken: getIntegrationSettings().portfolioGithubToken,
    providerSettings: providerSettings(),
  });
}
