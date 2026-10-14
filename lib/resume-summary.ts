// PROFILE SUMMARY RULES (spec Part 8). At most 3 sentences and about 60
// words:
//   1. Professional identity framed to the target role, years of experience
//      (per yearsByArchetype), current position.
//   2-3. The specific experiences that answer the JD's top requirements,
//      stated concretely.
// Never "first principles", "approaches every engagement", a banned phrase,
// a figure that also appears in a bullet, or JD wording copied wholesale.
//
// summaryViolations is the check; repairSummary is the deterministic last
// resort after the model's one corrective retry (resume-generation-service).

import { bareNumbers } from "./resume-fill";
import { tokens } from "./resume-jd";
import profileRulesConfig from "../config/profile-rules.json";

export const SUMMARY_MAX_SENTENCES = 3;
export const SUMMARY_TARGET_WORDS = 60;
// "About 60 words": a little tolerance before it counts as a violation.
export const SUMMARY_MAX_WORDS = 70;
// A run of this many consecutive JD words is copying, not framing.
const JD_COPY_RUN = 6;

const FILLER_PATTERNS: [RegExp, string][] = [
  [/first[- ]principles?/i, '"first principles"'],
  [/approach(es|ed)? every engagement/i, '"approaches every engagement"'],
];
const EXTRA_BANNED = ["results-oriented", "leveraged", "spearheaded", "synergies", "dynamic professional", "seasoned professional"];

export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).map(s => s.trim()).filter(Boolean);
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

function jdCopyRun(summary: string, jdText: string): string | null {
  const jd = ` ${jdText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  const w = summary.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i + JD_COPY_RUN <= w.length; i++) {
    const run = w.slice(i, i + JD_COPY_RUN).join(" ");
    // Ignore runs that are mostly stopwords: those are grammar, not copying.
    if (tokens(run).size >= 3 && jd.includes(` ${run} `)) return run;
  }
  return null;
}

export type SummaryCheckInput = { bulletTexts: string[]; jdText?: string };

/** Human-readable rule violations; empty when the summary meets every rule. */
export function summaryViolations(summary: string, input: SummaryCheckInput): string[] {
  const out: string[] = [];
  if (!summary.trim()) return out;
  const sentences = splitSentences(summary);
  if (sentences.length > SUMMARY_MAX_SENTENCES) out.push(`${sentences.length} sentences (max ${SUMMARY_MAX_SENTENCES})`);
  const n = words(summary).length;
  if (n > SUMMARY_MAX_WORDS) out.push(`${n} words (about ${SUMMARY_TARGET_WORDS})`);
  for (const [re, label] of FILLER_PATTERNS) if (re.test(summary)) out.push(`uses ${label}`);
  const banned = [...((profileRulesConfig as { bannedPhrases?: string[] }).bannedPhrases ?? []), ...EXTRA_BANNED];
  for (const p of banned) if (summary.toLowerCase().includes(p.toLowerCase())) out.push(`uses banned phrase "${p}"`);
  const bulletNumbers = new Set(input.bulletTexts.flatMap(t => [...bareNumbers(t)]));
  const shared = [...bareNumbers(summary)].filter(x => bulletNumbers.has(x));
  if (shared.length) out.push(`repeats figure(s) already in a bullet: ${shared.join(", ")}`);
  const copied = input.jdText ? jdCopyRun(summary, input.jdText) : null;
  if (copied) out.push(`copies JD wording: "${copied}"`);
  return out;
}

/**
 * Deterministic last resort, never adding text: keeps sentence 1, drops any
 * later sentence that repeats a bullet figure or uses filler, keeps at most
 * 3 sentences, then trims whole sentences to fit the word limit.
 */
export function repairSummary(summary: string, input: SummaryCheckInput): string {
  const bulletNumbers = new Set(input.bulletTexts.flatMap(t => [...bareNumbers(t)]));
  const isBad = (s: string) =>
    [...bareNumbers(s)].some(x => bulletNumbers.has(x)) || FILLER_PATTERNS.some(([re]) => re.test(s));
  const sentences = splitSentences(summary);
  const kept = sentences.filter((s, i) => i === 0 || !isBad(s)).slice(0, SUMMARY_MAX_SENTENCES);
  while (kept.length > 1 && words(kept.join(" ")).length > SUMMARY_MAX_WORDS) kept.pop();
  return kept.join(" ");
}
