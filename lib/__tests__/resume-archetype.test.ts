import { describe, it, expect } from "vitest";
import type { Profile } from "../profile";
import type { Application } from "../store";
import {
  detectResumeArchetype, withArchetypeSequence, RESUME_SPECS, RESUME_ARCHETYPE_LABELS, ResumeArchetype,
  isMbbConsulting, parseYearsOfExperience, resolveMaxPages,
  resolveTargetArchetypeKey, resolveConfiguredYearsOfExperience, resolveConfiguredMaxPages,
} from "../resume-archetype";
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

  it("consulting uses the fixed one-page structure: summary, combined selectedImpact (Key Projects & Impact), experience, skills, education LAST", () => {
    expect(RESUME_SPECS.consulting.summaryAllowed).toBe(true);
    expect(RESUME_SPECS.consulting.includeKeyWins).toBe(true);
    expect(RESUME_SPECS.consulting.sectionSequence).toEqual([
      "summary", "selectedImpact", "experience", "skills", "education",
    ]);
  });

  it("consulting places education LAST and skills before education", () => {
    const seq = RESUME_SPECS.consulting.sectionSequence;
    expect(seq.indexOf("skills")).toBeLessThan(seq.indexOf("education"));
    expect(seq.indexOf("education")).toBe(seq.length - 1);
  });

  it("consulting's selectedImpact band sits immediately after summary, before experience", () => {
    const seq = RESUME_SPECS.consulting.sectionSequence;
    expect(seq.indexOf("selectedImpact")).toBe(seq.indexOf("summary") + 1);
    expect(seq.indexOf("selectedImpact")).toBeLessThan(seq.indexOf("experience"));
  });

  it("consulting never places keyWins/projects/certifications as standalone sections (combined or omitted)", () => {
    const seq = RESUME_SPECS.consulting.sectionSequence;
    expect(seq).not.toContain("keyWins");
    expect(seq).not.toContain("projects");
    expect(seq).toContain("selectedImpact"); // Key Wins + Projects render together under this one key
    expect(seq).not.toContain("certifications");
    expect(RESUME_SPECS.consulting.omittedSections).toContain("certifications");
    expect(RESUME_SPECS.consulting.certificationPolicy.toLowerCase()).toContain("omit");
  });

  it("consulting omits leadership entirely — not affordable within the fixed one-page budget", () => {
    expect(RESUME_SPECS.consulting.sectionSequence).not.toContain("leadership");
    expect(RESUME_SPECS.consulting.omittedSections).toContain("leadership");
    expect(RESUME_SPECS.consulting.mandatorySections).not.toContain("leadership");
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

  it("every archetype has research-grounded screener/impact/language guidance filled in", () => {
    for (const key of Object.keys(RESUME_SPECS) as ResumeArchetype[]) {
      const spec = RESUME_SPECS[key];
      expect(spec.whatScreenersWant.length, `${key} missing whatScreenersWant`).toBeGreaterThan(20);
      expect(spec.quantifiedImpactMeaning.length, `${key} missing quantifiedImpactMeaning`).toBeGreaterThan(20);
      expect(spec.languageConventions.length, `${key} missing languageConventions`).toBeGreaterThan(20);
    }
  });

  it("every mandatory section is actually in that archetype's sectionSequence", () => {
    for (const key of Object.keys(RESUME_SPECS) as ResumeArchetype[]) {
      const spec = RESUME_SPECS[key];
      for (const mandatory of spec.mandatorySections) {
        expect(spec.sectionSequence, `${key}: mandatory "${mandatory}" not in sectionSequence`).toContain(mandatory);
      }
    }
  });

  it("no omitted section ever appears in that archetype's sectionSequence", () => {
    for (const key of Object.keys(RESUME_SPECS) as ResumeArchetype[]) {
      const spec = RESUME_SPECS[key];
      for (const omitted of spec.omittedSections) {
        expect(spec.sectionSequence, `${key}: omitted "${omitted}" found in sectionSequence`).not.toContain(omitted);
      }
    }
  });

  it("no section is both mandatory and omitted for the same archetype", () => {
    for (const key of Object.keys(RESUME_SPECS) as ResumeArchetype[]) {
      const spec = RESUME_SPECS[key];
      const overlap = spec.mandatorySections.filter(s => (spec.omittedSections as string[]).includes(s));
      expect(overlap, `${key} has contradictory mandatory+omitted sections`).toEqual([]);
    }
  });

  it("finance_ib and vc_investing both ban a summary; only finance_ib also bans projects/leadership", () => {
    expect(RESUME_SPECS.finance_ib.omittedSections).toEqual(expect.arrayContaining(["summary", "projects", "leadership"]));
    expect(RESUME_SPECS.vc_investing.omittedSections).toEqual(["summary", "certifications"]);
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

describe("maxPages on RESUME_SPECS", () => {
  it("every archetype declares a maxPages of 1 or 2, never more", () => {
    for (const key of Object.keys(RESUME_SPECS) as ResumeArchetype[]) {
      expect([1, 2]).toContain(RESUME_SPECS[key].maxPages);
    }
  });

  it("consulting's base spec defaults to 2 (general consulting) — MBB narrows it via resolveMaxPages", () => {
    expect(RESUME_SPECS.consulting.maxPages).toBe(2);
  });

  it("product, ai_ml_engineering, and finance_ib allow 2 pages; vc_investing and general stay at 1", () => {
    expect(RESUME_SPECS.product.maxPages).toBe(2);
    expect(RESUME_SPECS.ai_ml_engineering.maxPages).toBe(2);
    expect(RESUME_SPECS.finance_ib.maxPages).toBe(2);
    expect(RESUME_SPECS.vc_investing.maxPages).toBe(1);
    expect(RESUME_SPECS.general.maxPages).toBe(1);
  });
});

describe("isMbbConsulting", () => {
  it("detects McKinsey, Bain, and BCG by company name", () => {
    expect(isMbbConsulting(baseApp({ company: "McKinsey & Company" }))).toBe(true);
    expect(isMbbConsulting(baseApp({ company: "Bain & Company" }))).toBe(true);
    expect(isMbbConsulting(baseApp({ company: "BCG" }))).toBe(true);
    expect(isMbbConsulting(baseApp({ company: "Boston Consulting Group" }))).toBe(true);
  });

  it("does not flag general/Big-4/MNC advisory consulting as MBB", () => {
    expect(isMbbConsulting(baseApp({ company: "Accenture", role: "Management Consultant" }))).toBe(false);
    expect(isMbbConsulting(baseApp({ company: "Deloitte", role: "Strategy Consultant" }))).toBe(false);
    expect(isMbbConsulting(baseApp({ company: "Acme Advisory" }))).toBe(false);
  });
});

describe("parseYearsOfExperience", () => {
  it("parses the digits out of free-text values (same convention as automation-service.ts elsewhere in this codebase)", () => {
    expect(parseYearsOfExperience(baseProfile({ yearsOfExperience: "7+" }))).toBe(7);
    expect(parseYearsOfExperience(baseProfile({ yearsOfExperience: "12" }))).toBe(12);
    expect(parseYearsOfExperience(baseProfile({ yearsOfExperience: "9 years" }))).toBe(9);
  });

  it("defaults to 0 when blank or unparseable", () => {
    expect(parseYearsOfExperience(baseProfile({ yearsOfExperience: "" }))).toBe(0);
    expect(parseYearsOfExperience(baseProfile({ yearsOfExperience: "several" }))).toBe(0);
  });
});

describe("resolveMaxPages", () => {
  it("forces 1 page under 5 years of experience, regardless of archetype", () => {
    const profile = baseProfile({ yearsOfExperience: "3" });
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "product")).toBe(1);
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "finance_ib")).toBe(1);
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "ai_ml_engineering")).toBe(1);
  });

  it("allows 2 pages at 5+ years for product, ai_ml_engineering, and finance_ib", () => {
    const profile = baseProfile({ yearsOfExperience: "8" });
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "product")).toBe(2);
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "ai_ml_engineering")).toBe(2);
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "finance_ib")).toBe(2);
  });

  it("keeps vc_investing and general at 1 page even at 5+ years", () => {
    const profile = baseProfile({ yearsOfExperience: "10" });
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "vc_investing")).toBe(1);
    expect(resolveMaxPages(profile, baseApp({ company: "Acme" }), "general")).toBe(1);
  });

  it("caps MBB consulting at 1 page even at 15+ years", () => {
    const profile = baseProfile({ yearsOfExperience: "15" });
    const app = baseApp({ company: "McKinsey & Company" });
    expect(resolveMaxPages(profile, app, "consulting")).toBe(1);
  });

  it("allows 2 pages for general consulting at 5+ years — consulting defaults to general, not MBB", () => {
    const profile = baseProfile({ yearsOfExperience: "10" });
    const app = baseApp({ company: "Accenture", role: "Management Consultant" });
    expect(resolveMaxPages(profile, app, "consulting")).toBe(2);
  });

  it("defaults an ambiguous consulting target (no named firm) to general, i.e. 2 pages at 5+ years", () => {
    const profile = baseProfile({ yearsOfExperience: "9", roleType: "strategy-consulting" });
    const app = baseApp({ role: "Generalist Consultant", company: "Some Boutique" });
    expect(resolveMaxPages(profile, app, "consulting")).toBe(2);
  });
});

describe("resolveTargetArchetypeKey — the spec's finer-grained target taxonomy", () => {
  it("maps MBB consulting to consulting_mbb and general consulting to consulting_senior", () => {
    expect(resolveTargetArchetypeKey(baseApp({ company: "Bain & Company" }), "consulting")).toBe("consulting_mbb");
    expect(resolveTargetArchetypeKey(baseApp({ company: "Accenture" }), "consulting")).toBe("consulting_senior");
  });

  it("maps vc_investing directly", () => {
    expect(resolveTargetArchetypeKey(baseApp({}), "vc_investing")).toBe("vc_investing");
  });

  it("maps product/ai_ml_engineering to ai_product by default", () => {
    expect(resolveTargetArchetypeKey(baseApp({ role: "Product Manager" }), "product")).toBe("ai_product");
    expect(resolveTargetArchetypeKey(baseApp({ role: "ML Engineer" }), "ai_ml_engineering")).toBe("ai_product");
  });

  it("detects a startup/founder signal and prefers it over ai_product", () => {
    expect(resolveTargetArchetypeKey(baseApp({ role: "Founding Engineer at a startup" }), "product")).toBe("startup");
  });

  it("detects a chief-of-staff signal ahead of any other mapping", () => {
    expect(resolveTargetArchetypeKey(baseApp({ role: "Chief of Staff" }), "general")).toBe("chief_of_staff");
    expect(resolveTargetArchetypeKey(baseApp({ role: "Chief of Staff" }), "consulting")).toBe("chief_of_staff");
  });

  it("returns undefined for archetypes/situations the spec's taxonomy doesn't name", () => {
    expect(resolveTargetArchetypeKey(baseApp({ role: "Investment Banking Analyst" }), "finance_ib")).toBeUndefined();
    expect(resolveTargetArchetypeKey(baseApp({ role: "Something Unrelated" }), "general")).toBeUndefined();
  });
});

describe("resolveConfiguredYearsOfExperience — years flex by target, not a fixed profile field", () => {
  it("overrides the profile's own years for a mapped target archetype", () => {
    const profile = baseProfile({ yearsOfExperience: "5" });
    expect(resolveConfiguredYearsOfExperience(profile, baseApp({ company: "Bain & Company" }), "consulting")).toBe("10+");
    expect(resolveConfiguredYearsOfExperience(profile, baseApp({ company: "Accenture" }), "consulting")).toBe("10+");
    expect(resolveConfiguredYearsOfExperience(profile, baseApp({ role: "Product Manager" }), "product")).toBe("8");
    expect(resolveConfiguredYearsOfExperience(profile, baseApp({}), "vc_investing")).toBe("10+");
  });

  it("falls back to the profile's own value when no target mapping applies", () => {
    const profile = baseProfile({ yearsOfExperience: "5" });
    expect(resolveConfiguredYearsOfExperience(profile, baseApp({ role: "IB Analyst" }), "finance_ib")).toBe("5");
  });
});

describe("resolveConfiguredMaxPages — config wins over the generic engine default (spec Part 0)", () => {
  it("uses the configured value for a mapped target archetype, regardless of years of experience", () => {
    const profile = baseProfile({ yearsOfExperience: "15" });
    // ai_product is configured to 1 page even at high seniority — this
    // deliberately overrides the generic engine's product/5+-years=2 rule.
    expect(resolveConfiguredMaxPages(profile, baseApp({ role: "Product Manager" }), "product")).toBe(1);
  });

  it("matches the generic engine default when the configured value agrees with it", () => {
    const profile = baseProfile({ yearsOfExperience: "10" });
    expect(resolveConfiguredMaxPages(profile, baseApp({ company: "Bain & Company" }), "consulting")).toBe(1);
    expect(resolveConfiguredMaxPages(profile, baseApp({ company: "Accenture" }), "consulting")).toBe(2);
  });

  it("falls back to the generic engine when no target mapping applies", () => {
    const profile = baseProfile({ yearsOfExperience: "3" });
    expect(resolveConfiguredMaxPages(profile, baseApp({ role: "IB Analyst" }), "finance_ib")).toBe(1);
  });
});
