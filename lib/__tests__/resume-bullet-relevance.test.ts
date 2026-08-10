import { describe, it, expect } from "vitest";
import { computeBulletRelevanceHints, renderRelevanceHintsBlock, rankProfileForResume } from "../resume-bullet-relevance";
import type { Profile } from "../profile";
import type { Application } from "../store";

const NUCLEAR_BULLET =
  "Delivered multi-plant capital program strategy for North American nuclear utility: built decision model for running successful capital programs, designed governance and contractor selection framework, delivered board-level recommendation for a multi-billion-dollar program";
const AI_PLATFORM_BULLET =
  "Built and shipped integrated agentic AI platform: RAG-based document intelligence engine for contract and regulatory libraries, multi-agent automated workplan generator, AI financial and cost modeling engine, knowledge graph-linked schedule optimization platform, capital allocation opportunity trigger system. Stack: Python, LangChain, Streamlit.";
const SOLAR_BULLET =
  "Identified CapEx and OpEx optimization levers for utility-scale solar project: built investment-committee-ready P&L case for capital reallocation, produced IRR improvement roadmap and schedule interventions";
const UNRELATED_BULLET = "Organized the quarterly all-hands offsite for a 40-person team";

function richMultiRoleProfile(): Profile {
  return {
    name: "Jordan Lee",
    headline: "",
    email: "jordan@example.com",
    phone: "",
    location: "",
    locationsOpenTo: "",
    yearsOfExperience: "7",
    experience: [
      {
        id: "e1",
        company: "Bain & Company",
        role: "Consultant",
        tenure: "2020 - Present",
        location: "",
        current: true,
        bullets: [AI_PLATFORM_BULLET, UNRELATED_BULLET, NUCLEAR_BULLET, SOLAR_BULLET].join("\n"),
      },
      {
        id: "e2",
        company: "Aranca",
        role: "Analyst",
        tenure: "2016 - 2020",
        location: "",
        current: false,
        bullets: ["Built a market-sizing model for a consumer goods client", "Led a team of 3 junior analysts on a due-diligence engagement"].join("\n"),
      },
    ],
    education: [],
    skills: {},
    projects: [
      { id: "p1", name: "AI Resume Tool", description: "Built and shipped an AI platform automating resume tailoring", stack: "", outcomes: "" },
      { id: "p2", name: "Capital Tracker", description: "Tracked capital allocation and cost optimization across a $10B portfolio", stack: "", outcomes: "" },
    ],
    publications: [],
    certifications: [],
    voiceNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  } as Profile;
}

function baseProfile(): Profile {
  return {
    ...richMultiRoleProfile(),
    experience: [
      {
        id: "e1", company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "", current: true,
        bullets: [NUCLEAR_BULLET, AI_PLATFORM_BULLET].join("\n"),
      },
    ],
    projects: [],
  } as Profile;
}

function baseApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "app1",
    slug: "mck-capital-excellence",
    company: "McKinsey",
    role: "Capital Excellence Consultant",
    location: "New York, NY",
    remote: false,
    status: "sourced",
    score: 0,
    bucket: "strategy",
    bucketName: "Strategy / Consulting",
    sector: "consulting",
    seniority: "senior",
    sourceUrl: "",
    capturedAt: "2025-01-01T00:00:00.000Z",
    jdRaw: "",
    jdParsed: {
      keyRequirements: ["capital project delivery", "cost and schedule optimization"],
      technicalSkills: [],
      softSkills: [],
      yearsExperienceRequired: null,
      redFlags: [],
      keywords: ["capital", "excellence", "capital allocation", "cost optimization", "schedule optimization", "operations"],
    },
    nextAction: "",
    contacts: [],
    interviews: [],
    reminders: [],
    resumeVersions: [],
    notes: "",
    emailEvents: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as Application;
}

describe("computeBulletRelevanceHints", () => {
  it("flags the AI-platform bullet as tool-building and the nuclear-program bullet as not", () => {
    const hints = computeBulletRelevanceHints(baseProfile(), baseApp());
    expect(hints).toHaveLength(2);
    const nuclear = hints.find(h => h.text === NUCLEAR_BULLET)!;
    const aiPlatform = hints.find(h => h.text === AI_PLATFORM_BULLET)!;
    expect(nuclear.toolBuilding).toBe(false);
    expect(aiPlatform.toolBuilding).toBe(true);
  });

  it("confirms the real bug evidence: raw keyword overlap alone scores the tool-building bullet higher than the direct-delivery bullet", () => {
    // The exact numerically-verified finding behind BUG 1: naive keyword
    // overlap ranks the wrong bullet higher — which is why rankProfileForResume
    // below buckets by direct-delivery-vs-tool-building BEFORE using overlap.
    const hints = computeBulletRelevanceHints(baseProfile(), baseApp());
    const nuclear = hints.find(h => h.text === NUCLEAR_BULLET)!;
    const aiPlatform = hints.find(h => h.text === AI_PLATFORM_BULLET)!;
    expect(aiPlatform.keywordOverlap).toBeGreaterThan(nuclear.keywordOverlap);
  });
});

describe("renderRelevanceHintsBlock", () => {
  it("labels TOOL-BUILDING bullets, impact tier, and explains the ordering (impact first, then tool-building demotion)", () => {
    const block = renderRelevanceHintsBlock(computeBulletRelevanceHints(baseProfile(), baseApp()));
    expect(block).toContain("TOOL-BUILDING");
    expect(block).toContain("DETERMINISTIC RELEVANCE RANKING");
    expect(block).toContain("QUANTIFIED");
    expect(block).toContain("still ranks behind a same-tier bullet that directly delivers");
  });

  it("returns an empty string for no hints", () => {
    expect(renderRelevanceHintsBlock([])).toBe("");
  });
});

describe("rankProfileForResume — deterministic pre-ranking pass", () => {
  it("never drops any bullet or project — full multi-bullet, multi-role profile survives intact", () => {
    const profile = richMultiRoleProfile();
    const ranked = rankProfileForResume(profile, baseApp(), "consulting");
    expect(ranked.experience).toHaveLength(2);
    const bainBulletCount = ranked.experience[0].bullets.split("\n").filter(Boolean).length;
    expect(bainBulletCount).toBe(4);
    expect(ranked.experience[1].bullets.split("\n").filter(Boolean)).toHaveLength(2);
    expect(ranked.projects).toHaveLength(2);
    // Every original bullet text is still present somewhere.
    expect(ranked.experience[0].bullets).toContain(NUCLEAR_BULLET);
    expect(ranked.experience[0].bullets).toContain(AI_PLATFORM_BULLET);
    expect(ranked.experience[0].bullets).toContain(SOLAR_BULLET);
    expect(ranked.experience[0].bullets).toContain(UNRELATED_BULLET);
  });

  it("drops an experience entry flagged excludeFromResume — the ONLY case where an entry is actually dropped, not just reordered", () => {
    const profile = richMultiRoleProfile();
    profile.experience.push({
      id: "e3", company: "Delbomblr Inc", role: "Business Consultant", tenure: "Feb 2018 - Jun 2019",
      location: "", current: false, bullets: "", excludeFromResume: true,
    });
    const ranked = rankProfileForResume(profile, baseApp(), "consulting");
    expect(ranked.experience).toHaveLength(2); // the 3rd (excluded) entry never appears
    expect(ranked.experience.some(e => e.company === "Delbomblr Inc")).toBe(false);
  });

  it("keeps an entry with no excludeFromResume flag (default: shown)", () => {
    const profile = richMultiRoleProfile();
    const ranked = rankProfileForResume(profile, baseApp(), "consulting");
    expect(ranked.experience.every(e => !e.excludeFromResume || false)).toBe(true);
    expect(ranked.experience).toHaveLength(2);
  });

  it("for a capital-projects JD, ranks capital-delivery bullets above the tool-building bullet and above an unrelated bullet", () => {
    const profile = richMultiRoleProfile();
    const ranked = rankProfileForResume(profile, baseApp(), "consulting");
    const order = ranked.experience[0].bullets.split("\n").filter(Boolean);
    const nuclearIdx = order.indexOf(NUCLEAR_BULLET);
    const solarIdx = order.indexOf(SOLAR_BULLET);
    const aiIdx = order.indexOf(AI_PLATFORM_BULLET);
    const unrelatedIdx = order.indexOf(UNRELATED_BULLET);

    expect(nuclearIdx).toBeGreaterThanOrEqual(0);
    expect(solarIdx).toBeGreaterThanOrEqual(0);
    expect(nuclearIdx).toBeLessThan(aiIdx);
    expect(solarIdx).toBeLessThan(aiIdx);
    expect(nuclearIdx).toBeLessThan(unrelatedIdx);
    expect(solarIdx).toBeLessThan(unrelatedIdx);
  });

  it("ranks the capital-relevant project above the AI-tool project for a capital-projects JD", () => {
    const profile = richMultiRoleProfile();
    const ranked = rankProfileForResume(profile, baseApp(), "consulting");
    expect(ranked.projects![0].name).toBe("Capital Tracker");
  });

  it("does NOT demote tool-building bullets when the archetype's core work IS building AI tools, once impact tier is equal", () => {
    // NUCLEAR_BULLET's quantified outcome (impact bucket 2) legitimately
    // outranks AI_PLATFORM_BULLET's qualitative-only one (bucket 1)
    // regardless of tool-building demotion (BUG 3: impact density is
    // checked before the tool-building demotion, not instead of it) — so
    // this test isolates the demotion effect with two same-impact-tier,
    // same-overlap bullets that differ ONLY in whether they're tool-building.
    const TOOL_BUILDING_BULLET = "Built and shipped an internal automation tool, enabling faster contract review cycles.";
    const DIRECT_DELIVERY_BULLET = "Directly delivered contract review recommendations, enabling faster cycles for the client.";
    const profile: Profile = {
      ...baseProfile(),
      experience: [{
        id: "e1", company: "Bain & Company", role: "Consultant", tenure: "2020 - Present", location: "", current: true,
        bullets: [TOOL_BUILDING_BULLET, DIRECT_DELIVERY_BULLET].join("\n"),
      }],
    };

    const rankedDemoted = rankProfileForResume(profile, baseApp(), "consulting");
    const demotedOrder = rankedDemoted.experience[0].bullets.split("\n").filter(Boolean);
    expect(demotedOrder[0]).toBe(DIRECT_DELIVERY_BULLET); // tool-building demoted behind direct delivery

    const rankedForAI = rankProfileForResume(profile, baseApp(), "ai_ml_engineering");
    const aiOrder = rankedForAI.experience[0].bullets.split("\n").filter(Boolean);
    expect(aiOrder[0]).toBe(TOOL_BUILDING_BULLET); // demotion disabled — tool-building bullet keeps its slot
  });

  it("does not mutate the input profile", () => {
    const profile = richMultiRoleProfile();
    const snapshot = JSON.stringify(profile);
    rankProfileForResume(profile, baseApp(), "consulting");
    expect(JSON.stringify(profile)).toBe(snapshot);
  });
});
