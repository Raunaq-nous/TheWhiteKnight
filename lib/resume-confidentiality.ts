// CONFIDENTIALITY AND NAMING GATE — implements Part 1 of
// docs/MASTER-PROFILE-SPEC.md. Not a style preference: it protects client
// confidentiality and internal IP. Any generated artifact containing a
// forbidden term is a FAILED BUILD, not a warning.
//
// Rules live in config/profile-rules.json, not in this file, so the
// operator can extend forbidden terms / employer locations / banned
// phrases without a code change (see the spec's Appendix). This module
// only loads and applies them.
//
// Two separate operations, deliberately kept apart:
//   1. applyConfidentialitySubstitutions — MUTATES text, replacing a
//      forbidden term with its mandated substitute where one exists (e.g.
//      "nuclear utility" -> "green energy entity"). Run this BEFORE the
//      gate, as early in the pipeline as practical.
//   2. runConfidentialityGate — a pure CHECK, never mutates. Fails the
//      build if any forbidden term (substitutable or block-only) is still
//      present, or if a never-cite fact appears at all. This is what
//      actually blocks export — substitution alone is not trusted, in
//      case a term slips through in a form the substitution didn't catch.

import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ForbiddenTermRule = {
  match: string;
  // null = block-only, no auto-fix exists (e.g. omit capacity entirely).
  replace: string | null;
  severity: "block";
  // When set, this rule only applies within that scope (e.g. an
  // archetype name like "consulting") — see resolveArchetypeScope below.
  // Unscoped rules (no `scope` key) always apply.
  scope?: string;
};

export type ProfileRulesConfig = {
  forbiddenTerms: ForbiddenTermRule[];
  neverCite: string[];
  employerLocations: Record<string, string>;
  bannedPhrases: string[];
  // Phase 2 fields — loaded from the same file, not consumed here.
  yearsByArchetype?: Record<string, string>;
  pagesByArchetype?: Record<string, number>;
  sideBuildsAllowed?: string[];
  toolPlacement?: Record<string, string>;
};

const CONFIG_PATH = join(process.cwd(), "config", "profile-rules.json");

let cachedConfig: ProfileRulesConfig | null = null;

/**
 * Loads config/profile-rules.json. Cached after the first read — this file
 * changes only when an operator edits it and redeploys, never at runtime.
 * Every function below also accepts an explicit config override so tests
 * never need to touch the real file on disk.
 */
export function loadProfileRulesConfig(): ProfileRulesConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  cachedConfig = JSON.parse(raw) as ProfileRulesConfig;
  return cachedConfig;
}

/** Test-only escape hatch — forces the next loadProfileRulesConfig() call to re-read the file. */
export function _resetProfileRulesConfigCache(): void {
  cachedConfig = null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleApplies(rule: ForbiddenTermRule, archetype?: string): boolean {
  if (!rule.scope) return true;
  return rule.scope === archetype;
}

/**
 * Replaces every forbidden term that HAS a mandated substitute (rule.replace
 * !== null) with that substitute, case-insensitively. Block-only rules
 * (replace === null) are left untouched here — there is nothing to
 * substitute them WITH; they exist purely to fail runConfidentialityGate
 * below. Scoped rules (e.g. the consulting-only "knowledge graph-linked"
 * naming gate) only apply when `archetype` matches the rule's scope.
 */
export function applyConfidentialitySubstitutions(
  text: string,
  config: ProfileRulesConfig = loadProfileRulesConfig(),
  archetype?: string,
): string {
  let result = text;
  for (const rule of config.forbiddenTerms) {
    if (rule.replace === null) continue;
    if (!ruleApplies(rule, archetype)) continue;
    const pattern = new RegExp(escapeRegExp(rule.match), "gi");
    result = result.replace(pattern, rule.replace);
  }
  return result;
}

export type ConfidentialityGateResult = {
  ok: boolean;
  // Hard-blocking violations: any forbidden term still present (whether or
  // not it had a substitute — substitution should have removed it; if it's
  // still here, something slipped through) plus any never-cite fact.
  blockedTerms: string[];
  // Soft, tone-only hits — never blocks a build (see Part 7 of the spec;
  // these are style guidance, not confidentiality/IP protection).
  warnings: string[];
};

/**
 * The actual HARD gate. Pure — never mutates `text`. Scans for:
 *   - any forbiddenTerms match still present (case-insensitive), honoring
 *     the same scope rule as applyConfidentialitySubstitutions
 *   - any neverCite phrase, verbatim, present at all (these have no
 *     substitute by design — they must never be cited, full stop)
 * and separately collects bannedPhrases as non-blocking warnings.
 *
 * Run this on BOTH the final DOCX text and the extracted PDF text — see
 * app/api/resume/export/route.ts. A build with any blocked term fails,
 * naming every offending term found (not just the first).
 */
export function runConfidentialityGate(
  text: string,
  config: ProfileRulesConfig = loadProfileRulesConfig(),
  archetype?: string,
): ConfidentialityGateResult {
  const blockedTerms: string[] = [];

  for (const rule of config.forbiddenTerms) {
    if (!ruleApplies(rule, archetype)) continue;
    const pattern = new RegExp(escapeRegExp(rule.match), "i");
    if (pattern.test(text)) blockedTerms.push(rule.match);
  }

  for (const fact of config.neverCite) {
    const pattern = new RegExp(escapeRegExp(fact), "i");
    if (pattern.test(text)) blockedTerms.push(fact);
  }

  const warnings: string[] = [];
  for (const phrase of config.bannedPhrases) {
    const pattern = new RegExp(escapeRegExp(phrase), "i");
    if (pattern.test(text)) warnings.push(phrase);
  }

  return { ok: blockedTerms.length === 0, blockedTerms, warnings };
}

export function confidentialityGateFailureMessage(result: ConfidentialityGateResult): string {
  return `CONFIDENTIALITY GATE FAILED — build rejected. Forbidden term(s) found: ${result.blockedTerms.join(", ")}`;
}

// Employer-location enforcement — the most frequently violated fact
// (spec Part 2). Overrides whatever the profile/generated content says,
// unconditionally, for any employer in config.employerLocations.

/**
 * Normalizes a company name for matching against config.employerLocations
 * keys — case-insensitive, "&"/"and" treated the same, punctuation and
 * extra whitespace ignored. "Bain & Company" and "Bain and Company" (and
 * "BAIN AND COMPANY") all match the same canonical entry.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNormalizedLocationMap(employerLocations: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [company, location] of Object.entries(employerLocations)) {
    map.set(normalizeCompanyName(company), location);
  }
  return map;
}

/**
 * Overrides an experience entry's location with the canonical value from
 * config.employerLocations, when its company matches a known employer —
 * regardless of what the profile or generated content says. An employer
 * not in the config is left untouched (this is a hard-coded correction
 * list, not a validator).
 */
export function enforceEmployerLocations<T extends { company: string; location?: string | null }>(
  entries: T[],
  config: ProfileRulesConfig = loadProfileRulesConfig(),
): T[] {
  const locationMap = buildNormalizedLocationMap(config.employerLocations);
  return entries.map(e => {
    const canonical = locationMap.get(normalizeCompanyName(e.company));
    return canonical ? { ...e, location: canonical } : e;
  });
}

// EM-DASH REPAIR SWEEP — spec Part 10 step 2. Detection alone is not
// enough: this actually rewrites the .docx's packed XML so an em dash
// introduced anywhere (including by autocorrect during editing) never
// reaches the PDF at all. A .docx is a zip archive; word/document.xml is
// the document body.

const EM_DASH = "—";

/**
 * Opens the .docx zip, replaces every em dash in word/document.xml with
 * ", ", and rewrites the zip. Returns a NEW buffer — does not mutate the
 * input. A .docx with no em dashes at all round-trips unchanged (byte-for-
 * byte content-wise; the zip is still rebuilt, which is fine since it's
 * about to be converted to PDF regardless).
 */
export async function repairEmDashesInDocx(docxBuffer: Buffer): Promise<Buffer> {
  // require(), not a static import — same convention as pdf-parse
  // elsewhere in this codebase (lib/server/resume-pdf-pipeline.ts):
  // keeps a zip/XML dependency out of the client bundle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(docxBuffer);
  const documentXmlPath = "word/document.xml";
  const file = zip.file(documentXmlPath);
  if (!file) return docxBuffer; // not a well-formed docx — nothing to repair, caller's later steps will fail loudly instead

  const xml = await file.async("string");
  if (!xml.includes(EM_DASH)) return docxBuffer; // nothing to do — avoid an unnecessary re-zip

  const repaired = xml.split(EM_DASH).join(", ");
  zip.file(documentXmlPath, repaired);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Reads word/document.xml's raw text out of a .docx buffer — used to run the confidentiality gate on the pre-conversion document, not just the post-conversion PDF. */
export async function extractDocxText(docxBuffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(docxBuffer);
  const file = zip.file("word/document.xml");
  if (!file) return "";
  const xml = await file.async("string");
  // Strip XML tags to get plain readable text — good enough for a
  // substring/regex scan; this is not used for anything display-facing.
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
