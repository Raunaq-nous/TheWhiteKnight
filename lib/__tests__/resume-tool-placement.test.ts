import { describe, it, expect } from "vitest";
import { suppressSideBuilds, runToolPlacementGate, toolPlacementGateFailureMessage } from "../resume-tool-placement";
import type { ResumeContent } from "../resume-schema";

function baseContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Raunaq Rakesh",
    contactLine: "raunaq1509@gmail.com | +91-7982271861",
    summary: "",
    sectionOrder: "experience-first",
    experience: [
      {
        company: "Bain and Company", role: "Project Leader", tenure: "2025 - Present", location: "Gurgaon",
        bullets: [{ sourceBulletId: "b1", text: "Deployed a Portfolio and project intelligence cockpit for a client.", priority: 1 }],
      },
    ],
    education: [],
    skills: [],
    projects: [{ sourceBulletId: "p1", name: "CareerOS", description: "A personal AI job command center." }],
    ...overrides,
  } as ResumeContent;
}

describe("suppressSideBuilds", () => {
  it("suppresses projects for a target key not in sideBuildsAllowed (e.g. senior consulting)", () => {
    const content = baseContent();
    const result = suppressSideBuilds(content, "consulting_senior");
    expect(result.projects).toEqual([]);
  });

  it("suppresses projects for chief_of_staff, which is also not in sideBuildsAllowed", () => {
    const content = baseContent();
    const result = suppressSideBuilds(content, "chief_of_staff");
    expect(result.projects).toEqual([]);
  });

  it("keeps projects for a target key that IS in sideBuildsAllowed (ai_product, startup, vc_investing)", () => {
    const content = baseContent();
    expect(suppressSideBuilds(content, "ai_product").projects).toHaveLength(1);
    expect(suppressSideBuilds(content, "startup").projects).toHaveLength(1);
    expect(suppressSideBuilds(content, "vc_investing").projects).toHaveLength(1);
  });

  it("suppresses projects when no target key is resolved at all", () => {
    const content = baseContent();
    const result = suppressSideBuilds(content, undefined);
    expect(result.projects).toEqual([]);
  });

  it("is a no-op when there are no projects to begin with", () => {
    const content = baseContent({ projects: [] });
    const result = suppressSideBuilds(content, "consulting_senior");
    expect(result).toEqual(content);
  });

  it("does not mutate the input content", () => {
    const content = baseContent();
    const snapshot = JSON.stringify(content);
    suppressSideBuilds(content, "consulting_senior");
    expect(JSON.stringify(content)).toBe(snapshot);
  });
});

describe("runToolPlacementGate", () => {
  it("passes when a named build appears only under its configured employer", () => {
    const result = runToolPlacementGate(baseContent());
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("fails when a named build appears under the WRONG employer", () => {
    const content = baseContent({
      experience: [{
        company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "Mumbai",
        bullets: [{ sourceBulletId: "b1", text: "Deployed a Portfolio and project intelligence cockpit for a client.", priority: 1 }],
      }],
    });
    const result = runToolPlacementGate(content);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { tool: "Portfolio and project intelligence cockpit", expectedEmployer: "Bain and Company", foundUnder: "Aranca" },
    ]);
  });

  it("matches the employer loosely — '&' vs 'and', case-insensitive", () => {
    const content = baseContent({
      experience: [{
        company: "BAIN & COMPANY", role: "Project Leader", tenure: "2025 - Present", location: "",
        bullets: [{ sourceBulletId: "b1", text: "Deployed a Portfolio and project intelligence cockpit for a client.", priority: 1 }],
      }],
    });
    expect(runToolPlacementGate(content).ok).toBe(true);
  });

  it("does not flag a build name that never appears anywhere", () => {
    const content = baseContent({
      experience: [{ company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "Mumbai", bullets: [{ sourceBulletId: "b1", text: "Led a Series A financial model for a client.", priority: 1 }] }],
    });
    expect(runToolPlacementGate(content).ok).toBe(true);
  });

  it("never flags an unlisted/unnamed build — this is a hard-coded correction list, not a classifier", () => {
    const content = baseContent({
      experience: [{ company: "Some Other Firm", role: "Consultant", tenure: "2020", location: "", bullets: [{ sourceBulletId: "b1", text: "Built a brand-new internal tool nobody has named in the config.", priority: 1 }] }],
    });
    expect(runToolPlacementGate(content).ok).toBe(true);
  });

  it("collects every mismatch, not just the first", () => {
    const content = baseContent({
      experience: [{
        company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "Mumbai",
        bullets: [
          { sourceBulletId: "b1", text: "Deployed a Portfolio and project intelligence cockpit for a client.", priority: 1 },
          { sourceBulletId: "b2", text: "Built the Capital Projects Intelligence Toolkit for a client.", priority: 2 },
        ],
      }],
    });
    const result = runToolPlacementGate(content);
    expect(result.violations).toHaveLength(2);
  });
});

describe("toolPlacementGateFailureMessage", () => {
  it("names the tool, its expected employer, and where it was actually found", () => {
    const content = baseContent({
      experience: [{ company: "Aranca", role: "Engagement Lead", tenure: "2022 - 2025", location: "Mumbai", bullets: [{ sourceBulletId: "b1", text: "Deployed a Portfolio and project intelligence cockpit for a client.", priority: 1 }] }],
    });
    const msg = toolPlacementGateFailureMessage(runToolPlacementGate(content));
    expect(msg).toContain("TOOL PLACEMENT GATE FAILED");
    expect(msg).toContain("Portfolio and project intelligence cockpit");
    expect(msg).toContain("Bain and Company");
    expect(msg).toContain("Aranca");
  });
});
