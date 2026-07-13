import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import type { Application } from "../store";
import { detectResumeArchetype, RESUME_SPECS, RESUME_ARCHETYPE_LABELS, ResumeArchetype } from "../resume-archetype";

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee",
    headline: "",
    email: "jordan@example.com",
    phone: "",
    location: "",
    locationsOpenTo: "",
    yearsOfExperience: "5",
    experience: [],
    education: [],
    skills: {},
    projects: [],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    slug: "test-app",
    company: "Acme",
    role: "Analyst",
    location: "Remote",
    remote: true,
    status: "sourced",
    score: 0,
    bucket: "",
    sector: "",
    seniority: "mid",
    sourceUrl: "",
    capturedAt: "2025-01-01",
    jdRaw: "",
    jdParsed: { keyRequirements: [] },
    nextAction: "",
    contacts: [],
    interviews: [],
    reminders: [],
    resumeVersions: [],
    notes: "",
    emailEvents: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RESUME_SPECS", () => {
  it("has a spec for every archetype with all required fields populated", () => {
    const archetypes = Object.keys(RESUME_ARCHETYPE_LABELS) as ResumeArchetype[];
    for (const key of archetypes) {
      const spec = RESUME_SPECS[key];
      expect(spec, `missing spec for ${key}`).toBeDefined();
      expect(spec.sectionOrder).toMatch(/^(education-first|experience-first)$/);
      expect(spec.bulletPattern.length).toBeGreaterThan(0);
      expect(spec.emphasize.length).toBeGreaterThan(0);
      expect(spec.certificationPolicy.length).toBeGreaterThan(0);
    }
  });

  it("consulting and finance_ib require education-first, no summary", () => {
    expect(RESUME_SPECS.consulting.sectionOrder).toBe("education-first");
    expect(RESUME_SPECS.consulting.summaryAllowed).toBe(false);
    expect(RESUME_SPECS.finance_ib.sectionOrder).toBe("education-first");
    expect(RESUME_SPECS.finance_ib.summaryAllowed).toBe(false);
  });

  it("product and ai_ml_engineering are experience-first", () => {
    expect(RESUME_SPECS.product.sectionOrder).toBe("experience-first");
    expect(RESUME_SPECS.ai_ml_engineering.sectionOrder).toBe("experience-first");
  });
});

describe("detectResumeArchetype", () => {
  it("an explicit override always wins", () => {
    const profile = baseProfile({ roleType: "product" });
    const app = baseApp({ role: "Venture Capital Associate", company: "Acme Ventures" });
    expect(detectResumeArchetype(profile, app, "finance_ib")).toBe("finance_ib");
  });

  it("detects VC/investing from role + company keywords", () => {
    const profile = baseProfile();
    const app = baseApp({ role: "Venture Capital Associate", company: "Acme Ventures" });
    expect(detectResumeArchetype(profile, app)).toBe("vc_investing");
  });

  it("detects investment banking from role keywords", () => {
    const profile = baseProfile();
    const app = baseApp({ role: "Investment Banking Analyst", company: "Big Bank" });
    expect(detectResumeArchetype(profile, app)).toBe("finance_ib");
  });

  it("detects consulting from company name", () => {
    const profile = baseProfile();
    const app = baseApp({ role: "Associate", company: "McKinsey & Company" });
    expect(detectResumeArchetype(profile, app)).toBe("consulting");
  });

  it("detects product management from role title", () => {
    const profile = baseProfile();
    const app = baseApp({ role: "Senior Product Manager", company: "Acme" });
    expect(detectResumeArchetype(profile, app)).toBe("product");
  });

  it("detects AI/ML/engineering from role title", () => {
    const profile = baseProfile();
    const app = baseApp({ role: "Machine Learning Engineer", company: "Acme AI" });
    expect(detectResumeArchetype(profile, app)).toBe("ai_ml_engineering");
  });

  it("falls back to profile.roleType when the JD has no keyword match", () => {
    const profile = baseProfile({ roleType: "strategy-consulting" });
    const app = baseApp({ role: "Generalist Role", company: "Some Company" });
    expect(detectResumeArchetype(profile, app)).toBe("consulting");
  });

  it("falls back to general when nothing matches", () => {
    const profile = baseProfile({ roleType: "creative" });
    const app = baseApp({ role: "Something Unrelated", company: "Some Company" });
    expect(detectResumeArchetype(profile, app)).toBe("general");
  });
});
