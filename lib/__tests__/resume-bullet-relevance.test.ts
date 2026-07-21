import { describe, it, expect } from "vitest";
import { computeBulletRelevanceHints, renderRelevanceHintsBlock } from "../resume-bullet-relevance";
import type { Profile } from "../profile";
import type { Application } from "../store";

function baseProfile(): Profile {
  return {
    name: "Jordan Lee",
    headline: "",
    email: "jordan@example.com",
    phone: "",
    location: "",
    locationsOpenTo: "",
    yearsOfExperience: "7",
    experience: [
      {
        id: "e1",
        company: "Bain & Company",
        role: "Consultant",
        tenure: "2020 - Present",
        location: "",
        current: true,
        bullets: [
          "Delivered multi-plant capital program strategy for North American nuclear utility: built decision model for running successful capital programs, designed governance and contractor selection framework, delivered board-level recommendation for a multi-billion-dollar program",
          "Built and shipped integrated agentic AI platform: RAG-based document intelligence engine for contract and regulatory libraries, multi-agent automated workplan generator, AI financial and cost modeling engine, knowledge graph-linked schedule optimization platform, capital allocation opportunity trigger system. Stack: Python, LangChain, Streamlit.",
        ].join("\n"),
      },
    ],
    education: [],
    skills: {},
    projects: [],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  } as Profile;
}

function baseApp(): Application {
  return {
    id: "app1",
    slug: "mck-capital-excellence",
    company: "McKinsey",
    role: "Capital Excellence Consultant",
    location: "New York, NY",
    remote: false,
    status: "sourced",
    score: 0,
    bucket: "strategy",
    bucketName: "Strategy / Consulting",
    sector: "consulting",
    seniority: "senior",
    sourceUrl: "",
    capturedAt: "2025-01-01T00:00:00.000Z",
    jdRaw: "",
    jdParsed: {
      keyRequirements: ["capital project delivery", "cost and schedule optimization"],
      technicalSkills: [],
      softSkills: [],
      yearsExperienceRequired: null,
      redFlags: [],
      keywords: ["capital", "excellence", "capital allocation", "cost optimization", "schedule optimization", "operations"],
    },
    nextAction: "",
    contacts: [],
    interviews: [],
    reminders: [],
    resumeVersions: [],
    notes: "",
    emailEvents: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  } as Application;
}

describe("computeBulletRelevanceHints", () => {
  it("flags the AI-platform bullet as tool-building and the nuclear-program bullet as not", () => {
    const hints = computeBulletRelevanceHints(baseProfile(), baseApp());
    expect(hints).toHaveLength(2);
    const nuclear = hints.find(h => h.text.startsWith("Delivered multi-plant"))!;
    const aiPlatform = hints.find(h => h.text.startsWith("Built and shipped"))!;
    expect(nuclear.toolBuilding).toBe(false);
    expect(aiPlatform.toolBuilding).toBe(true);
  });

  it("confirms the real bug evidence: the tool-building bullet scores a higher raw keyword overlap than the direct-delivery bullet", () => {
    // This is the exact numerically-verified finding behind BUG 1: naive keyword
    // overlap alone ranks the wrong bullet higher, which is why the fix must be
    // an explicit anti-pattern instruction, not a keyword-overlap sort.
    const hints = computeBulletRelevanceHints(baseProfile(), baseApp());
    const nuclear = hints.find(h => h.text.startsWith("Delivered multi-plant"))!;
    const aiPlatform = hints.find(h => h.text.startsWith("Built and shipped"))!;
    expect(aiPlatform.keywordOverlap).toBeGreaterThan(nuclear.keywordOverlap);
  });
});

describe("renderRelevanceHintsBlock", () => {
  it("labels TOOL-BUILDING bullets and includes the anti-pattern instruction", () => {
    const block = renderRelevanceHintsBlock(computeBulletRelevanceHints(baseProfile(), baseApp()));
    expect(block).toContain("TOOL-BUILDING");
    expect(block).toContain("NOT a ranking");
    expect(block).toContain("outrank a TOOL-BUILDING bullet");
  });

  it("returns an empty string for no hints", () => {
    expect(renderRelevanceHintsBlock([])).toBe("");
  });
});
