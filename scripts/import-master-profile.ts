// ONE-SHOT IMPORT — loads docs/MASTER-PROFILE-SPEC.md's Part 4 career arc
// (plus Part 5 education/publications/certifications and Part 6 skills, if
// thinner in the profile than the spec) into the real profile store.
//
// WHY THIS EXISTS: the spec doc was committed as documentation only — its
// career DATA was never imported into the app's profile. resolveResumeSelections
// (lib/resume-selection.ts) can only emit text that resolves to a real
// profile bullet id; if the AI-build bullets don't exist in the profile,
// they can never appear in a generated resume, no matter what the spec
// document says. This script is what actually gets them into the database.
//
// MERGE, NOT REPLACE: uses the exact same non-destructive diff/merge engine
// every other extraction flow in this app uses (lib/profile-merge.ts's
// diffExtractionAgainstProfile / applyMergeDiffItem) — an existing bullet
// survives untouched, a near-duplicate is skipped (Jaccard similarity
// dedupe), and only genuinely new content is added.
//
// CONFIDENTIALITY: every bullet below is transcribed from Part 4 as
// written, which is ALREADY the confidentiality-safe wording (the whole
// point of that document) — "green energy entity" not "nuclear utility",
// "$10 billion" not "$10.45B", resume-safe tool names throughout. Nothing
// here re-derives that; it trusts the spec's own already-sanitized text.
// Delbomblr Inc has no known content (per the spec: "never fabricate") —
// imported as a real employment-history fact (company/role/tenure) but
// with excludeFromResume: true and no bullets, so it never appears on a
// generated resume while the timeline stays accurate.
//
// USAGE:
//   npx tsx scripts/import-master-profile.ts <userEmail>            # dry run — prints the diff, writes nothing
//   npx tsx scripts/import-master-profile.ts <userEmail> --apply    # prints the diff AND applies it
//
// Reads/writes the same SQLite DB the app itself uses (CAREEROS_DB_PATH /
// CAREEROS_PRIVATE_DIR env vars, same resolution as lib/server/db.ts).

import { profileRepo } from "../lib/server/repositories";
import { getSeedProfile } from "../lib/profile";
import {
  diffExtractionAgainstProfile, applyMergeDiffItem, ExtractedProfileData,
  CandidateExperience, CandidateEducation, CandidatePublication, CandidateCertification, CandidateSkillGroup,
} from "../lib/profile-merge";
import type { Profile, BulletCategory } from "../lib/profile";

// ---------------------------------------------------------------------------
// PART 4 — CAREER ARC, transcribed verbatim from docs/MASTER-PROFILE-SPEC.md.
// Each numbered engagement/build becomes its OWN bullet, outcome clause
// intact — never merged or summarised into a single line per employer.
// ---------------------------------------------------------------------------

type TaggedBullet = { text: string; category: BulletCategory };

function tagged(experience: Omit<CandidateExperience, "bullets">, bullets: TaggedBullet[]): { candidate: CandidateExperience; tags: Record<string, BulletCategory> } {
  return {
    candidate: { ...experience, bullets: bullets.map(b => b.text) },
    tags: Object.fromEntries(bullets.map(b => [b.text, b.category])),
  };
}

const BAIN = tagged(
  { company: "Bain and Company", role: "Project Leader", tenure: "Jun 2025 - Present", location: "Gurgaon" },
  [
    // Consulting engagements (3)
    { category: "consulting_engagement", text: "Led a concept selection study for a national oil and gas company in South America on a stalled upstream asset, building the evaluation framework across financial, technical, and regulatory criteria and authoring the C-suite decision document that unlocked investment on a previously non-feasible project." },
    { category: "consulting_engagement", text: "Led capital program readiness for a North American green energy entity building 10+ plants, covering the financial business case, partnership and ecosystem design, governance model, and delivery readiness across the multi-plant build sequence." },
    { category: "consulting_engagement", text: "Drove performance improvement on a utility-scale solar asset returning below its hurdle rate, isolating CapEx and OpEx optimisation levers and producing an investment-committee-ready case for capital redeployment that lifted project IRR from 6% to the 10% hurdle rate." },
    // AI builds (5)
    { category: "ai_build", text: "Built the Workflow and Workforce Modernization Studio, turning a client's process taxonomy into a full AI transformation blueprint in a single working session, spanning current-state diagnosis, AI-first future-state design, workforce implications, a prioritised roadmap, and an EBITDA value bridge, demonstrated on a documented client session across 118 processes." },
    { category: "ai_build", text: "Built a portfolio and project intelligence cockpit integrating cost, schedule, and risk data with early-warning alerts and an AI stage-gate reviewer, cutting manual review effort by 80% and demonstrated on a $10 billion portfolio of 16 projects across 10+ sites." },
    { category: "ai_build", text: "Built a generative scheduling platform that sequences activities, resolves dependencies, computes critical paths, and levels resources, giving planners an AI-generated optimised schedule in place of manual iteration." },
    { category: "ai_build", text: "Built the Schedule, Cost and Risk Diagnostic AI-enabled toolkit, deployed on Azure cloud, running probabilistic risk simulation and industry-standard schedule quality scoring across 55+ partial and 10 complete live client cases." },
    { category: "ai_build", text: "Built the Capital Projects Intelligence Toolkit, a proprietary knowledge management system spanning 17 capital-project industries and 16,000 projects, with multiple AI agents running benchmarking, risk analysis, value-at-risk checks, and success-recipe identification." },
  ],
);

const ARANCA = tagged(
  { company: "Aranca", role: "Engagement Lead, Growth Advisory", tenure: "Mar 2022 - Jun 2025", location: "Mumbai" },
  [
    // Consulting engagements (13)
    { category: "consulting_engagement", text: "Built a Series A financial model and investor business plan for an EMEA B2B marketplace, covering revenue projections, unit economics, and adjacent market sizing, contributing to a closed multi-million-dollar raise." },
    { category: "consulting_engagement", text: "Led go-to-market strategy for IT infrastructure and software across multiple Indian states and territories, covering AI-based product platform strategy, channel design, and enterprise adoption pathways." },
    { category: "consulting_engagement", text: "Built an M&A roadmap for a global IT services firm, sequencing acquisition targets to improve the valuation multiple and enabling private equity investment." },
    { category: "consulting_engagement", text: "Led bid advisory for a global port operator across three continents, building financial return models and commercial strategy across APAC, Europe, and Africa under differing regulatory regimes." },
    { category: "consulting_engagement", text: "Built a tier-based pricing model for a North American technology firm's carbon credits platform with no clean market comparables, using replacement-cost and market-benchmarking methodology." },
    { category: "consulting_engagement", text: "Led marketing and launch strategy for a global beverage company entering ready-to-drink, covering consumer positioning, channel architecture, pricing, distributor model, and market-by-market sequencing." },
    { category: "consulting_engagement", text: "Led go-to-market and repositioning for an EMEA consumer electronics brand, covering channel strategy, product architecture, and revenue diversification into adjacent categories." },
    { category: "consulting_engagement", text: "Built a multi-year long-range business plan for an EMEA waste management firm, covering infrastructure capital expenditure, supply chain transformation, and return profile." },
    { category: "consulting_engagement", text: "Built an NFT-linked product strategy for a Japanese beverage manufacturer, including a tradable bottle-NFT framework, channel architecture, and partner identification." },
    { category: "consulting_engagement", text: "Built a solution portfolio architecture for a stock trading firm, covering product bundling, tier-based pricing, and a C-suite commercial framework." },
    { category: "consulting_engagement", text: "Led a market attractiveness analysis for an EMEA logistics firm, covering demand forecasts, competitive and supply assessments, and business model evaluation." },
    { category: "consulting_engagement", text: "Led an EMEA ecommerce vertical entry analysis covering market sizing, competitive dynamics, and monetisation feasibility." },
    { category: "consulting_engagement", text: "Served as fractional content marketing assets manager for a global EMEA telecom, combining market research with strategic content initiatives for market presence and sales enablement." },
    // AI builds (4)
    { category: "ai_build", text: "Led the internal AI strategy team, reforming how research and consulting work gets delivered across the firm through in-house tool development, third-party partnerships, and rollout of AI toolkits into everyday analyst and engagement workflows." },
    { category: "ai_build", text: "Built a project economics and cost modelling engine for real-time CapEx, OpEx, and IRR analysis across multiple project concepts at once." },
    { category: "ai_build", text: "Built an AI survey intelligence platform automating the full research lifecycle from questionnaire design through response analysis and executive-ready insight synthesis." },
    { category: "ai_build", text: "Built a document intelligence engine using agentic retrieval and knowledge graphs for source-cited natural language search across large contract and regulatory libraries." },
  ],
);

const EVALUESERVE = tagged(
  { company: "Evalueserve", role: "Business Analyst, Insights and Intelligence", tenure: "Oct 2020 - Nov 2021", location: "Gurgaon" },
  [
    { category: "consulting_engagement", text: "Led product strategy analysis for a global hyperscale technology firm, running competitive analysis of cloud compliance and assurance programmes that directly informed product roadmap decisions and M&A screening." },
    { category: "consulting_engagement", text: "Led India market entry and partner strategy for a hyperscale cloud provider, assessing 10+ global system integrators into a digital readiness framework and tiered engagement model." },
    { category: "consulting_engagement", text: "Led go-to-market and product launch strategy for a major Indian telecom operator entering CPaaS/CCaaS." },
    { category: "consulting_engagement", text: "Led a strategic landscape analysis of EV charging infrastructure, covering key technologies, deployment models, and investment opportunities in an emerging market." },
    { category: "consulting_engagement", text: "Led IT solution spend mapping across the Canadian public sector, building a structured spend taxonomy that identified enterprise engagement opportunities." },
  ],
);

const TECNOVA = tagged(
  { company: "Tecnova India", role: "Strategy Analyst", tenure: "Jul 2019 - Oct 2020", location: "Gurgaon" },
  [
    { category: "consulting_engagement", text: "Led India market entry strategy for a $10 billion French conglomerate across automotive, pharmaceuticals, and consumer electronics simultaneously, covering M&A and joint venture targets, partner origination, and competitive intelligence." },
    { category: "consulting_engagement", text: "Built a personal care startup in-house from zero after being handpicked by the co-founding team, covering product positioning, financial model, and channel architecture against a three-year break-even plan." },
    { category: "consulting_engagement", text: "Built a market sizing framework for the Indian metals market for a US industry association, using import-export data and demand-supply modelling." },
    { category: "consulting_engagement", text: "Led a turnaround strategy for a German automotive parts manufacturer in India, combining Voice of Customer research with an operational diagnostic." },
    { category: "consulting_engagement", text: "Led partner identification and negotiation for a European primary cell manufacturer, securing a contract manufacturing arrangement in India." },
  ],
);

const MADCUE = tagged(
  { company: "Madcue", role: "Co-founder", tenure: "Jun 2015 - Jan 2018", location: "Bangalore" },
  [
    { category: "consulting_engagement", text: "Co-founded and scaled a creator economy and digital media platform to 150+ independent creators and 70,000 monthly viewers, tripling audience in 8 months through structured performance marketing experiments across Facebook and Google." },
    { category: "consulting_engagement", text: "Owned product, technology, operations, content strategy, and creator acquisition end-to-end, building the platform in-house and orchestrating multiple pivots as the market evolved." },
    { category: "consulting_engagement", text: "Defined the brand identity, visual design language, and editorial voice from the ground up, securing exclusive interviews with globally recognised creators including Gavin Aung Than, Abhilash Tomy, and Tashi Malik." },
  ],
);

const ALL_TAGGED = [BAIN, ARANCA, EVALUESERVE, TECNOVA, MADCUE];

export const EXPERIENCE_CANDIDATES: CandidateExperience[] = ALL_TAGGED.map(t => t.candidate);
export const BULLET_TAGS_BY_COMPANY: Record<string, Record<string, BulletCategory>> = Object.fromEntries(
  ALL_TAGGED.map(t => [t.candidate.company, t.tags]),
);

// Delbomblr Inc: genuinely no known content ("never fabricate" per the
// spec). Not run through the diff/merge engine at all (nothing to
// extract) — added directly, once, only if no entry for it exists yet,
// with excludeFromResume so the timeline is accurate without ever
// surfacing on a generated resume.
export const DELBOMBLR = { company: "Delbomblr Inc", role: "Business Consultant", tenure: "Feb 2018 - Jun 2019", location: "Delhi" };

// ---------------------------------------------------------------------------
// PART 5 — education, publications, certifications
// ---------------------------------------------------------------------------

const EDUCATION_CANDIDATES: CandidateEducation[] = [
  {
    institution: "Manipal Institute of Technology",
    degree: "B.Tech",
    field: "Mechanical Engineering",
    years: "2016",
    gpa: "8.0/10.0 CGPA",
    achievements: [
      "Parikshit Student Satellite Team (ISRO-guided, 1 Cr funded), 2013-2016 - ADCS Subsystem Head: designed the full PID control system from scratch including actuators and magnetorquers, using quaternions and Lagrangian mechanics for attitude dynamics modelling of a nano-satellite operating at 28,800 km/hr in polar low-Earth orbit; presented at the IEEE Aerospace Conference, Big Sky, Montana, USA.",
    ],
  },
];

const PUBLICATION_CANDIDATES: CandidatePublication[] = [
  { title: "AI's impact on green manufacturing", publication: "Economic Times", year: "2024" },
  { title: "Digital governance", publication: "Dataquest", year: "2025" },
  { title: "Mechanism, Ensuing Dynamics and Control of a Polar Low-Earth Orbit Tethered Nano-Satellite", publication: "IEEE", year: "2016" },
  { title: "Dynamics and Control System Design of a Polar Low-Earth Orbit Nano-Satellite", publication: "IEEE", year: "2015" },
  { title: "Software in Loop Test Setup for a Tethered Satellite", publication: "IEEE", year: "2015" },
  { title: "Control System Design to Counter the Effect of Tether Ejection System on a Nano-satellite", publication: "IEEE", year: "2015" },
  { title: "Earthquake Stabilization Using Active Control, Structural Dynamics", publication: "IJERT", year: "2014" },
];

const CERTIFICATION_CANDIDATES: CandidateCertification[] = [
  { name: "Claude Certified Architect", issuer: "Anthropic" },
  { name: "Claude Certified Developer", issuer: "Anthropic" },
  { name: "Agent Skills with Anthropic", issuer: "Anthropic" },
  { name: "AI Engineering", issuer: "IBM" },
  { name: "Product Management", issuer: "Microsoft" },
  { name: "Business & Financial Modeling", issuer: "Wharton" },
  { name: "Business Strategy", issuer: "Wharton" },
  { name: "Vector Databases for RAG" },
  { name: "Build RAG Applications" },
  { name: "Agentic AI" },
  { name: "Introduction to Large Language Models" },
  { name: "Performance Improvement Projects for Management Consultants" },
  { name: "CS50 Python", issuer: "Harvard" },
  { name: "Introduction to Git and GitHub", issuer: "Google" },
  { name: "Venture Capital Analyst Fundamentals" },
  { name: "Introduction to IT & Cybersecurity" },
];

// ---------------------------------------------------------------------------
// PART 6 — skills taxonomy
// ---------------------------------------------------------------------------

const SKILL_CANDIDATES: CandidateSkillGroup[] = [
  {
    category: "Strategy and Transformation",
    items: [
      "enterprise process reinvention", "discovery workshops and pain-point diagnosis", "process modelling and taxonomy design",
      "target-state design", "value frameworks and business case modelling", "KPI and benefits realisation",
      "operating model design", "change management and adoption planning", "executive stakeholder management",
      "market entry", "GTM strategy", "M&A advisory", "financial modelling", "investment evaluation",
      "due diligence", "pricing strategy", "commercial diligence", "portfolio strategy", "market sizing",
    ],
  },
  {
    category: "AI and Technology",
    items: [
      "agentic AI and agent architecture design", "multi-agent orchestration", "agentic retrieval and knowledge graphs",
      "Anthropic Claude", "Microsoft Azure", "cloud deployment", "AI governance and access control",
      "Python", "TypeScript", "React", "FastAPI", "SQL", "LangChain", "Next.js", "prompt engineering",
      "vector databases", "Claude Code", "Cursor", "GitHub", "APIs", "custom AI skills",
    ],
  },
];

// ---------------------------------------------------------------------------
// Merge + apply
// ---------------------------------------------------------------------------

export function buildExtraction(): ExtractedProfileData {
  return {
    experience: EXPERIENCE_CANDIDATES,
    education: EDUCATION_CANDIDATES,
    publications: PUBLICATION_CANDIDATES,
    certifications: CERTIFICATION_CANDIDATES,
    skills: SKILL_CANDIDATES,
  };
}

/** Applies bulletTags for a freshly-added experience entry (the diff engine's applyMergeDiffItem has no concept of tags — this is the one piece of glue this script itself owns). */
export function applyBulletTags(profile: Profile): Profile {
  return {
    ...profile,
    experience: profile.experience.map(e => {
      const tags = BULLET_TAGS_BY_COMPANY[e.company];
      if (!tags) return e;
      // Only tag bullets that are ACTUALLY present in this entry's text —
      // never invents a tag for text that isn't there.
      const present = new Set(e.bullets.split("\n").map(b => b.trim()).filter(Boolean));
      const merged: Record<string, BulletCategory> = { ...e.bulletTags };
      for (const [text, category] of Object.entries(tags)) {
        if (present.has(text)) merged[text] = category;
      }
      return { ...e, bulletTags: merged };
    }),
  };
}

function main() {
  const [, , userEmailArg, flag] = process.argv;
  const userEmail = userEmailArg ?? process.env.ADMIN_EMAIL;
  const apply = flag === "--apply";

  if (!userEmail) {
    console.error("Usage: npx tsx scripts/import-master-profile.ts <userEmail> [--apply]");
    process.exit(1);
  }

  const existing = profileRepo.get(userEmail) ?? getSeedProfile();
  const extraction = buildExtraction();
  const diff = diffExtractionAgainstProfile(extraction, existing);

  console.log(`\n=== Master profile import — ${apply ? "APPLYING" : "DRY RUN"} for ${userEmail} ===\n`);
  console.log(`Existing profile: ${existing.experience.length} experience entries, ${existing.education.length} education, ${existing.publications.length} publications, ${existing.certifications.length} certifications, ${Object.keys(existing.skills).length} skill categories.\n`);

  if (diff.length === 0) {
    console.log("Nothing new to merge — every candidate item already matches something in the profile.");
  } else {
    console.log(`${diff.length} diff item(s):\n`);
    for (const item of diff) {
      console.log(`[${item.entityType}/${item.action}] ${item.summary}`);
      console.log(item.preview.split("\n").map(l => `    ${l}`).join("\n"));
      console.log();
    }
  }

  // Delbomblr — added directly (not via the diff engine, nothing to
  // extract), only if no entry for it exists yet.
  const hasDelbomblr = existing.experience.some(e => e.company.toLowerCase().includes("delbomblr"));
  if (!hasDelbomblr) {
    console.log(`[experience/add] Add employment record (no content, excluded from resumes): ${DELBOMBLR.role} at ${DELBOMBLR.company}`);
  }

  if (!apply) {
    console.log("\nDry run only — nothing written. Re-run with --apply to write these changes.");
    return;
  }

  let merged = existing;
  for (const item of diff) merged = applyMergeDiffItem(merged, item);
  if (!hasDelbomblr) {
    merged = {
      ...merged,
      experience: [...merged.experience, {
        id: `delbomblr-${Date.now().toString(36)}`,
        company: DELBOMBLR.company, role: DELBOMBLR.role, tenure: DELBOMBLR.tenure, location: DELBOMBLR.location,
        current: false, bullets: "", excludeFromResume: true,
      }],
    };
  }
  merged = applyBulletTags(merged);

  profileRepo.save(userEmail, merged);

  const after = profileRepo.get(userEmail)!;
  console.log(`\nApplied. Profile now has ${after.experience.length} experience entries, ${after.education.length} education, ${after.publications.length} publications, ${after.certifications.length} certifications, ${Object.keys(after.skills).length} skill categories.`);
  console.log("\nBullets per employer:");
  for (const e of after.experience) {
    const count = e.bullets.split("\n").map(b => b.trim()).filter(Boolean).length;
    console.log(`  ${e.company}: ${count} bullet(s)${e.excludeFromResume ? " (excluded from resumes)" : ""}`);
  }
}

// Only run when executed directly (npx tsx scripts/import-master-profile.ts
// / npm run import:master-profile) — never when imported for testing
// (lib/__tests__/import-master-profile.test.ts imports buildExtraction()
// etc. directly and must not trigger a real DB read/write as a side effect).
if (process.argv[1] && process.argv[1].endsWith("import-master-profile.ts")) {
  main();
}
