import { describe, it, expect } from "vitest";
import { checkAtsReadability } from "../resume-ats-check";

const CLEAN_RESUME = `# Alex Chen
alex@example.com | 555-0100

## Summary
Five years shipping AI products.

## Experience
### Acme AI | Senior PM | 2021 - Present
- Managed 3 cross-functional teams across eng, design, and data.
- Led 0-to-1 launch of an AI recommendation engine, increasing user engagement by 32%.

### DataCo | Product Manager | 2018 - 2021
- Reduced churn by 18% through targeted onboarding improvements.

## Education
B.S. in Computer Science | MIT | 2014 - 2018

## Skills
Product: Roadmapping, PRD writing`;

describe("checkAtsReadability", () => {
  it("reports a clean, well-structured resume as fully readable with no issues", () => {
    const result = checkAtsReadability(CLEAN_RESUME);
    expect(result.readable).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags an em dash as a major issue (same char-level check as validateATS)", () => {
    const withEmDash = CLEAN_RESUME.replace("Reduced churn", "Reduced churn—a key metric");
    const result = checkAtsReadability(withEmDash);
    expect(result.readable).toBe(false);
    expect(result.issues.some(i => i.severity === "major" && /em dash/i.test(i.detail))).toBe(true);
  });

  it("flags a resume with no section headings at all as unreadable", () => {
    const result = checkAtsReadability("Just some plain text with no structure at all.");
    expect(result.readable).toBe(false);
    expect(result.issues.some(i => /no section headings/i.test(i.detail))).toBe(true);
  });

  it("flags an unrecognized section heading", () => {
    const withBadHeading = CLEAN_RESUME.replace("## Skills", "## Miscellaneous Stuff");
    const result = checkAtsReadability(withBadHeading);
    expect(result.readable).toBe(false);
    expect(result.issues.some(i => i.severity === "major" && /Unrecognized section heading "Miscellaneous Stuff"/.test(i.detail))).toBe(true);
  });

  it("flags an Experience section with no recoverable role entries", () => {
    const noEntries = `# Alex Chen\nalex@example.com\n\n## Experience\nJust a paragraph with no ### heading.\n`;
    const result = checkAtsReadability(noEntries);
    expect(result.readable).toBe(false);
    expect(result.issues.some(i => /no recoverable role entries/i.test(i.detail))).toBe(true);
  });

  it("flags an experience heading that doesn't cleanly split into company/role/tenure", () => {
    const badHeading = CLEAN_RESUME.replace("### Acme AI | Senior PM | 2021 - Present", "### Acme AI Senior PM 2021");
    const result = checkAtsReadability(badHeading);
    expect(result.readable).toBe(false);
    expect(result.issues.some(i => i.severity === "major" && /doesn't cleanly split/.test(i.detail))).toBe(true);
  });

  it("flags an overlong bullet as a minor issue, not major (doesn't fail readability alone)", () => {
    const longBullet = "- " + "Delivered a very long result across many stakeholders and workstreams ".repeat(6);
    const withLongBullet = CLEAN_RESUME.replace(
      "- Reduced churn by 18% through targeted onboarding improvements.",
      `- Reduced churn by 18% through targeted onboarding improvements.\n${longBullet}`,
    );
    const result = checkAtsReadability(withLongBullet);
    const found = result.issues.find(i => /exceeds 260 characters/.test(i.detail));
    expect(found).toBeDefined();
    expect(found!.severity).toBe("minor");
    expect(result.readable).toBe(true); // only minor issues present
  });

  it("does not check Experience-specific bullet/entry rules when there is no Experience section", () => {
    const noExperience = "# Alex Chen\nalex@example.com\n\n## Summary\nA summary.\n";
    const result = checkAtsReadability(noExperience);
    expect(result.issues.some(i => /role entries|doesn't cleanly split/.test(i.detail))).toBe(false);
  });
});
