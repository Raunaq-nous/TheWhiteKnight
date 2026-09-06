import { describe, it, expect } from "vitest";
import {
  applyConfidentialitySubstitutions, runConfidentialityGate, confidentialityGateFailureMessage,
  enforceEmployerLocations, repairEmDashesInDocx, extractDocxText,
  type ProfileRulesConfig,
} from "../resume-confidentiality";

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
