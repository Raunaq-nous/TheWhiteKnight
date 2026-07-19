/**
 * Level-2 (per-job) tailoring demonstration: two roles that land in the SAME
 * archetype (consulting) must still drive genuinely different resume
 * generation, because the prompt's Step 1 extracts a role-specific
 * "sub-focus" from the JD's own language before deciding what to foreground.
 *
 * This can't unit-test the LLM's actual output (that requires hitting the
 * real API), but it deterministically proves the mechanism that makes
 * differentiation possible: same archetype selected for both, genuinely
 * different prompt text produced for each (carrying each JD's own
 * requirements/keywords into the instructions the model receives), and both
 * prompts still require the same sub-focus-extraction step so the model is
 * pushed toward a different answer for each.
 */
import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import type { Application } from "../store";
import { detectResumeArchetype } from "../resume-archetype";
import { resumePrompt } from "../prompts";

function baseProfile(): Profile {
  return {
    name: "Jordan Lee",
    headline: "Strategy consultant",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "New York, NY",
    locationsOpenTo: "Remote",
    yearsOfExperience: "7",
    experience: [
      {
        id: "e1", company: "Bain & Company", role: "Consultant", tenure: "2020 - Present",
        location: "New York, NY", current: true,
        bullets: "Led capital project schedule review for a $2B energy client, cutting delay risk by 15%\nRedesigned procurement process for a manufacturing client, cutting operating cost by $8M annually\nBuilt an executive dashboard tracking capital program spend across 6 workstreams",
      },
    ],
    education: [{ id: "ed1", institution: "State University", degree: "B.A.", field: "Economics", years: "2013 - 2017" }],
    skills: { Analytical: "Financial modeling, Excel, PowerPoint" },
    projects: [],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function baseApp(overrides: Partial<Application>): Application {
  return {
    id: "a1", slug: "test-app", company: "McKinsey & Company", location: "New York, NY",
    remote: false, status: "sourced", score: 0, bucket: "", sector: "consulting", seniority: "mid",
    sourceUrl: "", capturedAt: "2025-01-01", jdRaw: "", jdParsed: {},
    nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [],
    notes: "", emailEvents: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    role: "Consultant",
    ...overrides,
  };
}

const CAPITAL_EXCELLENCE_APP = baseApp({
  role: "Capital Excellence Consultant",
  jdRaw: "Join our Capital Excellence practice, helping clients deliver capital projects on time and on budget through rigorous cost and schedule optimization.",
  jdParsed: {
    keyRequirements: ["Capital project delivery experience", "Cost and schedule optimization", "Capital allocation frameworks"],
    technicalSkills: ["Cost estimation", "Schedule risk analysis"],
    keywords: ["capital excellence", "capital projects", "cost optimization", "schedule optimization"],
  },
});

const PERFORMANCE_IMPROVEMENT_APP = baseApp({
  role: "Performance Improvement Consultant",
  jdRaw: "Join our Performance Improvement practice, driving operational turnarounds and structural cost reduction for underperforming business units.",
  jdParsed: {
    keyRequirements: ["Operational turnaround experience", "Structural cost reduction", "Process redesign"],
    technicalSkills: ["Process mapping", "Lean/Six Sigma"],
    keywords: ["performance improvement", "operational turnaround", "cost reduction", "process redesign"],
  },
});

describe("Level 2: same archetype, different JD sub-focus", () => {
  const profile = baseProfile();

  it("both roles resolve to the SAME archetype (Level 1 does not differ)", () => {
    expect(detectResumeArchetype(profile, CAPITAL_EXCELLENCE_APP)).toBe("consulting");
    expect(detectResumeArchetype(profile, PERFORMANCE_IMPROVEMENT_APP)).toBe("consulting");
  });

  it("produces genuinely different prompt text for the two roles", () => {
    const promptA = resumePrompt(profile, CAPITAL_EXCELLENCE_APP, "consulting");
    const promptB = resumePrompt(profile, PERFORMANCE_IMPROVEMENT_APP, "consulting");
    expect(promptA).not.toBe(promptB);
  });

  it("each prompt carries its OWN role's specific requirements/keywords, not the other's", () => {
    const promptA = resumePrompt(profile, CAPITAL_EXCELLENCE_APP, "consulting");
    const promptB = resumePrompt(profile, PERFORMANCE_IMPROVEMENT_APP, "consulting");

    expect(promptA).toContain("Capital Excellence Consultant");
    expect(promptA).toContain("Cost and schedule optimization");
    expect(promptA).toContain("capital excellence");

    expect(promptB).toContain("Performance Improvement Consultant");
    expect(promptB).toContain("Structural cost reduction");
    expect(promptB).toContain("operational turnaround");

    // Cross-contamination check: A's prompt should not carry B's specific
    // JD requirements, and vice versa. (Both prompts legitimately mention
    // "Capital Excellence"/"operational turnaround" once each, as the
    // worked example inside the fixed Step 1 instruction text — that's
    // shared template text, not JD-specific data, so it's excluded here.)
    expect(promptA).not.toContain("Structural cost reduction");
    expect(promptA).not.toContain("Performance Improvement Consultant");
    expect(promptB).not.toContain("Cost and schedule optimization");
    expect(promptB).not.toContain("Capital Excellence Consultant");
  });

  it("both prompts still require the same sub-focus-extraction mechanism (the lever that produces different output)", () => {
    const promptA = resumePrompt(profile, CAPITAL_EXCELLENCE_APP, "consulting");
    const promptB = resumePrompt(profile, PERFORMANCE_IMPROVEMENT_APP, "consulting");

    for (const prompt of [promptA, promptB]) {
      expect(prompt).toContain("SUB-FOCUS");
      expect(prompt).toContain("SPECIFIC sub-focus or practice area of THIS role beyond the generic archetype");
      expect(prompt).toContain("Capital Excellence"); // the worked example is quoted verbatim in the instruction itself
      expect(prompt).toContain('"subFocus"');
    }
  });

  it("both prompts instruct selecting/foregrounding by sub-focus rather than a generic priority list", () => {
    const promptA = resumePrompt(profile, CAPITAL_EXCELLENCE_APP, "consulting");
    expect(promptA).toContain("using the sub-focus (not the generic archetype) as the lens");
    expect(promptA).toContain("Rank bullets by relevance to the SUB-FOCUS");
  });
});
