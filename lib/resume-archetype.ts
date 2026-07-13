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
  extraSection?: "leadership" | "projects";
};

export const RESUME_SPECS: Record<ResumeArchetype, ResumeSpec> = {
  consulting: {
    label: RESUME_ARCHETYPE_LABELS.consulting,
    sectionOrder: "education-first",
    summaryAllowed: false,
    summaryStyle: "Omit entirely — consulting resumes do not use a summary/objective.",
    bulletPattern: "CAR (Context-Action-Result), max 2 lines, every bullet has a quantified business outcome ($ saved, % uplift, deal size, headcount).",
    emphasize: "Quantified business impact, structured/MECE thinking, executive communication, leadership signals.",
    omit: "Deep technical jargon. No summary/objective section.",
    certificationPolicy: "Omit unless directly relevant to the target firm's practice area (e.g. a CFA for a corp-fin-adjacent case team). Cap at 2.",
    lengthNorm: "Strict one page, even for 15+ years of experience.",
    extraSection: "leadership",
  },
  vc_investing: {
    label: RESUME_ARCHETYPE_LABELS.vc_investing,
    sectionOrder: "education-first",
    summaryAllowed: false,
    summaryStyle: "Omit entirely.",
    bulletPattern: "Thesis + role + concrete result: capital deployed, deals sourced/screened, valuation uplift, portfolio outcome.",
    emphasize: "Deal sourcing volume, financial modeling, investment thesis articulation, any founder/operator experience.",
    omit: "Generic 'analytical skills' language not tied to a named deal or company.",
    certificationPolicy: "Include only CFA/CAIA-type credentials directly signaling investing rigor. Cap at 2.",
    lengthNorm: "Strict one page, even for ex-bankers/consultants moving into investing.",
  },
  product: {
    label: RESUME_ARCHETYPE_LABELS.product,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "Allowed only as a 1-2 line positioning statement for career-switchers into product; otherwise omit.",
    bulletPattern: "Task-Action-Result. Frame as problem -> bet -> outcome. Every bullet needs a product metric (user growth %, retention, revenue, engagement, NPS, time-to-launch).",
    emphasize: "Cross-functional leadership (eng/design/data/GTM), product sense, measurable shipped outcomes. Senior PMs lead with strategy/scope owned; early-career PMs lead with shipped impact.",
    omit: "\"Managed the roadmap\" or similar scope statements with no attached metric.",
    certificationPolicy: "Include only if squarely product-relevant (e.g. a recognized PM certification). Cap at 2.",
    lengthNorm: "Strict one page.",
  },
  ai_ml_engineering: {
    label: RESUME_ARCHETYPE_LABELS.ai_ml_engineering,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "Omit for early/mid-career. Allowed as a 1-2 line summary only for senior ICs, or as a brief objective for career-changers.",
    bulletPattern: "Tech-stack-first, metrics-heavy: latency, uptime %, inference cost, throughput, accuracy lift, users/requests served. Name the specific stack, not generic terms.",
    emphasize: "System design depth, quantified technical impact, named tools/languages/architectures, GitHub/open-source links.",
    omit: "Generic 'built an AI system' phrasing. Consulting-style 'leadership' sections are optional here, not load-bearing.",
    certificationPolicy: "Include cloud/ML platform certifications (AWS/GCP/Azure ML, etc.) only if directly relevant to the JD. Cap at 3.",
    lengthNorm: "Strict one page for IC roles.",
    extraSection: "projects",
  },
  finance_ib: {
    label: RESUME_ARCHETYPE_LABELS.finance_ib,
    sectionOrder: "education-first",
    summaryAllowed: false,
    summaryStyle: "Omit entirely — uniformity is itself the convention in IB; any deviation reads as a negative signal.",
    bulletPattern: "Specifics-then-result: name the analysis/tool used, then the result, in <=2 lines (ideally 1.5). 3-5 bullets per role.",
    emphasize: "Deal experience with named transaction size, technical modeling skill, pedigree/GPA signaling.",
    omit: "Anything stylistically unconventional — no creative formatting, no summary.",
    certificationPolicy: "Include CFA/Series licenses only. Cap at 2.",
    lengthNorm: "Strict one page for analyst/associate. Two pages acceptable only at MD/Director level with an extensive deal sheet.",
  },
  general: {
    label: RESUME_ARCHETYPE_LABELS.general,
    sectionOrder: "experience-first",
    summaryAllowed: true,
    summaryStyle: "2-3 tight lines tied to the target role, leading with the single most relevant proof point.",
    bulletPattern: "Action verb + specific action + quantified outcome where the profile has a number.",
    emphasize: "Whatever the JD's key requirements call for most directly.",
    omit: "Generic filler adjectives and skills the profile doesn't actually support.",
    certificationPolicy: "Include only the 2-3 most JD-relevant certifications; omit the section if none qualify.",
    lengthNorm: "Strict one page.",
  },
};

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
