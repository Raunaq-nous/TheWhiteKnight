import { describe, it, expect } from "vitest";
import {
  mapBuildToProject, mapBuildReference, mapBuildsToProjects,
  mapBattleToExperience, mapPortfolioEducation,
  guardAgainstOverwritingQuantified, buildPortfolioCandidates,
  renderBuildLiteral, insertBuildIntoSource, alreadyOnPortfolio,
} from "../portfolio-sync";
import type { Profile, ProjectEntry } from "../profile";
import type { PortfolioBuildDraft } from "../schemas";

const COCKPIT_BUILD = {
  name: "Portfolio Intelligence Cockpit",
  tags: ["Python", "LangChain", "Streamlit"],
  punchline: "Deployed across a $10.45B, 16-project capital program.",
  github: "https://github.com/example/cockpit",
  nerd: "RAG-based document intelligence engine paired with a Monte Carlo early-warning model.",
  process: "Started from a recurring bottleneck in capital reviews.",
  calm: "A tool that reads project paperwork so people don't have to.",
};

describe("mapBuildToProject — the mapping table", () => {
  it("maps name, tags (comma-joined), punchline->outcomes, github->repoUrl, nerd->description", () => {
    const cand = mapBuildToProject(COCKPIT_BUILD);
    expect(cand).toEqual({
      name: "Portfolio Intelligence Cockpit",
      description: "RAG-based document intelligence engine paired with a Monte Carlo early-warning model.",
      stack: "Python, LangChain, Streamlit",
      outcomes: "Deployed across a $10.45B, 16-project capital program.",
      repoUrl: "https://github.com/example/cockpit",
    });
  });

  it("falls back to `process` for description when `nerd` is absent", () => {
    const { nerd, ...rest } = COCKPIT_BUILD;
    const cand = mapBuildToProject(rest as any);
    expect(cand!.description).toBe(COCKPIT_BUILD.process);
  });

  it("never reads `calm` into description, outcomes, or stack — it's excluded from CandidateProject entirely", () => {
    const cand = mapBuildToProject(COCKPIT_BUILD)!;
    const values = Object.values(cand).join(" ");
    expect(values).not.toContain(COCKPIT_BUILD.calm);
  });

  it("returns null when the record has no name", () => {
    expect(mapBuildToProject({ tags: ["X"] })).toBeNull();
  });

  it("mapBuildsToProjects maps every valid build, skipping invalid ones", () => {
    const result = mapBuildsToProjects([COCKPIT_BUILD, { tags: [] }]);
    expect(result).toHaveLength(1);
  });
});

describe("mapBuildReference — calm imported as reference only", () => {
  it("carries calm for reference/logging, separately from the resume-selectable CandidateProject", () => {
    const ref = mapBuildReference(COCKPIT_BUILD);
    expect(ref).toEqual({ name: "Portfolio Intelligence Cockpit", calm: COCKPIT_BUILD.calm });
  });
});

describe("mapBattleToExperience", () => {
  it("maps company/role/period(alias)/location/highlights(alias)", () => {
    const cand = mapBattleToExperience({
      company: "Bain & Company", role: "Project Leader", period: "Jun 2025 - Present", location: "Gurgaon",
      highlights: ["Led concept selection for an O&G client."],
    });
    expect(cand).toEqual({
      company: "Bain & Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Gurgaon",
      bullets: ["Led concept selection for an O&G client."],
    });
  });

  it("returns null when company or role is missing", () => {
    expect(mapBattleToExperience({ role: "Analyst" })).toBeNull();
    expect(mapBattleToExperience({ company: "Aranca" })).toBeNull();
  });
});

describe("mapPortfolioEducation", () => {
  it("maps a single education object", () => {
    const result = mapPortfolioEducation({ institution: "IIT Delhi", degree: "B.Tech", field: "Mechanical Engineering", years: "2015 - 2019" });
    expect(result).toEqual([{ institution: "IIT Delhi", degree: "B.Tech", field: "Mechanical Engineering", years: "2015 - 2019", gpa: undefined, achievements: [] }]);
  });

  it("maps an array of education records", () => {
    const result = mapPortfolioEducation([
      { institution: "IIT Delhi", degree: "B.Tech", years: "2015 - 2019" },
      { institution: "XYZ University", degree: "M.S.", years: "2019 - 2021" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("returns [] for null", () => {
    expect(mapPortfolioEducation(null)).toEqual([]);
  });
});

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Lee", headline: "", email: "j@example.com", phone: "", location: "", locationsOpenTo: "",
    yearsOfExperience: "5", experience: [], education: [], skills: {}, projects: [], publications: [],
    certifications: [], voiceNotes: "", createdAt: "", updatedAt: "",
    ...overrides,
  } as Profile;
}

function projectEntry(overrides: Partial<ProjectEntry> = {}): ProjectEntry {
  return { id: "p1", name: "Portfolio Intelligence Cockpit", description: "", stack: "", outcomes: "", ...overrides };
}

describe("guardAgainstOverwritingQuantified", () => {
  it("drops the description field when the existing project's description is already quantified", () => {
    const existing = [projectEntry({ description: "Deployed across a $10.45B capital program." })];
    const cand = mapBuildToProject(COCKPIT_BUILD)!;
    const guarded = guardAgainstOverwritingQuantified([cand], existing);
    expect(guarded[0].description).toBeUndefined();
    expect(guarded[0].outcomes).toBeDefined(); // outcomes wasn't quantified on the existing entry — untouched
  });

  it("drops the outcomes field when the existing project's outcomes is already quantified", () => {
    const existing = [projectEntry({ outcomes: "Cut review cycles by 40%." })];
    const cand = mapBuildToProject(COCKPIT_BUILD)!;
    const guarded = guardAgainstOverwritingQuantified([cand], existing);
    expect(guarded[0].outcomes).toBeUndefined();
    expect(guarded[0].description).toBeDefined();
  });

  it("passes both fields through when the existing project has neither quantified", () => {
    const existing = [projectEntry({ description: "Some vague thing.", outcomes: "" })];
    const cand = mapBuildToProject(COCKPIT_BUILD)!;
    const guarded = guardAgainstOverwritingQuantified([cand], existing);
    expect(guarded[0].description).toBeDefined();
    expect(guarded[0].outcomes).toBeDefined();
  });

  it("passes candidates through untouched when there is no matching existing project (a genuinely new project)", () => {
    const cand = mapBuildToProject(COCKPIT_BUILD)!;
    const guarded = guardAgainstOverwritingQuantified([cand], []);
    expect(guarded[0]).toEqual(cand);
  });
});

describe("buildPortfolioCandidates — full pull-side mapping pass", () => {
  it("wires builds/battles/education through the guard and returns candidates + build references", () => {
    const profile = baseProfile({ projects: [projectEntry({ description: "Already has $10.45B quantified.", name: "Portfolio Intelligence Cockpit" })] });
    const result = buildPortfolioCandidates(
      [COCKPIT_BUILD],
      [{ company: "Bain & Company", role: "Project Leader", period: "2025", highlights: ["A bullet."] }],
      { institution: "IIT Delhi", degree: "B.Tech", years: "2015" },
      profile,
    );
    expect(result.projects[0].description).toBeUndefined(); // guarded — existing already quantified
    expect(result.experience).toHaveLength(1);
    expect(result.education).toHaveLength(1);
    expect(result.buildReferences).toEqual([{ name: "Portfolio Intelligence Cockpit", calm: COCKPIT_BUILD.calm }]);
  });
});

describe("renderBuildLiteral / insertBuildIntoSource — PUSH side", () => {
  const draft: PortfolioBuildDraft = {
    name: "New Project", tags: ["Python"], punchline: "Cut costs by 30%.",
    nerd: "A technical description.", process: "A process narrative.", calm: "A calm explanation.",
  };

  it("renders a valid TS object literal with all seven Build fields", () => {
    const literal = renderBuildLiteral({ ...draft, github: "https://github.com/x/y" });
    expect(literal).toContain('name: "New Project"');
    expect(literal).toContain('tags: ["Python"]');
    expect(literal).toContain('punchline: "Cut costs by 30%."');
    expect(literal).toContain('github: "https://github.com/x/y"');
    expect(literal).toContain('nerd: "A technical description."');
    expect(literal).toContain('process: "A process narrative."');
    expect(literal).toContain('calm: "A calm explanation."');
  });

  it("escapes embedded quotes so the generated source stays syntactically valid", () => {
    const literal = renderBuildLiteral({ ...draft, name: 'The "Best" Project', github: "" });
    expect(literal).toContain('name: "The \\"Best\\" Project"');
  });

  it("inserts the new entry just before the array's closing bracket, additive only", () => {
    const source = `export const builds: Build[] = [\n  { name: "Existing" },\n];\n`;
    const result = insertBuildIntoSource(source, { ...draft, github: "" });
    expect(result).toContain('name: "Existing"'); // untouched
    expect(result).toContain('name: "New Project"'); // added
    expect(result.indexOf('name: "Existing"')).toBeLessThan(result.indexOf('name: "New Project"'));
    expect(result.trim().endsWith("];")).toBe(true); // still valid array syntax
  });
});

describe("alreadyOnPortfolio", () => {
  it("matches an exact or fuzzy-similar existing build name", () => {
    const refs = [{ name: "Portfolio Intelligence Cockpit" }];
    expect(alreadyOnPortfolio("Portfolio Intelligence Cockpit", refs)).toBe(true);
    expect(alreadyOnPortfolio("portfolio intelligence cockpit", refs)).toBe(true);
  });

  it("returns false for a genuinely different project name", () => {
    expect(alreadyOnPortfolio("AutoEval", [{ name: "Portfolio Intelligence Cockpit" }])).toBe(false);
  });
});
