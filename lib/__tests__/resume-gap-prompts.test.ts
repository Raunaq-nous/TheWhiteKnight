import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import type { Application } from "../store";
import { resumeGapQuestionsPrompt, resumeGapAnswerPrompt } from "../prompts";

const MOCK_PROFILE: Profile = {
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
      location: "New York, NY", current: true, bullets: "Led capital project reviews",
    },
  ],
  education: [{ id: "ed1", institution: "State University", degree: "B.A.", field: "Economics", years: "2013 - 2017" }],
  skills: { Analytical: "Excel, PowerPoint" },
  projects: [],
  publications: [],
  certifications: [],
  voiceNotes: "",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const MOCK_APP: Application = {
  id: "a1", slug: "test-app", company: "McKinsey & Company", role: "Capital Excellence Consultant",
  location: "New York, NY", remote: false, status: "sourced", score: 0, bucket: "", sector: "consulting",
  seniority: "mid", sourceUrl: "", capturedAt: "2025-01-01",
  jdRaw: "Deliver capital projects on time and on budget.",
  jdParsed: { keyRequirements: ["Cost and schedule optimization"], keywords: ["capital excellence"] },
  nextAction: "", contacts: [], interviews: [], reminders: [], resumeVersions: [],
  notes: "", emailEvents: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("resumeGapQuestionsPrompt", () => {
  it("includes the candidate, the JD, and the given target priorities/sub-focus", () => {
    const output = resumeGapQuestionsPrompt(MOCK_PROFILE, MOCK_APP, ["cost optimization", "capital delivery"], "Capital Excellence");
    expect(output).toContain("Jordan Lee");
    expect(output).toContain("McKinsey & Company");
    expect(output).toContain("cost optimization; capital delivery");
    expect(output).toContain("Capital Excellence");
  });

  it("instructs skipping already-well-evidenced priorities and asking only about genuine gaps", () => {
    const output = resumeGapQuestionsPrompt(MOCK_PROFILE, MOCK_APP, ["cost optimization"], "Capital Excellence");
    expect(output).toContain("already well evidenced");
    expect(output).toContain("existingEvidence");
    expect(output).toContain("never invent a new entry");
  });

  it("caps questions at the number of priorities (max 4) and requires the JSON output contract", () => {
    const output = resumeGapQuestionsPrompt(MOCK_PROFILE, MOCK_APP, ["a", "b"], null);
    expect(output).toContain("AT MOST 2 questions");
    expect(output).toContain('"targetType"');
    expect(output).toContain('"existingEvidence"');
  });

  it("falls back to inferring priorities/sub-focus from the JD when none are given", () => {
    const output = resumeGapQuestionsPrompt(MOCK_PROFILE, MOCK_APP, [], undefined);
    expect(output).toContain("infer");
  });
});

describe("resumeGapAnswerPrompt", () => {
  it("includes the target, priority, question, and answer verbatim", () => {
    const output = resumeGapAnswerPrompt(
      MOCK_PROFILE,
      "Bain & Company — Consultant",
      "cost optimization",
      "Do you have a project with a quantified cost saving?",
      "Yes, I cut costs by $8M on a manufacturing client.",
    );
    expect(output).toContain("Bain & Company — Consultant");
    expect(output).toContain("cost optimization");
    expect(output).toContain("Do you have a project with a quantified cost saving?");
    expect(output).toContain("Yes, I cut costs by $8M on a manufacturing client.");
  });

  it("instructs returning an empty string when the answer has no usable fact", () => {
    const output = resumeGapAnswerPrompt(MOCK_PROFILE, "X", "Y", "Q?", "not sure");
    expect(output).toContain("return an empty string");
  });

  it("bans inventing a fact not present in the answer", () => {
    const output = resumeGapAnswerPrompt(MOCK_PROFILE, "X", "Y", "Q?", "some answer");
    expect(output).toContain("NEVER invent a number");
  });
});
