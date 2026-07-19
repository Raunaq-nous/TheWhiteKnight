import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import type { Application } from "../store";
import { detectResumeArchetype, withArchetypeSequence, RESUME_SPECS, RESUME_ARCHETYPE_LABELS, ResumeArchetype } from "../resume-archetype";
import type { ResumeContent } from "../resume-schema";

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

  it("finance_ib and vc_investing stay education-first with no summary", () => {
    expect(RESUME_SPECS.finance_ib.sectionOrder).toBe("education-first");
    expect(RESUME_SPECS.finance_ib.summaryAllowed).toBe(false);
    expect(RESUME_SPECS.vc_investing.sectionOrder).toBe("education-first");
    expect(RESUME_SPECS.vc_investing.summaryAllowed).toBe(false);
  });

  it("consulting uses the founder-directed structure: summary, key wins, projects, experience, education, skills", () => {
    expect(RESUME_SPECS.consulting.summaryAllowed).toBe(true);
    expect(RESUME_SPECS.consulting.includeKeyWins).toBe(true);
    expect(RESUME_SPECS.consulting.sectionSequence).toEqual([
      "summary", "keyWins", "projects", "experience", "education", "skills", "certifications",
    ]);
  });

  it("only consulting includes a Key Wins band", () => {
    const withKeyWins = (Object.keys(RESUME_SPECS) as ResumeArchetype[]).filter(k => RESUME_SPECS[k].includeKeyWins);
    expect(withKeyWins).toEqual(["consulting"]);
  });

  it("every spec has a non-empty sectionSequence covering the core sections", () => {
    for (const key of Object.keys(RESUME_SPECS) as ResumeArchetype[]) {
      const seq = RESUME_SPECS[key].sectionSequence;
      expect(seq.length, `empty sequence for ${key}`).toBeGreaterThan(0);
      for (const core of ["experience", "education", "skills"] as const) {
        expect(seq, `${key} sequence missing ${core}`).toContain(core);
      }
    }
  });

  it("product and ai_ml_engineering are experience-first", () => {
    expect(RESUME_SPECS.product.sectionOrder).toBe("experience-first");
    expect(RESUME_SPECS.ai_ml_engineering.sectionOrder).toBe("experience-first");
  });
});

describe("withArchetypeSequence", () => {
  const content: ResumeContent = {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100 | Remote",
    summary: "",
    sectionOrder: "experience-first",
    experience: [],
    education: [],
    skills: [],
  };

  it("stamps the archetype's sequence onto the content", () => {
    const stamped = withArchetypeSequence(content, "consulting");
    expect(stamped.sectionSequence).toEqual(RESUME_SPECS.consulting.sectionSequence);
  });

  it("overrides any model-supplied sequence and does not mutate the input", () => {
    const withBogus = { ...content, sectionSequence: ["skills"] as ResumeContent["sectionSequence"] };
    const stamped = withArchetypeSequence(withBogus, "finance_ib");
    expect(stamped.sectionSequence).toEqual(RESUME_SPECS.finance_ib.sectionSequence);
    expect(withBogus.sectionSequence).toEqual(["skills"]);
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
