import { describe, it, expect } from "vitest";
import { normalizeTextForATS } from "../ats";

describe("normalizeTextForATS", () => {
  it("replaces em dash with hyphen", () => {
    expect(normalizeTextForATS("led strategy—and shipped")).toBe("led strategy-and shipped");
  });

  it("replaces en dash with hyphen", () => {
    expect(normalizeTextForATS("2019–2022")).toBe("2019-2022");
  });

  it("replaces smart single quotes (both directions)", () => {
    expect(normalizeTextForATS("it’s fine")).toBe("it's fine");
    expect(normalizeTextForATS("it‘s fine")).toBe("it's fine");
  });

  it("replaces smart double quotes (both directions)", () => {
    expect(normalizeTextForATS("“Hello”")).toBe('"Hello"');
    expect(normalizeTextForATS("“Hello”")).toBe('"Hello"');
  });

  it("replaces ellipsis with three dots", () => {
    expect(normalizeTextForATS("and more…")).toBe("and more...");
  });

  it("replaces non-breaking space with regular space", () => {
    expect(normalizeTextForATS("hello world")).toBe("hello world");
  });

  it("removes zero-width space", () => {
    expect(normalizeTextForATS("hel​lo")).toBe("hello");
  });

  it("removes BOM", () => {
    expect(normalizeTextForATS("﻿first")).toBe("first");
  });

  it("replaces fancy bullet characters with hyphens", () => {
    expect(normalizeTextForATS("• item")).toBe("- item");
    expect(normalizeTextForATS("‣ item")).toBe("- item");
    expect(normalizeTextForATS("◦ item")).toBe("- item");
    expect(normalizeTextForATS("⁃ item")).toBe("- item");
    expect(normalizeTextForATS("∙ item")).toBe("- item");
  });

  it("handles multiple replacements in one string", () => {
    const input = "﻿foo—bar’s • baz…";
    const output = normalizeTextForATS(input);
    expect(output).toBe("foo-bar's - baz...");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTextForATS("  hello  ")).toBe("hello");
  });

  it("returns clean plain text unchanged", () => {
    const plain = "Led a team of 5, shipped 3 products in Q2 2023.";
    expect(normalizeTextForATS(plain)).toBe(plain);
  });
});
