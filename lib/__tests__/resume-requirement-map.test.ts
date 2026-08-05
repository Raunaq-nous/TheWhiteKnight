import { describe, it, expect } from "vitest";
import {
  recomputeCoverage,
  defaultCheckedState,
  applyCheckedState,
  collectIncludedTexts,
  buildReactiveProbeQuestion,
  findNewlyUncovered,
  RequirementCoverage,
} from "../resume-requirement-map";
import type { ResumeContent } from "../resume-schema";

function content(): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "A consultant.",
    sectionOrder: "experience-first",
    keyWins: ["Delivered a $10.45B portfolio intelligence cockpit."],
    projects: [{ name: "Cost Tracker", description: "Built a capital spend dashboard." }],
    experience: [{
      company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "",
      bullets: [
        { text: "Delivered board-level recommendation for a multi-billion-dollar nuclear capital program.", priority: 1 },
        { text: "Identified CapEx/OpEx optimization levers delivering an IRR improvement roadmap.", priority: 2 },
      ],
    }],
    education: [{ institution: "MIT", degree: "B.S.", years: "2014 - 2018" }],
    skills: [{ category: "Strategy", items: ["Financial modeling"] }],
  } as ResumeContent;
}

const requirements: RequirementCoverage[] = [
  {
    requirement: "capital project delivery",
    rating: "strong",
    evidence: { sourceType: "experience", sourceId: "Bain & Company", bulletText: "Delivered board-level recommendation for a multi-billion-dollar nuclear capital program." },
    reasoning: "Direct delivery, board-level outcome.",
  },
  {
    requirement: "cost and schedule optimization",
    rating: "strong",
    evidence: { sourceType: "experience", sourceId: "Bain & Company", bulletText: "Identified CapEx/OpEx optimization levers delivering an IRR improvement roadmap." },
    reasoning: "Direct engagement, IRR roadmap.",
  },
  {
    requirement: "M&A due diligence",
    rating: "none",
    evidence: null,
    reasoning: "Nothing in the profile addresses this.",
  },
];

describe("defaultCheckedState / applyCheckedState", () => {
  it("everything is checked by default, so applyCheckedState is a no-op that reproduces the original content", () => {
    const c = content();
    const sequence = ["summary", "selectedImpact", "experience", "skills", "education"] as const;
    const checked = defaultCheckedState(c, [...sequence]);
    const applied = applyCheckedState(c, checked);
    expect(applied.experience[0].bullets).toHaveLength(2);
    expect(applied.keyWins).toEqual(c.keyWins);
    expect(applied.projects).toEqual(c.projects);
  });

  it("unchecking a single bullet removes only that bullet, keeping the rest", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    checked.experience[0][0] = false; // uncheck the board-level bullet
    const applied = applyCheckedState(c, checked);
    expect(applied.experience[0].bullets).toHaveLength(1);
    expect(applied.experience[0].bullets[0].text).toContain("IRR improvement roadmap");
  });

  it("unchecking a whole section (selectedImpact) hides both keyWins and projects", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    checked.sections.selectedImpact = false;
    const applied = applyCheckedState(c, checked);
    expect(applied.keyWins).toEqual([]);
    expect(applied.projects).toEqual([]);
  });

  it("unchecking the experience section drops all roles entirely", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    checked.sections.experience = false;
    const applied = applyCheckedState(c, checked);
    expect(applied.experience).toEqual([]);
  });

  it("an entry with every bullet unchecked disappears entirely from the applied content", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    checked.experience[0] = checked.experience[0].map(() => false);
    const applied = applyCheckedState(c, checked);
    expect(applied.experience).toEqual([]);
  });
});

describe("recomputeCoverage — reactive probing (the core interaction)", () => {
  it("all strong/none as generated when nothing has been unchecked", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    const included = collectIncludedTexts(applyCheckedState(c, checked));
    const live = recomputeCoverage(requirements, included);
    expect(live.find(r => r.requirement === "capital project delivery")!.liveRating).toBe("strong");
    expect(live.find(r => r.requirement === "M&A due diligence")!.liveRating).toBe("none");
    expect(live.every(r => !r.lostEvidence)).toBe(true);
  });

  it("unchecking a requirement's ONLY evidence drops its live rating to none and flags lostEvidence", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    checked.experience[0][0] = false; // the capital-project-delivery bullet
    const included = collectIncludedTexts(applyCheckedState(c, checked));
    const live = recomputeCoverage(requirements, included);

    const capitalReq = live.find(r => r.requirement === "capital project delivery")!;
    expect(capitalReq.liveRating).toBe("none");
    expect(capitalReq.lostEvidence).toBe(true);
    // The unaffected requirement stays strong.
    expect(live.find(r => r.requirement === "cost and schedule optimization")!.liveRating).toBe("strong");
  });

  it("a requirement that was already 'none' never gets flagged as lostEvidence (nothing to lose)", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    const included = collectIncludedTexts(applyCheckedState(c, checked));
    const live = recomputeCoverage(requirements, included);
    expect(live.find(r => r.requirement === "M&A due diligence")!.lostEvidence).toBe(false);
  });

  it("findNewlyUncovered surfaces exactly the requirements that just lost coverage", () => {
    const c = content();
    const checked = defaultCheckedState(c, ["summary", "selectedImpact", "experience", "skills", "education"]);
    checked.experience[0][0] = false;
    const included = collectIncludedTexts(applyCheckedState(c, checked));
    const live = recomputeCoverage(requirements, included);
    const uncovered = findNewlyUncovered(live);
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].requirement).toBe("capital project delivery");
  });
});

describe("buildReactiveProbeQuestion — specific, never generic", () => {
  it("names the exact requirement", () => {
    const live = { ...requirements[0], liveRating: "none" as const, lostEvidence: true };
    const q = buildReactiveProbeQuestion(live);
    expect(q).toContain('"capital project delivery"');
    expect(q).toContain("Do you have another engagement");
  });

  it("mentions the JD emphasis count when the requirement appears multiple times in the raw JD", () => {
    const live = { ...requirements[1], liveRating: "none" as const, lostEvidence: true };
    const jd = "This role requires cost and schedule optimization. Later in the JD, cost and schedule optimization is mentioned again as critical.";
    const q = buildReactiveProbeQuestion(live, jd);
    expect(q).toContain("2 times");
  });

  it("omits the emphasis phrase when the requirement isn't found verbatim in the JD text", () => {
    const live = { ...requirements[0], liveRating: "none" as const, lostEvidence: true };
    const q = buildReactiveProbeQuestion(live, "Some unrelated JD text.");
    expect(q).not.toContain("times");
  });
});
