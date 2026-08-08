import { describe, it, expect } from "vitest";
import { assertSectionsInOrder, expectedSectionHeadings, runPdfExtractionGate, pdfExtractionFailureMessage } from "../resume-pdf-extract-gate";
import type { ResumeContent } from "../resume-schema";

function baseContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "Five years shipping AI products.",
    sectionOrder: "experience-first",
    sectionSequence: ["summary", "experience", "education", "skills"],
    experience: [{ company: "Acme AI", role: "Senior PM", tenure: "2021 - Present", location: "", bullets: [{ sourceBulletId: "e_1", text: "Led a launch, 32% growth.", priority: 1 }] }],
    education: [{ institution: "MIT", degree: "B.S.", field: null, years: "2014 - 2018" }],
    skills: [{ category: "Product", items: ["Roadmapping"] }],
    projects: [],
    keyWins: [],
    keyWinIds: [],
    ...overrides,
  } as ResumeContent;
}

describe("expectedSectionHeadings", () => {
  it("returns headings only for sections that actually have content, in resolveSectionSequence order", () => {
    expect(expectedSectionHeadings(baseContent())).toEqual(["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]);
  });

  it("omits a heading for an empty section (e.g. no summary written)", () => {
    expect(expectedSectionHeadings(baseContent({ summary: "" }))).toEqual(["EXPERIENCE", "EDUCATION", "SKILLS"]);
  });
});

describe("assertSectionsInOrder", () => {
  it("returns no errors when every heading appears, in order", () => {
    const text = "Jordan Lee\n\nSUMMARY\nFive years...\n\nEXPERIENCE\nAcme AI...\n\nEDUCATION\nMIT...";
    expect(assertSectionsInOrder(text, ["SUMMARY", "EXPERIENCE", "EDUCATION"])).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const text = "summary\ntext\n\nexperience\ntext";
    expect(assertSectionsInOrder(text, ["SUMMARY", "EXPERIENCE"])).toHaveLength(0);
  });

  it("flags a missing heading", () => {
    const text = "SUMMARY\ntext\n\nEDUCATION\ntext";
    const errors = assertSectionsInOrder(text, ["SUMMARY", "EXPERIENCE", "EDUCATION"]);
    expect(errors.some(e => /"EXPERIENCE" not found/.test(e))).toBe(true);
  });

  it("flags an out-of-order heading", () => {
    const text = "EXPERIENCE\ntext\n\nSUMMARY\ntext";
    const errors = assertSectionsInOrder(text, ["SUMMARY", "EXPERIENCE"]);
    expect(errors.some(e => /out of order/.test(e))).toBe(true);
  });
});

describe("runPdfExtractionGate", () => {
  it("passes a clean, one-page, correctly-ordered extraction", () => {
    const content = baseContent();
    const text = "Jordan Lee\n\nSUMMARY\ntext\n\nEXPERIENCE\ntext\n\nEDUCATION\ntext\n\nSKILLS\ntext";
    const result = runPdfExtractionGate({ text, numpages: 1 }, content);
    expect(result.ok).toBe(true);
    expect(result.pageCount).toBe(1);
  });

  it("fails when the extracted text is empty (not selectable)", () => {
    const result = runPdfExtractionGate({ text: "", numpages: 1 }, baseContent());
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /not selectable/.test(e))).toBe(true);
  });

  it("fails when the page count is not exactly 1", () => {
    const text = "SUMMARY\nEXPERIENCE\nEDUCATION\nSKILLS";
    const result = runPdfExtractionGate({ text, numpages: 2 }, baseContent());
    expect(result.ok).toBe(false);
    expect(result.pageCount).toBe(2);
    expect(result.errors.some(e => /2 page/.test(e))).toBe(true);
  });

  it("fails when a section is missing from the extracted text", () => {
    const text = "SUMMARY\ntext\n\nEDUCATION\ntext\n\nSKILLS\ntext"; // no EXPERIENCE
    const result = runPdfExtractionGate({ text, numpages: 1 }, baseContent());
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /EXPERIENCE/.test(e))).toBe(true);
  });

  it("collects multiple independent failures at once (not just the first)", () => {
    const result = runPdfExtractionGate({ text: "", numpages: 3 }, baseContent());
    expect(result.errors.length).toBeGreaterThanOrEqual(2); // empty text + wrong page count (+ missing sections)
  });
});

describe("pdfExtractionFailureMessage", () => {
  it("is a loud, itemized message that includes the measured page count", () => {
    const result = runPdfExtractionGate({ text: "", numpages: 2 }, baseContent());
    const msg = pdfExtractionFailureMessage(result);
    expect(msg).toContain("PDF EXTRACTION GATE FAILED");
    expect(msg).toContain("page count: 2");
  });
});
