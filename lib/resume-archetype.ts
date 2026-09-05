// Role-adaptive resume archetypes. Distinct from Profile.roleType (which drives
// company discovery / other generation) because resume conventions split more
// finely — e.g. Finance and VC/Investing read very differently on a resume
// despite both mapping to Profile.roleType === "finance".
//
// Sourced from: Management Consulted / IGotAnOffer (consulting), Mergers &
// Inquisitions (IB), GrowthEquityInterviewGuide / Leland (VC), Exponent /
// Product School (PM), Jake's Resume + Exponent (AI/ML/engineering).

import { Profile, RoleType } from "./profile";
import type { Application } from "./store";
import type { ResumeContent, ResumeSectionKey } from "./resume-schema";

export type ResumeArchetype =
  | "consulting"
  | "vc_investing"
  | "product"
  | "ai_ml_engineering"
  | "finance_ib"
  | "general";

export const RESUME_ARCHETYPE_LABELS: Record<ResumeArchetype, string> = {
  consulting: "Consulting (MBB / Strategy)",
  vc_investing: "Venture Capital / Investing",
  product: "Product Management",
  ai_ml_engineering: "AI / ML / Engineering",
  finance_ib: "Finance / Investment Banking",
  general: "General",
};

export type ResumeSpec = {
  label: string;
  sectionOrder: "education-first" | "experience-first";
  summaryAllowed: boolean;
  summaryStyle: string;
  bulletPattern: string;
  emphasize: string;
  omit: string;
  certificationPolicy: string;
  lengthNorm: string;
  /** Include a "Key Wins" band: 3-4 highest-impact quantified achievements pulled from across ALL experience. */
  includeKeyWins: boolean;
  /** Definitive top-to-bottom section render order for this archetype (header always first). */
  sectionSequence: ResumeSectionKey[];
  /** What recruiters/screeners in this field specifically scan for, and how. */
  whatScreenersWant: string;
  /** What "quantified impact" concretely means in this field — the units that matter. */
  quantifiedImpactMeaning: string;
  /** Vocabulary/tone conventions specific to this field. */
  languageConventions: string;
  /** Sections this archetype must always include if the data exists. Validated against sectionSequence in tests. */
  mandatorySections: ResumeSectionKey[];
  /** Sections this archetype should never include, regardless of profile data. Validated against sectionSequence in tests. */
  omittedSections: ResumeSectionKey[];
  /**
   * Baseline page ceiling for this archetype, BEFORE the MBB-vs-general
   * consulting split and the under-5-years override (see resolveMaxPages
   * below, which is what callers should actually use — this field alone is
   * not the final answer for "consulting"). Research basis: two-page
   * resumes get 2.3x more callbacks for 10+ years of experience (ResumeGo,
   * 7,712 resumes), 68.6% of recruiters prefer two pages, and no major ATS
   * (Workday, Greenhouse, Lever, iCIMS, Taleo) parses or penalizes page
   * count. consulting here reflects the GENERAL-consulting default (2) —
   * resolveMaxPages narrows it to 1 when the target is specifically MBB.
   */
  maxPages: number;
};

export const RESUME_SPECS: Record<ResumeArchetype, ResumeSpec> = {
  // NOTE: the summary-led, Key-Wins-first consulting structure is a
  // founder-directed override of the classic no-summary/education-first MBB
  // convention from the original research — the operator reviewed both and
  // chose this structure deliberately.
  consulting: {
    label: RESUME_ARCHETYPE_LABELS.consulting,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "EXACTLY 2 lines, max — ties the candidate's background together and names the target role. No meta-commentary about how well past firms match the role, no first-principles cliches, no filler adjectives. Professional, specific, tight.",
    bulletPattern: "2-4 bullets per role, one per DISTINCT engagement/client/deal within that job — never one generic summary bullet for a role that held multiple engagements. Each bullet: strong action verb, PARC/XYZ logic (context, action, measurable result) compressed to ONE line (~150 characters max, ~1.5 lines), ending in a quantified outcome ($ saved, % uplift, deal/program size, headcount, timeline, IRR) or the strongest true scope marker in the profile if no number exists. Never a paragraph — if an engagement needs more depth, that belongs in Key Projects & Impact, not the bullet.",
    emphasize: "A single combined Key Projects & Impact band, positioned right after the summary — the 3-4 biggest quantified, cross-role achievements plus the most relevant projects, together, up top. Quantified business impact, structured/MECE thinking, executive communication.",
    omit: "Deep technical jargon. Certifications (screened almost entirely on pedigree/deal experience here, not credentials). Leadership/activities sections (not part of this layout's fixed one-page budget).",
    certificationPolicy: "Omit entirely — never include a certifications section, for any archetype (blanket product rule).",
    lengthNorm: "One page for MBB (McKinsey, Bain, BCG) — that convention is real and rigid, regardless of years of experience. Two pages for general/Big-4/MNC advisory consulting once the candidate has 5+ years of experience (two-page resumes get 2.3x more callbacks at that seniority, and no major ATS penalizes page count).",
    includeKeyWins: true,
    // Fixed one-page layout, in this exact order: summary, the combined
    // "selectedImpact" band (Key Projects & Impact — keyWins + projects
    // data rendered together under one heading, never as two separate
    // sections), experience, skills, then education LAST. No leadership
    // section — not affordable within the one-page content budget and not
    // part of this layout.
    sectionSequence: ["summary", "selectedImpact", "experience", "skills", "education"],
    whatScreenersWant: "MECE problem-structuring, quantified business impact, executive communication, and peer-institution pedigree (target school + notable prior employer). Screeners scan for ~30-60 seconds, hunting for firm names and numbers before reading closely.",
    quantifiedImpactMeaning: "$ revenue captured or cost saved, % margin/efficiency uplift, deal or program size, timeline compression, headcount/team led, number of workstreams owned.",
    languageConventions: "Precise, structured, action-first, no first person. Consulting-toolkit vocabulary (hypothesis-driven, stakeholder alignment) used sparingly and only when true — never as filler.",
    mandatorySections: ["experience", "education", "skills"],
    omittedSections: ["certifications", "leadership"],
    // Baseline for GENERAL consulting (Accenture, Big 4, MNC advisory) —
    // the default when the target isn't specifically MBB. resolveMaxPages
    // narrows this to 1 for McKinsey/Bain/BCG, where the one-page
    // convention is real and rigid.
    maxPages: 2,
  },
  vc_investing: {
    label: RESUME_ARCHETYPE_LABELS.vc_investing,
    sectionOrder: "education-first",
    summaryAllowed: false,
    summaryStyle: "Omit entirely.",
    bulletPattern: "Thesis + role + concrete result: capital deployed, deals sourced/screened, valuation uplift, portfolio outcome.",
    emphasize: "Deal sourcing volume, financial modeling, investment thesis articulation, any founder/operator experience.",
    omit: "Generic 'analytical skills' language not tied to a named deal or company.",
    certificationPolicy: "Omit entirely — never include a certifications section, for any archetype (blanket product rule).",
    lengthNorm: "Strict one page, even for ex-bankers/consultants moving into investing.",
    includeKeyWins: false,
    sectionSequence: ["education", "experience", "projects", "skills"],
    whatScreenersWant: "Deal judgment: sourcing volume, thesis-writing ability, and either operating experience or technical/financial modeling chops. VC screeners want a signal of a distinctive edge (network, domain expertise, or analytical rigor) — the job is fundamentally pattern-matching founders and deals.",
    quantifiedImpactMeaning: "Capital deployed ($), number of deals sourced/screened/closed, fund size managed, board seats/ownership, portfolio-company outcomes (valuation growth, follow-on rounds raised).",
    languageConventions: "Confident, thesis-driven language (identified, underwrote, led diligence on). Name real companies/deals instead of generic sector language wherever truthfully possible.",
    mandatorySections: ["education", "experience", "skills"],
    omittedSections: ["summary", "certifications"],
    maxPages: 1,
  },
  product: {
    label: RESUME_ARCHETYPE_LABELS.product,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "Allowed only as a 1-2 line positioning statement for career-switchers into product; otherwise omit.",
    bulletPattern: "Task-Action-Result. Frame as problem -> bet -> outcome. Every bullet needs a product metric (user growth %, retention, revenue, engagement, NPS, time-to-launch).",
    emphasize: "Cross-functional leadership (eng/design/data/GTM), product sense, measurable shipped outcomes. Senior PMs lead with strategy/scope owned; early-career PMs lead with shipped impact.",
    omit: "\"Managed the roadmap\" or similar scope statements with no attached metric.",
    certificationPolicy: "Omit entirely — never include a certifications section, for any archetype (blanket product rule).",
    lengthNorm: "One page under 5 years of experience. Two pages acceptable at 5+ years, once there's enough real scope/impact to fill it — never padded to reach the second page.",
    includeKeyWins: false,
    sectionSequence: ["summary", "experience", "projects", "skills", "education"],
    whatScreenersWant: "End-to-end ownership (0-to-1 or scaling), cross-functional leadership, and business-metric fluency. Screeners want to see the candidate speak in outcomes (retention, revenue, engagement), not a list of features shipped.",
    quantifiedImpactMeaning: "User/MAU growth %, retention/churn change, revenue or ARR impact, conversion lift, NPS change, time-to-launch, adoption numbers.",
    languageConventions: "Outcome-first phrasing: 'grew X by Y% by doing Z' rather than 'responsible for X.' Just enough technical fluency to signal credibility — never overclaim engineering depth.",
    mandatorySections: ["experience", "skills"],
    omittedSections: ["certifications"],
    maxPages: 2,
  },
  ai_ml_engineering: {
    label: RESUME_ARCHETYPE_LABELS.ai_ml_engineering,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "Omit for early/mid-career. Allowed as a 1-2 line summary only for senior ICs, or as a brief objective for career-changers.",
    bulletPattern: "Tech-stack-first, metrics-heavy: latency, uptime %, inference cost, throughput, accuracy lift, users/requests served. Name the specific stack, not generic terms.",
    emphasize: "System design depth, quantified technical impact, named tools/languages/architectures, GitHub/open-source links.",
    omit: "Generic 'built an AI system' phrasing. Consulting-style 'leadership' sections are optional here, not load-bearing.",
    certificationPolicy: "Omit entirely — never include a certifications section, for any archetype (blanket product rule).",
    lengthNorm: "One page for IC roles under 5 years. Two pages acceptable at 5+ years of experience with real system-scale evidence to show.",
    includeKeyWins: false,
    sectionSequence: ["summary", "experience", "projects", "skills", "education"],
    whatScreenersWant: "Concrete system-scale evidence and named technologies — often screened by an engineer, not just a recruiter. A generic 'built AI features' bullet reads as an inability to communicate technical depth.",
    quantifiedImpactMeaning: "Latency (ms/p95), uptime/reliability %, model accuracy/F1/AUC lift, inference cost reduction, throughput (req/s), users/requests served at scale, training-time reduction.",
    languageConventions: "Name the stack explicitly (frameworks, languages, infra). Precise engineering verbs (shipped, architected, optimized, scaled) over soft-skill verbs.",
    mandatorySections: ["experience", "projects", "skills"],
    omittedSections: ["certifications"],
    maxPages: 2,
  },
  finance_ib: {
    label: RESUME_ARCHETYPE_LABELS.finance_ib,
    sectionOrder: "education-first",
    summaryAllowed: false,
    summaryStyle: "Omit entirely — uniformity is itself the convention in IB; any deviation reads as a negative signal.",
    bulletPattern: "Specifics-then-result: name the analysis/tool used, then the result, in <=2 lines (ideally 1.5). 3-5 bullets per role.",
    emphasize: "Deal experience with named transaction size, technical modeling skill, pedigree/GPA signaling.",
    omit: "Anything stylistically unconventional — no creative formatting, no summary.",
    certificationPolicy: "Omit entirely — never include a certifications section, for any archetype (blanket product rule).",
    lengthNorm: "Strict one page for analyst/associate (under 5 years). Two pages acceptable at 5+ years — VP and above — with an extensive deal sheet to justify the second page.",
    includeKeyWins: false,
    sectionSequence: ["education", "experience", "skills"],
    whatScreenersWant: "Extremely conservative screeners scanning pedigree signals (school, GPA) and deal reps within ~10 seconds. Any formatting deviation itself reads as a negative signal, since attention to detail is a core IB competency.",
    quantifiedImpactMeaning: "Transaction/deal size ($M/$B), number of deals executed, valuation methodologies applied (DCF/LBO/comps), GPA (used as a literal screen), model complexity.",
    languageConventions: "Formulaic, information-dense, specifics-then-result. No creative verbs, no color — uniformity is the convention, not a limitation to work around.",
    mandatorySections: ["education", "experience", "skills"],
    omittedSections: ["summary", "projects", "leadership", "certifications"],
    // Two pages is acceptable only at MD/Director level with an extensive
    // deal sheet — analyst/associate seniority is handled by the <5-years
    // override in resolveMaxPages, which forces 1 regardless of this base.
    maxPages: 2,
  },
  general: {
    label: RESUME_ARCHETYPE_LABELS.general,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "2-3 tight lines tied to the target role, leading with the single most relevant proof point.",
    bulletPattern: "Action verb + specific action + quantified outcome where the profile has a number.",
    emphasize: "Whatever the JD's key requirements call for most directly.",
    omit: "Generic filler adjectives and skills the profile doesn't actually support.",
    certificationPolicy: "Omit entirely — never include a certifications section, for any archetype (blanket product rule).",
    lengthNorm: "Strict one page.",
    includeKeyWins: false,
    sectionSequence: ["summary", "experience", "projects", "education", "skills"],
    whatScreenersWant: "Whatever this specific job's stated requirements say — there's no default field convention, so mirror the JD's own priorities directly.",
    quantifiedImpactMeaning: "Whatever metric the JD itself emphasizes; default to $/%/scale wherever the profile has real numbers.",
    languageConventions: "Plain, professional, JD-mirrored vocabulary.",
    mandatorySections: ["experience", "education", "skills"],
    omittedSections: ["certifications"],
    maxPages: 1,
  },
};

/**
 * Stamp the archetype's section order onto generated content. Applied
 * deterministically server-side after every generation/refine — never
 * trusted to the model.
 */
export function withArchetypeSequence(content: ResumeContent, archetype: ResumeArchetype): ResumeContent {
  return { ...content, sectionSequence: [...RESUME_SPECS[archetype].sectionSequence] };
}

const KEYWORD_RULES: { archetype: ResumeArchetype; pattern: RegExp }[] = [
  { archetype: "vc_investing", pattern: /\b(venture capital|vc associate|vc analyst|growth equity|investment associate|portfolio (?:company|management)|fund (?:manager|associate)|\bvc\b)\b/i },
  { archetype: "finance_ib", pattern: /\b(investment bank(?:ing)?|m&a|mergers (?:and|&) acquisitions|corporate finance|equity research|ib analyst|\bib\b)\b/i },
  { archetype: "consulting", pattern: /\b(strategy consult|management consult|mckinsey|bain(?:\s*&\s*company)?|bcg|boston consulting)\b/i },
  { archetype: "product", pattern: /\b(product manager|product management|\bpm\b(?!\s*\/))/i },
  { archetype: "ai_ml_engineering", pattern: /\b(machine learning|\bml\b|\bai\b|software engineer|backend engineer|full[\s-]?stack|data scientist|ml engineer)\b/i },
];

function roleTypeToArchetype(roleType: RoleType | undefined): ResumeArchetype {
  switch (roleType) {
    case "strategy-consulting": return "consulting";
    case "product": return "product";
    case "ai-tech":
    case "engineering":
    case "data":
      return "ai_ml_engineering";
    case "finance": return "finance_ib";
    default: return "general";
  }
}

/**
 * Detect the resume archetype for a given application.
 * Precedence: explicit override > JD/company keyword match > profile.roleType > "general".
 */
export function detectResumeArchetype(
  profile: Profile,
  app: Application,
  override?: ResumeArchetype,
): ResumeArchetype {
  if (override) return override;

  const haystack = [
    app.role ?? "",
    app.company ?? "",
    app.sector ?? "",
    ...(app.jdParsed?.keyRequirements ?? []),
  ].join(" ");

  for (const { archetype, pattern } of KEYWORD_RULES) {
    if (pattern.test(haystack)) return archetype;
  }

  return roleTypeToArchetype(profile.roleType);
}

// Named-firm match ONLY — deliberately narrower than the "consulting"
// KEYWORD_RULES entry above (which also matches generic "strategy consult"/
// "management consult" phrasing). Those generic phrases describe general
// consulting (Accenture, Big 4, MNC advisory), not MBB specifically, and
// per the research basis for this page-count rule, consulting defaults to
// general — only an actual McKinsey/Bain/BCG match should invoke the
// MBB one-page convention.
const MBB_PATTERN = /\b(mckinsey|bain(?:\s*&\s*company)?|bcg|boston consulting)\b/i;

/** Is this application's target specifically an MBB firm (McKinsey/Bain/BCG)? */
export function isMbbConsulting(app: Application): boolean {
  const haystack = [
    app.role ?? "",
    app.company ?? "",
    app.sector ?? "",
    ...(app.jdParsed?.keyRequirements ?? []),
  ].join(" ");
  return MBB_PATTERN.test(haystack);
}

/**
 * Parses Profile.yearsOfExperience (free text, e.g. "7+", "5-8 years", "")
 * into a comparable number — the leading digit run, or 0 when unparseable/
 * blank. Same convention already used elsewhere in this codebase (see
 * lib/server/services/automation-service.ts) for consistency; an unknown
 * years-of-experience value is treated as "not yet 5+", which keeps the
 * one-page default rather than assuming seniority that isn't confirmed.
 */
export function parseYearsOfExperience(profile: Profile): number {
  return parseInt((profile.yearsOfExperience || "0").replace(/[^0-9]/g, ""), 10) || 0;
}

// Under-5-years experience threshold for the maxPages override — below
// this, a second page reads as padding regardless of archetype, so the
// resume stays one page no matter what the target company/JD implies.
const MIN_YEARS_FOR_SECOND_PAGE = 5;

/**
 * The actual page ceiling to enforce for THIS application — the one
 * callers should use, not RESUME_SPECS[archetype].maxPages directly.
 * Precedence:
 *   1. Under ~5 years of experience -> 1 page, regardless of archetype.
 *   2. "consulting" specifically -> 1 for MBB (McKinsey/Bain/BCG), 2 for
 *      general consulting (the default when the target isn't named MBB).
 *   3. Otherwise, the archetype's own base maxPages.
 */
export function resolveMaxPages(profile: Profile, app: Application, archetype: ResumeArchetype): number {
  if (parseYearsOfExperience(profile) < MIN_YEARS_FOR_SECOND_PAGE) return 1;

  if (archetype === "consulting") {
    return isMbbConsulting(app) ? 1 : RESUME_SPECS.consulting.maxPages;
  }

  return RESUME_SPECS[archetype].maxPages;
}
