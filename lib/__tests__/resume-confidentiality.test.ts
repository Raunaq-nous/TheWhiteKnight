import { describe, it, expect } from "vitest";
import {
  applyConfidentialitySubstitutions, applyConfidentialitySubstitutionsToResumeContent,
  runConfidentialityGate, confidentialityGateFailureMessage,
  enforceEmployerLocations, repairEmDashesInDocx, extractDocxText,
  type ProfileRulesConfig,
} from "../resume-confidentiality";
import type { ResumeContent } from "../resume-schema";

function testConfig(overrides: Partial<ProfileRulesConfig> = {}): ProfileRulesConfig {
  return {
    forbiddenTerms: [
      { match: "nuclear utility", replace: "green energy entity", severity: "block" },
      { match: "10 GW", replace: null, severity: "block" },
      { match: "$10.45B", replace: "$10 billion", severity: "block" },
      { match: "CAP Ops", replace: null, severity: "block" },
      { match: "knowledge graph-linked", replace: "AI-based", severity: "block", scope: "consulting" },
      { match: "—", replace: ", ", severity: "block" },
    ],
    neverCite: ["5,232-activity", "$3.8 billion validation"],
    employerLocations: {
      "Bain and Company": "Gurgaon",
      "Aranca": "Mumbai",
      "Evalueserve": "Gurgaon",
    },
    bannedPhrases: ["passionate about", "synergy"],
    ...overrides,
  };
}

describe("applyConfidentialitySubstitutions", () => {
  it("replaces a forbidden term with its mandated substitute", () => {
    const result = applyConfidentialitySubstitutions(
      "Led a capital program for a North American nuclear utility.",
      testConfig(),
    );
    expect(result).toBe("Led a capital program for a North American green energy entity.");
    expect(result).not.toContain("nuclear utility");
  });

  it("is case-insensitive", () => {
    const result = applyConfidentialitySubstitutions("A NUCLEAR UTILITY deal.", testConfig());
    expect(result).toBe("A green energy entity deal.");
  });

  it("leaves block-only terms (no replace value) untouched — nothing to substitute them with", () => {
    const result = applyConfidentialitySubstitutions("Built for a 10 GW plant.", testConfig());
    expect(result).toBe("Built for a 10 GW plant.");
  });

  it("replaces dollar-figure terms containing regex special characters", () => {
    const result = applyConfidentialitySubstitutions("A $10.45B portfolio of projects.", testConfig());
    expect(result).toBe("A $10 billion portfolio of projects.");
  });

  it("applies a scoped rule only within its declared scope", () => {
    const text = "Built a knowledge graph-linked search engine.";
    expect(applyConfidentialitySubstitutions(text, testConfig(), "consulting")).toContain("AI-based");
    expect(applyConfidentialitySubstitutions(text, testConfig(), "product")).toBe(text); // unscoped match, rule doesn't apply
    expect(applyConfidentialitySubstitutions(text, testConfig())).toBe(text); // no archetype given at all
  });

  it("repairs an em dash the same way the docx sweep does, when run over plain text", () => {
    const result = applyConfidentialitySubstitutions("Delivered impact—unlocking investment.", testConfig());
    expect(result).toBe("Delivered impact, unlocking investment.");
  });
});

function baseResumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Jordan Lee",
    contactLine: "jordan@example.com | 555-0100",
    summary: "",
    sectionOrder: "experience-first",
    experience: [],
    education: [],
    skills: [],
    ...overrides,
  } as ResumeContent;
}

describe("applyConfidentialitySubstitutionsToResumeContent — GENERATION-time substitution (ONE-SHOT FIX)", () => {
  it("cleans a forbidden term out of the summary", () => {
    const content = baseResumeContent({ summary: "Delivered a $10.45B portfolio at a nuclear utility." });
    const cleaned = applyConfidentialitySubstitutionsToResumeContent(content, testConfig());
    expect(cleaned.summary).toBe("Delivered a $10 billion portfolio at a green energy entity.");
  });

  it("cleans every experience bullet across every entry", () => {
    const content = baseResumeContent({
      experience: [
        {
          company: "Bain", role: "Consultant", tenure: "2020 - Present", location: "Gurgaon",
          bullets: [
            { sourceBulletId: "b1", text: "Built a $10.45B portfolio cockpit.", priority: 1 },
            { sourceBulletId: "b2", text: "Led capital readiness for a nuclear utility.", priority: 2 },
          ],
        },
      ],
    });
    const cleaned = applyConfidentialitySubstitutionsToResumeContent(content, testConfig());
    expect(cleaned.experience[0].bullets[0].text).toBe("Built a $10 billion portfolio cockpit.");
    expect(cleaned.experience[0].bullets[1].text).toBe("Led capital readiness for a green energy entity.");
  });

  it("cleans skills, projects, keyWins, leadership, and education achievements", () => {
    const content = baseResumeContent({
      skills: [{ category: "Tech", items: ["Built for a nuclear utility"] }],
      projects: [{ sourceBulletId: "p1", name: "Cockpit", description: "A $10.45B portfolio tool." }],
      keyWins: ["Delivered a $10.45B program."],
      leadership: ["Led a nuclear utility taskforce."],
      education: [{ institution: "MIT", degree: "B.Tech", years: "2016", achievements: ["Built for a nuclear utility."] }],
    });
    const cleaned = applyConfidentialitySubstitutionsToResumeContent(content, testConfig());
    expect(cleaned.skills[0].items[0]).toBe("Built for a green energy entity");
    expect(cleaned.projects![0].description).toBe("A $10 billion portfolio tool.");
    expect(cleaned.keyWins![0]).toBe("Delivered a $10 billion program.");
    expect(cleaned.leadership![0]).toBe("Led a green energy entity taskforce.");
    expect(cleaned.education[0].achievements![0]).toBe("Built for a green energy entity.");
  });

  it("a resume cleaned at generation time already passes the confidentiality gate, with zero forbidden terms remaining", () => {
    const content = baseResumeContent({
      summary: "Delivered a $10.45B portfolio at a nuclear utility.",
      experience: [
        {
          company: "Bain", role: "Consultant", tenure: "2020 - Present", location: "Gurgaon",
          bullets: [{ sourceBulletId: "b1", text: "Led capital readiness for a nuclear utility, a $10.45B build.", priority: 1 }],
        },
      ],
    });
    const cleaned = applyConfidentialitySubstitutionsToResumeContent(content, testConfig());
    const wholeText = [
      cleaned.summary,
      ...cleaned.experience.flatMap(e => e.bullets.map(b => b.text)),
    ].join(" ");
    expect(wholeText).not.toContain("$10.45B");
    expect(wholeText).not.toContain("nuclear utility");
    const gate = runConfidentialityGate(wholeText, testConfig());
    expect(gate.ok).toBe(true);
    expect(gate.blockedTerms).toEqual([]);
  });

  it("respects archetype scope, same as the plain-text function", () => {
    const content = baseResumeContent({
      experience: [
        {
          company: "Bain", role: "Consultant", tenure: "2020 - Present", location: "Gurgaon",
          bullets: [{ sourceBulletId: "b1", text: "Built a knowledge graph-linked search engine.", priority: 1 }],
        },
      ],
    });
    const cleanedConsulting = applyConfidentialitySubstitutionsToResumeContent(content, testConfig(), "consulting");
    const cleanedProduct = applyConfidentialitySubstitutionsToResumeContent(content, testConfig(), "product");
    expect(cleanedConsulting.experience[0].bullets[0].text).toContain("AI-based");
    expect(cleanedProduct.experience[0].bullets[0].text).toBe("Built a knowledge graph-linked search engine.");
  });
});

describe("runConfidentialityGate", () => {
  it("fails a resume containing 'nuclear utility'", () => {
    const result = runConfidentialityGate("A North American nuclear utility capital program.", testConfig());
    expect(result.ok).toBe(false);
    expect(result.blockedTerms).toContain("nuclear utility");
  });

  it("passes clean text with no forbidden terms", () => {
    const result = runConfidentialityGate("A North American green energy entity capital program.", testConfig());
    expect(result.ok).toBe(true);
    expect(result.blockedTerms).toEqual([]);
  });

  it("passes once the substitution has already been applied (the normal pipeline order)", () => {
    const substituted = applyConfidentialitySubstitutions("Led work at a nuclear utility.", testConfig());
    const result = runConfidentialityGate(substituted, testConfig());
    expect(result.ok).toBe(true);
  });

  it("fails on a block-only term with no substitute (10 GW)", () => {
    const result = runConfidentialityGate("Delivered for a 10 GW plant.", testConfig());
    expect(result.ok).toBe(false);
    expect(result.blockedTerms).toContain("10 GW");
  });

  it("fails on a never-cite fact even though it has no forbiddenTerms entry", () => {
    const result = runConfidentialityGate("Validated across a 5,232-activity programme.", testConfig());
    expect(result.ok).toBe(false);
    expect(result.blockedTerms).toContain("5,232-activity");
  });

  it("names every offending term at once, not just the first", () => {
    const result = runConfidentialityGate("A nuclear utility and a 10 GW plant and CAP Ops.", testConfig());
    expect(result.blockedTerms).toEqual(expect.arrayContaining(["nuclear utility", "10 GW", "CAP Ops"]));
  });

  it("collects banned phrases as non-blocking warnings, never failing the build on their own", () => {
    const result = runConfidentialityGate("I am passionate about this synergy.", testConfig());
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining(["passionate about", "synergy"]));
  });

  it("respects rule scope — an unscoped archetype does not block a scoped term", () => {
    const text = "Built a knowledge graph-linked search engine.";
    expect(runConfidentialityGate(text, testConfig(), "consulting").ok).toBe(false);
    expect(runConfidentialityGate(text, testConfig(), "product").ok).toBe(true);
  });

  it("still catches an em dash that slipped through unrepaired", () => {
    const result = runConfidentialityGate("Delivered impact—unlocking investment.", testConfig());
    expect(result.ok).toBe(false);
    expect(result.blockedTerms).toContain("—");
  });
});

describe("confidentialityGateFailureMessage", () => {
  it("is a loud message naming every offending term", () => {
    const result = runConfidentialityGate("A nuclear utility and CAP Ops.", testConfig());
    const msg = confidentialityGateFailureMessage(result);
    expect(msg).toContain("CONFIDENTIALITY GATE FAILED");
    expect(msg).toContain("nuclear utility");
    expect(msg).toContain("CAP Ops");
  });
});

describe("enforceEmployerLocations", () => {
  it("overrides Aranca to Mumbai regardless of what the source data says", () => {
    const entries = [{ company: "Aranca", location: "Bangalore" }];
    const result = enforceEmployerLocations(entries, testConfig());
    expect(result[0].location).toBe("Mumbai");
  });

  it("overrides even when the source has no location at all", () => {
    const entries = [{ company: "Aranca", location: null }];
    const result = enforceEmployerLocations(entries, testConfig());
    expect(result[0].location).toBe("Mumbai");
  });

  it("matches regardless of '&' vs 'and' and case", () => {
    const entries = [{ company: "BAIN & COMPANY", location: "Mumbai" }];
    const result = enforceEmployerLocations(entries, testConfig());
    expect(result[0].location).toBe("Gurgaon");
  });

  it("leaves an employer not in the config untouched", () => {
    const entries = [{ company: "Some Other Firm", location: "Nowhere" }];
    const result = enforceEmployerLocations(entries, testConfig());
    expect(result[0].location).toBe("Nowhere");
  });

  it("does not mutate the input array or its entries", () => {
    const entries = [{ company: "Aranca", location: "Bangalore" }];
    const snapshot = JSON.stringify(entries);
    enforceEmployerLocations(entries, testConfig());
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

describe("em-dash repair sweep on a real .docx zip (repairEmDashesInDocx / extractDocxText)", () => {
  async function buildFakeDocx(bodyXml: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const JSZip = require("jszip");
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document><w:body>${bodyXml}</w:body></w:document>`,
    );
    return zip.generateAsync({ type: "nodebuffer" });
  }

  it("replaces every em dash in word/document.xml with ', ' and rewrites the zip", async () => {
    const docx = await buildFakeDocx("<w:t>Delivered impact—unlocking investment—for the client.</w:t>");
    const repaired = await repairEmDashesInDocx(docx);
    const text = await extractDocxText(repaired);
    expect(text).not.toContain("—");
    expect(text).toContain("Delivered impact, unlocking investment, for the client.");
  });

  it("leaves a docx with no em dashes byte-identical in content (round-trips cleanly)", async () => {
    const docx = await buildFakeDocx("<w:t>Clean bullet with no dashes.</w:t>");
    const repaired = await repairEmDashesInDocx(docx);
    const text = await extractDocxText(repaired);
    expect(text).toContain("Clean bullet with no dashes.");
  });

  it("an em dash introduced into document.xml is repaired BEFORE the confidentiality gate would see it", async () => {
    const docx = await buildFakeDocx("<w:t>Outcome—achieved.</w:t>");
    const repaired = await repairEmDashesInDocx(docx);
    const text = await extractDocxText(repaired);
    const gate = runConfidentialityGate(text, testConfig());
    expect(gate.ok).toBe(true);
  });

  it("without the repair sweep, the same em dash would fail the gate (proves the sweep is load-bearing)", async () => {
    const docx = await buildFakeDocx("<w:t>Outcome—achieved.</w:t>");
    const unrepairedText = await extractDocxText(docx);
    const gate = runConfidentialityGate(unrepairedText, testConfig());
    expect(gate.ok).toBe(false);
  });
});
