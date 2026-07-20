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
    expect(md).toContain("## Key Wins & Projects");
    expect(md).not.toContain("## Key Wins\n");
    expect(md).not.toContain("## Relevant Projects");
    expect((md.match(/## Key Wins/g) ?? []).length).toBe(1);

    expect(md).toContain("- Closed a $10M deal");
    expect(md).toContain("- Cost Tracker: Built a capital spend dashboard");
    // Both items live between the combined heading and the next section.
    const impactIdx = md.indexOf("## Key Wins & Projects");
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
    expect(md).not.toContain("Key Wins");
  });
});
