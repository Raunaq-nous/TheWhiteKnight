/**
 * Regression tests: ResumeContentSchema's optional fields must tolerate an
 * explicit null (not just a missing key) — same "expected string, received
 * null" bug class as AFScoreResultSchema.archetype.secondary. Also confirms
 * normalizeResumeContent/resumeContentToMarkdown don't crash on null values.
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, normalizeResumeContent, resumeContentToMarkdown, ResumeContent } from "../resume-schema";

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
    expect(md).not.toContain("## Projects");
    expect(md).not.toContain("## Certifications");
    expect(md).not.toContain("## Leadership");
  });
});
