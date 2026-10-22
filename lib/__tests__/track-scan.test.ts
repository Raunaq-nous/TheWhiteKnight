/** P1-1: track-aware scanning. */
import { describe, it, expect } from "vitest";
import { trackScanPlan } from "../track-scan";
import { rankSources } from "../source-analytics";
import { CAREER_TRACKS, trackById } from "../career-tracks";

const targets = [
  { id: "openai", name: "OpenAI", region: ["global"], sector: "ai-emerging", ats: "ashby", atsTenant: "openai", careersUrl: "https://openai.com/careers", enabled: false },
  { id: "acme", name: "Acme", region: ["global"], sector: "industry", ats: "greenhouse", atsTenant: "acme", careersUrl: "https://acme.com", enabled: true },
] as any;

describe("track-aware scanning", () => {
  it("loads the four tracks from config with seeded pathways", () => {
    expect(CAREER_TRACKS.map(t => t.id)).toEqual(["consulting_strategy", "ai_deployment_strategy", "forward_deployed_engineer", "venture_capital"]);
    for (const t of CAREER_TRACKS) {
      expect(t.titles.length).toBeGreaterThan(0);
      expect(t.pathways.length).toBeGreaterThan(0);
    }
    expect(trackById("forward_deployed_engineer")?.resumeArchetype).toBe("ai_ml_engineering");
  });

  it("no active track leaves the scan unchanged", () => {
    const base = { query: "strategy manager", roleKeywords: ["strategy"], companies: targets };
    expect(trackScanPlan(base, [])).toMatchObject({ query: "strategy manager", roleKeywords: ["strategy"], companies: targets, tracks: [] });
  });

  it("an active track adds its titles and keywords, and brings its target companies into the scan", () => {
    const plan = trackScanPlan({ query: "strategy manager", roleKeywords: [], companies: targets }, ["ai_deployment_strategy"]);
    expect(plan.query).toContain("Deployment Strategist");
    expect(plan.roleKeywords).toContain("ai transformation");
    expect(plan.companies.find((c: any) => c.id === "openai")!.enabled).toBe(true);
    expect(plan.companies.find((c: any) => c.id === "acme")!.enabled).toBe(true);
    expect(plan.preferredCategories[0]).toBe("company-direct");
  });

  it("unknown track ids are ignored", () => {
    expect(trackScanPlan({ query: "q", roleKeywords: [], companies: [] }, ["nope"]).tracks).toEqual([]);
  });

  it("a track's preferred source categories order equally ranked sources", () => {
    // Without preferences: company-direct, then Google Jobs, then alert email.
    expect(rankSources([], ["alert-email", "serpapi"])).toEqual(["serpapi", "alert-email"]);
    // Expected interview rates differ, so preferences only break exact ties:
    expect(rankSources([], ["lever", "greenhouse"], ["company-direct"])).toEqual(["lever", "greenhouse"]);
  });
});
