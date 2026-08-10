import { describe, it, expect } from "vitest";
import { parseExportedArray, parseExportedObject } from "../portfolio-parser";

const BUILDS_SOURCE = `
import type { Build } from "../types";

export const builds: Build[] = [
  {
    name: "Portfolio Intelligence Cockpit",
    tags: ["Python", "LangChain", "Streamlit"],
    punchline: "Deployed across a $10.45B, 16-project capital program.",
    github: "https://github.com/example/cockpit",
    nerd: "RAG-based document intelligence engine paired with a Monte Carlo early-warning model.",
    process: "Started from a recurring bottleneck in capital reviews.",
    calm: "A tool that reads project paperwork so people don't have to.",
  },
  {
    name: "AutoEval",
    tags: ["Python", "OpenAI API"],
    punchline: "Open-source LLM evaluation harness, 500+ GitHub stars.",
    github: "https://github.com/example/autoeval",
    nerd: "Evaluation harness for LLM pipelines.",
    process: "Built to stop re-writing eval scripts for every project.",
    calm: "Checks whether an AI answer is actually any good.",
  },
];
`;

const BATTLES_SOURCE = `
export const battles = [
  { company: "Bain & Company", role: "Project Leader", period: "Jun 2025 - Present", location: "Gurgaon", highlights: ["Led concept selection for an O&G client.", "Delivered board-level recommendation."] },
  { company: "Aranca", role: "Engagement Lead", period: "Mar 2022 - Jun 2025", highlights: ["Built a Series A financial model."] },
];

export const education = {
  institution: "IIT Delhi",
  degree: "B.Tech",
  field: "Mechanical Engineering",
  years: "2015 - 2019",
};
`;

describe("parseExportedArray", () => {
  it("parses a real multi-entry Build array into plain objects", () => {
    const builds = parseExportedArray(BUILDS_SOURCE, "builds");
    expect(builds).toHaveLength(2);
    expect(builds[0].name).toBe("Portfolio Intelligence Cockpit");
    expect(builds[0].tags).toEqual(["Python", "LangChain", "Streamlit"]);
    expect(builds[0].punchline).toContain("$10.45B");
    expect(builds[1].name).toBe("AutoEval");
  });

  it("parses a battles array with nested string arrays", () => {
    const battles = parseExportedArray(BATTLES_SOURCE, "battles");
    expect(battles).toHaveLength(2);
    expect(battles[0].company).toBe("Bain & Company");
    expect(battles[0].highlights).toEqual(["Led concept selection for an O&G client.", "Delivered board-level recommendation."]);
  });

  it("returns [] when the export doesn't exist", () => {
    expect(parseExportedArray(BUILDS_SOURCE, "nonexistent")).toEqual([]);
  });

  it("returns [] when the export exists but isn't an array", () => {
    expect(parseExportedArray(BATTLES_SOURCE, "education")).toEqual([]);
  });

  it("never executes the source — a call expression in a field is simply skipped, not run", () => {
    const withCall = `export const builds = [{ name: "X", tags: dangerous() }];`;
    const result = parseExportedArray(withCall, "builds");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("X");
    expect(result[0].tags).toBeUndefined(); // the call expression is not a literal, so it's just omitted
  });
});

describe("parseExportedObject", () => {
  it("parses a real education object", () => {
    const edu = parseExportedObject(BATTLES_SOURCE, "education");
    expect(edu).toEqual({ institution: "IIT Delhi", degree: "B.Tech", field: "Mechanical Engineering", years: "2015 - 2019" });
  });

  it("returns null when the export doesn't exist", () => {
    expect(parseExportedObject(BATTLES_SOURCE, "nonexistent")).toBeNull();
  });

  it("returns null when the export exists but isn't an object (it's an array)", () => {
    expect(parseExportedObject(BATTLES_SOURCE, "battles")).toBeNull();
  });
});
