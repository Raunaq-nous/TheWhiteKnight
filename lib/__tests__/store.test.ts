import { describe, it, expect } from "vitest";
import { generateSlug, generateId } from "../store";

describe("generateSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(generateSlug("Stripe", "Software Engineer")).toBe("stripe-software-engineer");
  });

  it("collapses consecutive special characters to a single hyphen", () => {
    // "Bain & Company" — the " & " (space+ampersand+space) is one run of non-alphanumeric chars,
    // so the + quantifier collapses it to a single hyphen.
    expect(generateSlug("Bain & Company", "Associate Consultant"))
      .toBe("bain-company-associate-consultant");
  });

  it("handles mixed case", () => {
    expect(generateSlug("OpenAI", "ML Engineer")).toBe("openai-ml-engineer");
  });

  it("handles numbers in names", () => {
    expect(generateSlug("123Corp", "VP of Sales")).toBe("123corp-vp-of-sales");
  });

  it("produces the same output for the same inputs (deterministic)", () => {
    const a = generateSlug("Acme", "Product Manager");
    const b = generateSlug("Acme", "Product Manager");
    expect(a).toBe(b);
  });
});

describe("generateId", () => {
  it("returns a non-empty string", () => {
    expect(typeof generateId()).toBe("string");
    expect(generateId().length).toBeGreaterThan(0);
  });

  it("returns only alphanumeric characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateId()).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("produces unique values across 1000 calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
