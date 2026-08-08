import { describe, it, expect } from "vitest";
import { buildDocxPlan, generateResumeDocxBuffer } from "../resume-docx";
import type { ResumeContent } from "../resume-schema";

function baseContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "Five years shipping AI products.",
    sectionOrder: "experience-first",
    sectionSequence: ["summary", "experience", "education", "skills"],
    experience: [{
      company: "Acme AI", role: "Senior PM", tenure: "2021 - Present", location: "Remote",
      bullets: [
        { sourceBulletId: "e_1", text: "Led a 0-to-1 launch, increasing engagement by 32%.", priority: 1 },
        { sourceBulletId: "e_2", text: "Reduced churn by 18% through onboarding improvements.", priority: 2 },
      ],
    }],
    education: [{ institution: "MIT", degree: "B.S.", field: "Computer Science", years: "2014 - 2018" }],
    skills: [{ category: "Product", items: ["Roadmapping", "PRD writing"] }],
    projects: [],
    keyWins: [],
    keyWinIds: [],
    ...overrides,
  } as ResumeContent;
}

describe("buildDocxPlan", () => {
  it("starts with a header node carrying name/contact/links", () => {
    const plan = buildDocxPlan(baseContent({ links: [{ label: "LinkedIn", url: "linkedin.com/in/jordan" }] }));
    expect(plan[0]).toEqual({
      kind: "header",
      name: "Jordan Lee",
      contactLine: "jordan@example.com | 555-0100",
      links: [{ label: "LinkedIn", url: "linkedin.com/in/jordan" }],
    });
  });

  it("emits sections in the SAME order resolveSectionSequence resolves (summary, experience, education, skills)", () => {
    const plan = buildDocxPlan(baseContent());
    const headings = plan.filter(n => n.kind === "sectionHeading").map(n => (n as any).heading);
    expect(headings).toEqual(["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]);
  });

  it("never emits a CERTIFICATIONS heading or content, even if the content has certifications data", () => {
    const plan = buildDocxPlan(baseContent({ certifications: [{ name: "PMP" }] } as any));
    expect(plan.some(n => n.kind === "sectionHeading" && (n as any).heading.includes("CERTIF"))).toBe(false);
  });

  it("renders each experience entry as a bold company/date header, an italic role line, then bullets in priority order", () => {
    const plan = buildDocxPlan(baseContent());
    const entryHeader = plan.find(n => n.kind === "entryHeader");
    expect(entryHeader).toEqual({ kind: "entryHeader", left: "Acme AI", right: "2021 - Present" });
    const entryIdx = plan.indexOf(entryHeader!);
    expect(plan[entryIdx + 1]).toEqual({ kind: "entryRole", text: "Senior PM, Remote" });
    expect(plan[entryIdx + 2]).toEqual({ kind: "bullet", text: "Led a 0-to-1 launch, increasing engagement by 32%." });
    expect(plan[entryIdx + 3]).toEqual({ kind: "bullet", text: "Reduced churn by 18% through onboarding improvements." });
  });

  it("sorts bullets by priority even if the source array is out of order", () => {
    const content = baseContent({
      experience: [{
        company: "Acme AI", role: "PM", tenure: "2021", location: "",
        bullets: [
          { sourceBulletId: "e_2", text: "Second priority bullet.", priority: 2 },
          { sourceBulletId: "e_1", text: "First priority bullet.", priority: 1 },
        ],
      }],
    });
    const plan = buildDocxPlan(content);
    const bullets = plan.filter(n => n.kind === "bullet").map(n => (n as any).text);
    expect(bullets).toEqual(["First priority bullet.", "Second priority bullet."]);
  });

  it("renders skills as one skillsLine per category, never a table/pipe format", () => {
    const plan = buildDocxPlan(baseContent());
    const skillsLine = plan.find(n => n.kind === "skillsLine");
    expect(skillsLine).toEqual({ kind: "skillsLine", category: "Product", items: "Roadmapping, PRD writing" });
  });

  it("renders education with institution/years as the bold/right-aligned header and degree as the role-style line", () => {
    const plan = buildDocxPlan(baseContent());
    const eduHeader = plan.find(n => n.kind === "entryHeader" && (n as any).left === "MIT");
    expect(eduHeader).toEqual({ kind: "entryHeader", left: "MIT", right: "2014 - 2018" });
    const idx = plan.indexOf(eduHeader!);
    expect(plan[idx + 1]).toEqual({ kind: "entryRole", text: "B.S. in Computer Science" });
  });

  it("omits a section entirely when its content is empty (no heading emitted for nothing)", () => {
    const plan = buildDocxPlan(baseContent({ summary: "" }));
    expect(plan.some(n => n.kind === "sectionHeading" && (n as any).heading === "SUMMARY")).toBe(false);
  });

  it("combines keyWins + projects under one heading when the sequence uses selectedImpact", () => {
    const content = baseContent({
      sectionSequence: ["summary", "selectedImpact", "experience", "education", "skills"],
      keyWins: ["Closed a $10M deal."],
      keyWinIds: ["e_1"],
      projects: [{ sourceBulletId: "p_1", name: "Cost Tracker", description: "Built a capital spend dashboard." }],
    });
    const plan = buildDocxPlan(content);
    const headings = plan.filter(n => n.kind === "sectionHeading").map(n => (n as any).heading);
    expect(headings).toContain("KEY PROJECTS & IMPACT");
    expect(headings).not.toContain("KEY WINS");
    expect(headings).not.toContain("RELEVANT PROJECTS");
    expect(plan.some(n => n.kind === "bullet" && (n as any).text === "Closed a $10M deal.")).toBe(true);
    expect(plan.some(n => n.kind === "bullet" && (n as any).text === "Cost Tracker: Built a capital spend dashboard.")).toBe(true);
  });
});

describe("generateResumeDocxBuffer", () => {
  it("produces a real, non-empty .docx (ZIP-container) buffer without throwing", async () => {
    const buffer = await generateResumeDocxBuffer(baseContent());
    expect(buffer.length).toBeGreaterThan(0);
    // .docx files are ZIP containers — the "PK" magic bytes are the strongest
    // cheap sanity check available without a full docx/zip parser dependency.
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
