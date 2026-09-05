import { describe, it, expect } from "vitest";
import {
  assertSectionsInOrder, expectedSectionHeadings, runPdfExtractionGate, pdfExtractionFailureMessage,
  estimatePageTwoFillPercent, PAGE_TWO_MIN_FILL_PERCENT,
} from "../resume-pdf-extract-gate";
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

  it("fails when the page count exceeds the (default, unspecified) 1-page limit", () => {
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

describe("runPdfExtractionGate with maxPages — archetype-driven, density-checked page limits", () => {
  const fullPageText = "x".repeat(3000);
  const halfFullText = "x".repeat(1500);
  const thinText = "x".repeat(300);

  function sectionsText() {
    return "SUMMARY\ntext\n\nEXPERIENCE\ntext\n\nEDUCATION\ntext\n\nSKILLS\ntext";
  }

  it("passes a 2-page PDF when maxPages allows it and page two is at least 50% full", () => {
    const result = runPdfExtractionGate(
      { text: sectionsText(), numpages: 2, pageTexts: [fullPageText, halfFullText] },
      baseContent(),
      undefined,
      2,
    );
    expect(result.ok).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(result.pageTwoFillPercent).toBeGreaterThanOrEqual(PAGE_TWO_MIN_FILL_PERCENT);
  });

  it("hard-fails a 2-page PDF when maxPages allows it but page two is a nearly-empty trailing page", () => {
    const result = runPdfExtractionGate(
      { text: sectionsText(), numpages: 2, pageTexts: [fullPageText, thinText] },
      baseContent(),
      undefined,
      2,
    );
    expect(result.ok).toBe(false);
    expect(result.pageTwoFillPercent).toBeLessThan(PAGE_TWO_MIN_FILL_PERCENT);
    expect(result.errors.some(e => /page two/i.test(e) && /full/i.test(e))).toBe(true);
  });

  it("hard-fails a 2-page PDF when maxPages is only 1, regardless of how full page two is", () => {
    const result = runPdfExtractionGate(
      { text: sectionsText(), numpages: 2, pageTexts: [fullPageText, fullPageText] },
      baseContent(),
      undefined,
      1,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /exceeding the 1-page limit/.test(e))).toBe(true);
  });

  it("never allows 3 or more pages, even when maxPages is set to something looser", () => {
    const result = runPdfExtractionGate(
      { text: sectionsText(), numpages: 3, pageTexts: [fullPageText, fullPageText, fullPageText] },
      baseContent(),
      undefined,
      2,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /3 or more pages/.test(e))).toBe(true);
  });

  it("does not check page-two fill when there's only 1 page", () => {
    const result = runPdfExtractionGate({ text: sectionsText(), numpages: 1 }, baseContent(), undefined, 2);
    expect(result.ok).toBe(true);
    expect(result.pageTwoFillPercent).toBeNull();
  });

  it("doesn't hard-fail on fill percentage when per-page text wasn't captured (older caller, no pageTexts)", () => {
    const result = runPdfExtractionGate({ text: sectionsText(), numpages: 2 }, baseContent(), undefined, 2);
    expect(result.pageTwoFillPercent).toBeNull();
    expect(result.errors.some(e => /full/i.test(e))).toBe(false);
  });
});

describe("estimatePageTwoFillPercent", () => {
  it("returns null when fewer than 2 pages of text are available", () => {
    expect(estimatePageTwoFillPercent(undefined)).toBeNull();
    expect(estimatePageTwoFillPercent(["only one page"])).toBeNull();
  });

  it("returns null when page one has no text to compare against", () => {
    expect(estimatePageTwoFillPercent(["", "some text"])).toBeNull();
  });

  it("returns ~100 when page two is roughly as full as page one", () => {
    const page = "word ".repeat(200);
    expect(estimatePageTwoFillPercent([page, page])).toBeGreaterThanOrEqual(95);
  });

  it("returns a low percentage when page two is much shorter than page one", () => {
    const full = "word ".repeat(200);
    const thin = "word ".repeat(20);
    const percent = estimatePageTwoFillPercent([full, thin]);
    expect(percent).toBeLessThan(PAGE_TWO_MIN_FILL_PERCENT);
  });

  it("caps at 100 even if page two somehow has more text than page one", () => {
    const short = "word ".repeat(10);
    const long = "word ".repeat(50);
    expect(estimatePageTwoFillPercent([short, long])).toBe(100);
  });
});
