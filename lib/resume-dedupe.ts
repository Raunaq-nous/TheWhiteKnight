// Semantic dedupe between the Key Projects & Impact band and experience
// bullets (BUG C). String-equality/high-Jaccard-on-full-text dedupe misses
// the real failure mode: the SAME engagement described in different words
// in two places (e.g. a terse "Built Series A financial model for EMEA B2B
// marketplace, facilitating a multi-million-dollar raise" key win vs. a
// fuller "Built a Series A financial model for an EMEA B2B marketplace,
// structuring revenue projections, unit economics, and growth thesis..."
// experience bullet) — these share almost no generic verbs/connectors, so a
// whole-text similarity score stays well under any reasonable threshold.
//
// Instead this compares only the DISTINCTIVE vocabulary of each text (after
// stripping common resume verbs/connectors) using containment — intersection
// over the SMALLER set's size, not Jaccard's union — since one side is
// usually much terser than the other and containment is what "the short
// summary's core nouns all appear inside the fuller bullet" actually means.

import { ResumeContent } from "./resume-schema";

const GENERIC_RESUME_WORDS = new Set([
  "built", "build", "led", "lead", "delivered", "deliver", "designed", "design",
  "structured", "structure", "developed", "develop", "identified", "identify",
  "formulated", "formulate", "produced", "produce", "facilitating", "facilitate",
  "facilitated", "enabling", "enable", "enabled", "unlocking", "unlock", "unlocked",
  "delivering", "across", "using", "and", "for", "an", "a", "the", "with", "to",
  "of", "in", "on", "at", "by", "as", "from", "new", "team", "teams", "role",
  "work", "project", "projects", "client", "clients", "company", "via", "into",
]);

function engagementTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !GENERIC_RESUME_WORDS.has(t)),
  );
}

// Containment ratio: how much of the SMALLER token set is found inside the
// larger one. 1.0 = the shorter text's entire distinctive vocabulary is a
// subset of the longer one's — a strong signal they describe the same
// underlying engagement, regardless of how differently they're phrased.
const ENGAGEMENT_OVERLAP_THRESHOLD = 0.5;

export function sameEngagement(a: string, b: string): boolean {
  const ta = engagementTokens(a);
  const tb = engagementTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const containment = intersection / Math.min(ta.size, tb.size);
  return containment >= ENGAGEMENT_OVERLAP_THRESHOLD;
}

/**
 * Removes any experience bullet that describes the SAME engagement as an
 * already-selected Key Projects & Impact item (keyWins + projects) —
 * top-band wins the slot since it renders first/higher on the page. Never
 * empties an entry to zero bullets; if every bullet in a role would be
 * removed, the single least-duplicate one is kept instead.
 */
export function dedupeExperienceAgainstTopBand(content: ResumeContent): ResumeContent {
  const topBandTexts = [
    ...(content.keyWins ?? []),
    ...(content.projects ?? []).map(p => p.description),
  ];
  if (topBandTexts.length === 0) return content;

  const experience = content.experience.map(e => {
    const survivors = e.bullets.filter(b => !topBandTexts.some(t => sameEngagement(t, b.text)));
    if (survivors.length > 0) return { ...e, bullets: survivors };
    // Every bullet collided with a top-band item — keep the single
    // highest-priority one rather than leave the role with nothing.
    if (e.bullets.length === 0) return e;
    const best = [...e.bullets].sort((a, b) => a.priority - b.priority)[0];
    return { ...e, bullets: [best] };
  });

  return { ...content, experience };
}
