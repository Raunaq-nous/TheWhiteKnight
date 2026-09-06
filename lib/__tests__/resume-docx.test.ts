import { describe, it, expect } from "vitest";
import {
  buildDocxPlan, generateResumeDocxBuffer, selectDocxFormat,
  TWO_PAGE_SENIOR_CONSULTING_FORMAT, ONE_PAGE_DENSE_FORMAT,
  classifyExperienceBulletLabel, CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL,
} from "../resume-docx";
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

describe("docs/MASTER-PROFILE-SPEC.md Part 9 — exact two-format typography spec", () => {
  it("two-page senior consulting format matches the spec exactly", () => {
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.bodySize).toBe(18); // 9pt
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.smallSize).toBe(17);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.companyHeaderSize).toBe(21);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.sectionHeaderSize).toBe(22);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.subLabelSize).toBe(16);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.subLabelColor).toBe("666666");
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.nameSize).toBe(34);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.marginTwips).toEqual({ top: 620, right: 800, bottom: 620, left: 800 });
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.sectionSpacingBefore).toBe(70);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.sectionSpacingAfter).toBe(16);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.companySpacingBefore).toBe(44);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.companySpacingAfter).toBe(8);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.subLabelSpacingBefore).toBe(12);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.subLabelSpacingAfter).toBe(6);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.bulletSpacingAfter).toBe(12);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.bulletLineSpacing).toBe(250);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.bulletIndentLeft).toBe(220);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.bulletIndentHanging).toBe(140);
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.sectionBorder).toMatchObject({ size: 6, color: "111111", space: 2 });
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.companyBorder).toMatchObject({ size: 4, color: "999999", space: 6 });
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.linkColor).toBe("1155CC");
    expect(TWO_PAGE_SENIOR_CONSULTING_FORMAT.dateColor).toBe("555555");
  });

  it("one-page dense format matches the spec's explicit deltas exactly", () => {
    expect(ONE_PAGE_DENSE_FORMAT.bodySize).toBe(16); // 8pt
    expect(ONE_PAGE_DENSE_FORMAT.companyHeaderSize).toBe(19);
    expect(ONE_PAGE_DENSE_FORMAT.sectionHeaderSize).toBe(18);
    expect(ONE_PAGE_DENSE_FORMAT.marginTwips).toEqual({ top: 340, right: 580, bottom: 340, left: 580 });
    expect(ONE_PAGE_DENSE_FORMAT.bulletSpacingAfter).toBe(8);
    expect(ONE_PAGE_DENSE_FORMAT.bulletLineSpacing).toBe(200);
  });

  it("one-page dense format inherits everything the spec doesn't explicitly override from the two-page reference", () => {
    expect(ONE_PAGE_DENSE_FORMAT.nameSize).toBe(TWO_PAGE_SENIOR_CONSULTING_FORMAT.nameSize);
    expect(ONE_PAGE_DENSE_FORMAT.subLabelSize).toBe(TWO_PAGE_SENIOR_CONSULTING_FORMAT.subLabelSize);
    expect(ONE_PAGE_DENSE_FORMAT.linkColor).toBe(TWO_PAGE_SENIOR_CONSULTING_FORMAT.linkColor);
    expect(ONE_PAGE_DENSE_FORMAT.dateColor).toBe(TWO_PAGE_SENIOR_CONSULTING_FORMAT.dateColor);
  });

  it("selectDocxFormat picks the two-page format at maxPages 2 and the one-page dense format otherwise", () => {
    expect(selectDocxFormat(2)).toBe(TWO_PAGE_SENIOR_CONSULTING_FORMAT);
    expect(selectDocxFormat(1)).toBe(ONE_PAGE_DENSE_FORMAT);
  });
});

describe("experience sub-labels (consulting archetype only) — spec Part 8/9", () => {
  function consultingContent(bullets: { text: string; priority: number }[]): ResumeContent {
    return baseContent({
      experience: [{
        company: "Bain & Company", role: "Project Leader", tenure: "2025 - Present", location: "",
        bullets: bullets.map((b, i) => ({ sourceBulletId: `b_${i}`, ...b })),
      }],
    });
  }

  it("classifies a build/platform/tool bullet as an AI build", () => {
    expect(classifyExperienceBulletLabel("Built an AI-first platform for document intelligence.")).toBe(AI_BUILDS_LABEL);
    expect(classifyExperienceBulletLabel("Deployed a risk-analysis toolkit on Azure cloud.")).toBe(AI_BUILDS_LABEL);
  });

  it("classifies an engagement/study/case bullet as a consulting engagement", () => {
    expect(classifyExperienceBulletLabel("Led a concept selection study for a national oil and gas company.")).toBe(CONSULTING_ENGAGEMENTS_LABEL);
    expect(classifyExperienceBulletLabel("Drove performance improvement on a utility-scale solar asset.")).toBe(CONSULTING_ENGAGEMENTS_LABEL);
  });

  it("groups a consulting archetype's bullets under both sub-labels, consulting engagements first", () => {
    const content = consultingContent([
      { text: "Built an AI-first platform for document intelligence.", priority: 1 },
      { text: "Led a concept selection study for a national oil and gas company.", priority: 2 },
    ]);
    const plan = buildDocxPlan(content, "consulting");
    const subLabels = plan.filter(n => n.kind === "subLabel").map(n => (n as any).text);
    expect(subLabels).toEqual([CONSULTING_ENGAGEMENTS_LABEL, AI_BUILDS_LABEL]);
  });

  it("omits a sub-label band entirely when a role has no bullets of that kind", () => {
    const content = consultingContent([
      { text: "Led a concept selection study for a national oil and gas company.", priority: 1 },
    ]);
    const plan = buildDocxPlan(content, "consulting");
    const subLabels = plan.filter(n => n.kind === "subLabel").map(n => (n as any).text);
    expect(subLabels).toEqual([CONSULTING_ENGAGEMENTS_LABEL]);
  });

  it("does not sub-label bullets for a non-consulting archetype — flat bullet list, unchanged", () => {
    const content = consultingContent([
      { text: "Built an AI-first platform for document intelligence.", priority: 1 },
      { text: "Led a concept selection study for a national oil and gas company.", priority: 2 },
    ]);
    const plan = buildDocxPlan(content, "product");
    expect(plan.some(n => n.kind === "subLabel")).toBe(false);
  });
});
