/**
 * Regression tests: ResumeContentSchema's optional fields must tolerate an
 * explicit null (not just a missing key) — same "expected string, received
 * null" bug class as AFScoreResultSchema.archetype.secondary. Also confirms
 * normalizeResumeContent/resumeContentToMarkdown don't crash on null values.
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, normalizeResumeContent, resumeContentToMarkdown, resolveSectionSequence, ResumeContent } from "../resume-schema";

function baseResumeContent(): unknown {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100 | Remote",
    summary: "Five years shipping products.",
    sectionOrder: "experience-first",
    experience: [
      {
        company: "Acme",
        role: "PM",
        tenure: "2022 - Present",
        location: null,
        bullets: [{ text: "Shipped a thing", priority: 1 }],
      },
    ],
    education: [
      {
        institution: "State University",
        degree: "B.S.",
        field: null,
        years: "2014 - 2018",
        gpa: null,
        achievements: null,
      },
    ],
    skills: [{ category: "Core", items: ["SQL", "Python"] }],
    projects: null,
    certifications: null,
    leadership: null,
    links: null,
    keyWins: null,
    targetPriorities: null,
    sectionSequence: null,
  };
}

describe("ResumeContentSchema nullable optional fields", () => {
  it("accepts null for experience[].location", () => {
    const result = ResumeContentSchema.safeParse(baseResumeContent());
    expect(result.success).toBe(true);
  });

  it("accepts null for education[].field/gpa/achievements", () => {
    const result = ResumeContentSchema.safeParse(baseResumeContent());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.education[0].field).toBeNull();
      expect(result.data.education[0].gpa).toBeNull();
      expect(result.data.education[0].achievements).toBeNull();
    }
  });

  it("accepts null for top-level projects/certifications/leadership", () => {
    const result = ResumeContentSchema.safeParse(baseResumeContent());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projects).toBeNull();
      expect(result.data.certifications).toBeNull();
      expect(result.data.leadership).toBeNull();
    }
  });

  it("still accepts these fields omitted entirely", () => {
    const input = baseResumeContent() as any;
    delete input.projects;
    delete input.certifications;
    delete input.leadership;
    delete input.education[0].field;
    delete input.education[0].gpa;
    delete input.education[0].achievements;
    delete input.experience[0].location;
    const result = ResumeContentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("still accepts real values for these fields", () => {
    const input = baseResumeContent() as any;
    input.experience[0].location = "Remote";
    input.education[0].field = "Computer Science";
    input.education[0].gpa = "3.8";
    input.education[0].achievements = ["Dean's list"];
    input.projects = [{ name: "Side Project", description: "A thing I built" }];
    input.certifications = [{ name: "AWS Certified" }];
    input.leadership = ["Led the campus coding club"];
    const result = ResumeContentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("normalizeResumeContent and resumeContentToMarkdown don't crash on an all-null-optionals resume", () => {
    const parsed = ResumeContentSchema.parse(baseResumeContent()) as ResumeContent;
    expect(() => normalizeResumeContent(parsed)).not.toThrow();
    expect(() => resumeContentToMarkdown(parsed)).not.toThrow();
    const md = resumeContentToMarkdown(parsed);
    expect(md).toContain("Jordan Lee");
    expect(md).not.toContain("## Relevant Projects");
    expect(md).not.toContain("## Certifications");
    expect(md).not.toContain("## Leadership");
    expect(md).not.toContain("## Key Wins");
  });

  it("accepts real values for links/keyWins/targetPriorities/sectionSequence", () => {
    const input = baseResumeContent() as any;
    input.links = [{ label: "LinkedIn", url: "linkedin.com/in/jordan" }];
    input.keyWins = ["Closed a $10M deal"];
    input.targetPriorities = ["capital projects", "cost optimization"];
    input.sectionSequence = ["summary", "keyWins", "experience", "education", "skills"];
    const result = ResumeContentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown section key in sectionSequence", () => {
    const input = baseResumeContent() as any;
    input.sectionSequence = ["summary", "not-a-section"];
    const result = ResumeContentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("resolveSectionSequence", () => {
  const base = (): ResumeContent => ResumeContentSchema.parse(baseResumeContent()) as ResumeContent;

  it("uses the stamped sequence when present, appending forgotten content-bearing keys", () => {
    const r = { ...base(), sectionSequence: ["summary", "experience"] as ResumeContent["sectionSequence"] };
    const seq = resolveSectionSequence(r);
    expect(seq.slice(0, 2)).toEqual(["summary", "experience"]);
    expect(seq).toContain("education");
    expect(seq).toContain("skills");
    expect(seq).toContain("certifications");
  });

  it("falls back to legacy order from sectionOrder for pre-sequence content", () => {
    const expFirst = resolveSectionSequence(base());
    expect(expFirst.indexOf("experience")).toBeLessThan(expFirst.indexOf("education"));

    const eduFirst = resolveSectionSequence({ ...base(), sectionOrder: "education-first" });
    expect(eduFirst.indexOf("education")).toBeLessThan(eduFirst.indexOf("experience"));
  });

  it("never auto-appends keyWins/projects standalone when selectedImpact is already in the sequence (regression: used to double-render)", () => {
    const r = { ...base(), sectionSequence: ["summary", "selectedImpact", "experience", "education", "skills"] as ResumeContent["sectionSequence"] };
    const seq = resolveSectionSequence(r);
    expect(seq).toContain("selectedImpact");
    expect(seq).not.toContain("keyWins");
    expect(seq).not.toContain("projects");
  });

  it("still auto-appends keyWins/projects standalone for archetypes that don't use selectedImpact", () => {
    const r = { ...base(), sectionSequence: ["summary", "experience", "education", "skills"] as ResumeContent["sectionSequence"] };
    const seq = resolveSectionSequence(r);
    expect(seq).toContain("keyWins");
    expect(seq).toContain("projects");
  });

  // BUG 3 regression: a resume with no sectionSequence and no archetype hint
  // used to fall back to a generic legacy order that (a) never included
  // "selectedImpact" and (b) DID include the standalone "projects"/
  // "certifications" keys — so the forgotten-content-bearing-key loop would
  // then append "selectedImpact" too (since IT was "forgotten"), rendering
  // the same keyWins/projects data twice under two different headings.
  it("never auto-appends selectedImpact via the forgotten-keys loop, even when the base sequence already has standalone keyWins/projects (regression: duplicate Key Projects & Impact / Relevant Projects)", () => {
    const r = { ...base(), sectionSequence: ["summary", "experience", "projects", "skills", "education"] as ResumeContent["sectionSequence"] };
    const seq = resolveSectionSequence(r);
    expect(seq).toContain("projects");
    expect(seq).not.toContain("selectedImpact");
  });

  it("never auto-appends selectedImpact for truly legacy content (no sectionSequence, no archetype)", () => {
    const r = base(); // no sectionSequence set
    const seq = resolveSectionSequence(r);
    expect(seq).not.toContain("selectedImpact");
  });

  it("uses the CURRENT archetype spec (not the generic legacy order) when sectionSequence is missing but the archetype is known", () => {
    const r = { ...base(), sectionSequence: null as ResumeContent["sectionSequence"] };
    const seq = resolveSectionSequence(r, "consulting");
    expect(seq).toEqual(["summary", "selectedImpact", "experience", "skills", "education"]);
    // Consulting's real spec omits certifications/leadership entirely — the
    // generic legacy fallback used to include them regardless of archetype.
    expect(seq).not.toContain("certifications");
    expect(seq).not.toContain("leadership");
  });

  it("Education is the last section that actually RENDERS for experience-first legacy content with no known archetype (BUG 3: was previously 2nd)", () => {
    // resolveSectionSequence's array may still list other (dataless) keys
    // after "education" — the forgotten-key append doesn't know which
    // sections have real content. What matters is what actually renders,
    // which resumeContentToMarkdown already skips when a section is empty.
    const r = base(); // sectionOrder: "experience-first" by default, no sectionSequence, no archetype
    const md = resumeContentToMarkdown(r);
    const headings = md.split("\n").filter(l => l.startsWith("## "));
    expect(headings[headings.length - 1]).toBe("## Education");
  });

  it("education-first legacy content still puts education before experience — a deliberate, different, correct convention (finance/VC), not a bug", () => {
    const r = { ...base(), sectionOrder: "education-first" as const };
    const seq = resolveSectionSequence(r);
    expect(seq.indexOf("education")).toBeLessThan(seq.indexOf("experience"));
  });
});

describe("resumeContentToMarkdown with the new sections", () => {
  it("renders key wins, header links, and sequence order", () => {
    const parsed = ResumeContentSchema.parse({
      ...(baseResumeContent() as any),
      summary: "Consultant targeting capital excellence work.",
      links: [{ label: "LinkedIn", url: "linkedin.com/in/jordan" }, { label: "Portfolio", url: "jordan.dev" }],
      keyWins: ["Closed a $10M deal", "Cut close cycle from 12d to 4d"],
      sectionSequence: ["summary", "keyWins", "experience", "education", "skills", "certifications"],
    }) as ResumeContent;
    const md = resumeContentToMarkdown(parsed);
    expect(md).toContain("[LinkedIn](linkedin.com/in/jordan)");
    expect(md).toContain("[Portfolio](jordan.dev)");
    expect(md).toContain("## Key Wins");
    expect(md).toContain("- Closed a $10M deal");
    expect(md.indexOf("## Key Wins")).toBeLessThan(md.indexOf("## Experience"));
    expect(md.indexOf("## Summary")).toBeLessThan(md.indexOf("## Key Wins"));
  });

  it("leads each experience heading with the employer name, not the role", () => {
    const parsed = ResumeContentSchema.parse({
      ...(baseResumeContent() as any),
      experience: [{
        company: "Bain & Company",
        role: "Consultant",
        tenure: "2020 - Present",
        location: null,
        bullets: [{ text: "Led capital project reviews", priority: 1 }],
      }],
    }) as ResumeContent;
    const md = resumeContentToMarkdown(parsed);
    const headingLine = md.split("\n").find(l => l.startsWith("### "))!;
    expect(headingLine).toBe("### Bain & Company | Consultant | 2020 - Present");
  });

  it("renders keyWins + projects together under ONE combined heading when sectionSequence uses selectedImpact", () => {
    const parsed = ResumeContentSchema.parse({
      ...(baseResumeContent() as any),
      keyWins: ["Closed a $10M deal"],
      projects: [{ name: "Cost Tracker", description: "Built a capital spend dashboard" }],
      sectionSequence: ["summary", "selectedImpact", "experience", "education", "skills"],
    }) as ResumeContent;
    const md = resumeContentToMarkdown(parsed);

    // Exactly one combined heading — never two separate ones.
    expect(md).toContain("## Key Projects & Impact");
    expect(md).not.toContain("## Key Wins\n");
    expect(md).not.toContain("## Relevant Projects");
    expect((md.match(/## Key Projects & Impact/g) ?? []).length).toBe(1);

    expect(md).toContain("- Closed a $10M deal");
    expect(md).toContain("- Cost Tracker: Built a capital spend dashboard");
    // Both items live between the combined heading and the next section.
    const impactIdx = md.indexOf("## Key Projects & Impact");
    const expIdx = md.indexOf("## Experience");
    expect(md.indexOf("Closed a $10M deal")).toBeGreaterThan(impactIdx);
    expect(md.indexOf("Cost Tracker")).toBeLessThan(expIdx);
  });

  it("omits the combined section entirely when both keyWins and projects are empty", () => {
    const parsed = ResumeContentSchema.parse({
      ...(baseResumeContent() as any),
      keyWins: [],
      projects: [],
      sectionSequence: ["summary", "selectedImpact", "experience", "education", "skills"],
    }) as ResumeContent;
    const md = resumeContentToMarkdown(parsed);
    expect(md).not.toContain("Key Projects & Impact");
  });

  // BUG 3 end-to-end regression: a resume saved BEFORE sectionSequence
  // existed (or before this generation stamped one) — has keyWins, projects,
  // AND certifications data, no sectionSequence at all — must NOT render
  // both "Key Projects & Impact" and "Relevant Projects", must NOT render
  // Certifications for consulting, and must render Education last, once the
  // archetype is passed through.
  it("a legacy resume (no sectionSequence) with keyWins+projects+certifications renders correctly for consulting: one combined section, no certifications, education last", () => {
    const parsed = ResumeContentSchema.parse({
      ...(baseResumeContent() as any),
      sectionSequence: null,
      keyWins: ["Delivered a $10.45B portfolio intelligence cockpit."],
      projects: [{ name: "Cost Tracker", description: "Built a capital spend dashboard." }],
      certifications: [{ name: "PMP" }],
    }) as ResumeContent;

    const md = resumeContentToMarkdown(parsed, "consulting");

    expect(md).toContain("## Key Projects & Impact");
    expect(md).not.toContain("## Relevant Projects");
    expect(md).not.toContain("## Certifications");
    expect((md.match(/## Key Projects & Impact/g) ?? []).length).toBe(1);

    const headings = md.split("\n").filter(l => l.startsWith("## "));
    expect(headings[headings.length - 1]).toBe("## Education");
    // No heading can ever appear twice.
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("no section heading can ever render twice, for any resolved sequence", () => {
    const parsed = ResumeContentSchema.parse({
      ...(baseResumeContent() as any),
      sectionSequence: ["summary", "selectedImpact", "experience", "skills", "education"],
      keyWins: ["Win A"],
      projects: [{ name: "P1", description: "Did a thing." }],
      leadership: ["Led a club"],
      certifications: [{ name: "Cert A" }],
    }) as ResumeContent;
    const md = resumeContentToMarkdown(parsed, "consulting");
    const headings = md.split("\n").filter(l => l.startsWith("## "));
    expect(new Set(headings).size).toBe(headings.length);
  });
});
