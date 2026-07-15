import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import { profileExtractionPrompt, profileQuestionsPrompt, bulletRewritePrompt } from "../prompts";

const MOCK_PROFILE: Profile = {
  name: "Alex Chen",
  headline: "AI Product Manager",
  email: "alex@example.com",
  phone: "+1 555 0100",
  location: "San Francisco, CA",
  locationsOpenTo: "Remote",
  yearsOfExperience: "7",
  experience: [
    {
      id: "e1", company: "Acme AI", role: "Senior PM", tenure: "2021 - Present",
      location: "San Francisco, CA", current: true,
      bullets: "Managed the product roadmap\nWorked with engineering on launches",
    },
  ],
  education: [{ id: "ed1", institution: "MIT", degree: "B.S.", field: "Computer Science", years: "2014 - 2018" }],
  skills: { Product: "Roadmapping, A/B testing" },
  projects: [],
  publications: [],
  certifications: [],
  voiceNotes: "No em dashes. Never say 'synergies'.",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("profileExtractionPrompt", () => {
  it("includes the candidate profile and the text to extract from", () => {
    const output = profileExtractionPrompt("I worked at Acme AI leading a team of 5.", MOCK_PROFILE);
    expect(output).toContain("Alex Chen");
    expect(output).toContain("I worked at Acme AI leading a team of 5.");
    expect(output).toContain("Acme AI");
  });

  it("includes anti-hallucination rules and the JSON output contract", () => {
    const output = profileExtractionPrompt("Some freeform text about my career.", MOCK_PROFILE);
    expect(output).toContain("NEVER invent facts");
    expect(output).toContain('"experience"');
    expect(output).toContain('"skills"');
  });

  it("switches to delta-only framing when diffAgainstText is provided", () => {
    const output = profileExtractionPrompt("New edited text.", MOCK_PROFILE, "Old baseline text.");
    expect(output).toContain("PREVIOUS VERSION OF THE TEXT");
    expect(output).toContain("Old baseline text.");
    expect(output).toContain("extract ONLY details that are new");
  });

  it("does not switch to delta framing when diffAgainstText is omitted", () => {
    const output = profileExtractionPrompt("Some text.", MOCK_PROFILE);
    expect(output).not.toContain("PREVIOUS VERSION OF THE TEXT");
  });
});

describe("profileQuestionsPrompt", () => {
  it("instructs targeting the weakest/most generic bullets", () => {
    const output = profileQuestionsPrompt(MOCK_PROFILE);
    expect(output).toContain("weakest");
    expect(output).toContain("generic");
    expect(output).toContain("Alex Chen");
  });

  it("includes previously-asked questions to avoid repeats", () => {
    const output = profileQuestionsPrompt(MOCK_PROFILE, ["How big was the team?"]);
    expect(output).toContain("Do NOT repeat");
    expect(output).toContain("How big was the team?");
  });

  it("omits the exclude block when no prior questions exist", () => {
    const output = profileQuestionsPrompt(MOCK_PROFILE, []);
    expect(output).not.toContain("Do NOT repeat");
  });
});

describe("bulletRewritePrompt", () => {
  it("includes the target, current bullet, question, and answer verbatim", () => {
    const output = bulletRewritePrompt(
      MOCK_PROFILE,
      "Acme AI — roadmap bullet",
      "Managed the product roadmap",
      "How many people relied on this roadmap?",
      "About 40 engineers across 5 teams.",
    );
    expect(output).toContain("Acme AI — roadmap bullet");
    expect(output).toContain("Managed the product roadmap");
    expect(output).toContain("How many people relied on this roadmap?");
    expect(output).toContain("About 40 engineers across 5 teams.");
  });

  it("instructs falling back to the unchanged bullet when the answer has no usable fact", () => {
    const output = bulletRewritePrompt(MOCK_PROFILE, "X", "Current bullet", "Q?", "not sure");
    expect(output).toContain("return the CURRENT bullet unchanged");
  });
});
