import { Profile } from "./profile";
import { Application } from "./store";
import { ResumeArchetype, RESUME_SPECS } from "./resume-archetype";
import { ResumeContent } from "./resume-schema";
import { BulletCandidate } from "./profile-bullet-quality";
import { computeBulletRelevanceHints, renderRelevanceHintsBlock, rankProfileForResume } from "./resume-bullet-relevance";

export type GenerationAction = "resume" | "cover-letter" | "executive-summary" | "problem-solver" | "skill-gap" | "outreach-hm" | "linkedin-dm" | "ceo-cold-email" | "referral-dm" | "refine";

export type ContactProfile = {
  name: string;
  title?: string;
  company: string;
  linkedinUrl?: string;
  location?: string;
  role?: "hiring_manager" | "referral_candidate" | "ceo" | "executive" | "recruiter" | "other";
};

export type AFScoreBlock = {
  score: number;
  reasoning: string;
  evidence?: string[];
  gaps?: string[];
  signals?: string[];
};

export type LegitimacySignal = {
  signal: string;
  finding: string;
  weight: "positive" | "neutral" | "concerning";
};

export type AFScoreResult = {
  archetype: { primary: string; secondary?: string | null };
  scores: {
    cv_match: AFScoreBlock;
    north_star: AFScoreBlock;
    comp: AFScoreBlock;
    culture: AFScoreBlock;
    red_flags: AFScoreBlock;
  };
  global: number;
  recommendation: "apply_immediately" | "apply" | "review_manually" | "skip";
  legitimacy: {
    tier: "high_confidence" | "proceed_with_caution" | "suspicious";
    signals: LegitimacySignal[];
    notes?: string | null;
  };
  jdParsed: {
    keyRequirements: string[];
    technicalSkills: string[];
    softSkills: string[];
    yearsExperienceRequired: number | null;
    redFlags: string[];
    keywords: string[];
  };
  bucket: string;
  bucketName: string;
};

export type SkillGapResult = {
  strongMatches: { skill: string; evidence: string }[];
  partialMatches: { skill: string; gap: string; suggestion: string }[];
  missingSkills: { skill: string; priority: "high" | "medium" | "low"; suggestion: string }[];
  overallReadiness: number;
  headline: string;
};

export type SkillBuilderResult = {
  trackedSkills: {
    name: string;
    category: string;
    currentLevel: "novice" | "intermediate" | "advanced" | "expert";
    targetLevel: "intermediate" | "advanced" | "expert";
    demandFromJDs: number;
    evidence: { source: string; description: string }[];
    progressPercent: number;
    nextMilestone: string;
    estimatedWeeks: number;
    learningPath: { step: number; action: string; resource: string; weeks: number }[];
    priority: "critical" | "high" | "medium" | "low";
  }[];
  topGaps: string[];
  topStrengths: string[];
  recommendedFocus: string;
};

export function buildProfileContext(profile: Profile): string {
  // ALL experiences, ALL bullets — never slice
  const expFull = profile.experience.map(e => {
    const bullets = e.bullets.split("\n").filter(b => b.trim()).map(b => `  - ${b.trim()}`).join("\n");
    return `${e.role} | ${e.company} | ${e.tenure}${e.location ? ` | ${e.location}` : ""}
${bullets}`;
  }).join("\n\n");

  // ALL education entries — explicitly structured
  const educationFull = (profile.education ?? []).map(ed => {
    let line = `${ed.degree}${ed.field ? ` in ${ed.field}` : ""} | ${ed.institution} | ${ed.years}`;
    if (ed.gpa) line += ` | GPA: ${ed.gpa}`;
    if (ed.achievements) line += `\n  Achievements: ${ed.achievements}`;
    return line;
  }).join("\n");

  const skillsList = Object.entries(profile.skills).map(([cat, skills]) =>
    `${cat}: ${skills}`
  ).join("\n");

  const projectsFull = (profile.projects ?? []).map(p =>
    `${p.name}: ${p.description}${p.outcomes ? ` | Outcomes: ${p.outcomes}` : ""} (Stack: ${p.stack})${p.repoUrl ? ` | ${p.repoUrl}` : ""}`
  ).join("\n");

  const certs = (profile.certifications ?? []).map(c =>
    `${c.name} — ${c.issuer} (${c.date})`
  ).join("\n");

  const pubs = (profile.publications ?? []).map(p =>
    `${p.title} — ${p.publication} (${p.year})`
  ).join("\n");

  return `
CANDIDATE PROFILE — SOURCE OF TRUTH (all data below is verified; never add, invent, or extrapolate)
Name: ${profile.name}
Headline: ${profile.headline}
Email: ${profile.email}
Phone: ${profile.phone}
Location: ${profile.location}
Open To: ${profile.locationsOpenTo ?? ""}
Years of Experience: ${profile.yearsOfExperience}
LinkedIn: ${profile.linkedin ?? "(not provided)"}
GitHub: ${profile.github ?? "(not provided)"}
Portfolio/Website: ${profile.portfolio ?? "(not provided)"}

FULL WORK EXPERIENCE (every entry below is real and must be included — do not skip any):
${expFull || "(No experience entries)"}

EDUCATION (copy exactly as written — never alter institution names, degrees, or years):
${educationFull || "(No education entries)"}

SKILLS:
${skillsList || "(Not specified)"}

PROJECTS:
${projectsFull || "(None)"}
${certs ? `\nCERTIFICATIONS:\n${certs}` : ""}${pubs ? `\nPUBLICATIONS:\n${pubs}` : ""}

VOICE AND TONE NOTES:
${profile.voiceNotes ?? ""}
`.trim();
}

export function buildJDContext(app: Application): string {
  const requirements = app.jdParsed?.keyRequirements?.join("\n- ") ?? "Not extracted";
  const techSkills = app.jdParsed?.technicalSkills?.join(", ") ?? "Not extracted";
  const redFlags = app.jdParsed?.redFlags?.length > 0
    ? app.jdParsed.redFlags.join(", ")
    : "None identified";

  return `
JOB DETAILS
Company: ${app.company}
Role: ${app.role}
Location: ${app.location}${app.remote ? " (Remote)" : ""}
Sector: ${app.sector}
Seniority: ${app.seniority}
Bucket: ${app.bucket}

KEY REQUIREMENTS:
- ${requirements}

TECHNICAL SKILLS REQUIRED: ${techSkills}

RED FLAGS: ${redFlags}

RAW JD:
${app.jdRaw ? app.jdRaw.slice(0, 3000) : "(Not available, using structured data above)"}
`.trim();
}

// Shared instruction block for both the initial resume generation and refine
// passes — anything that must hold true regardless of archetype or edit.
const RESUME_BASE_RULES = `ANTI-HALLUCINATION RULES — READ THESE FIRST, VIOLATING THEM IS A CRITICAL ERROR:
1. NEVER invent, guess, or extrapolate ANY fact. Every claim must exist in the CANDIDATE PROFILE.
2. Education: copy institution names, degree names, and years EXACTLY as written in the profile. Do not alter, abbreviate, or guess. Do not add any education entry not listed.
3. Company names: copy exactly. Do not rename, consolidate, or infer employer names.
4. Metrics and numbers: use only numbers from the profile. NEVER invent percentages, revenue figures, team sizes, or timelines.
5. Skills: only list skills that appear in the profile's SKILLS section. Do not add "presumed" skills.
6. Projects: only reference projects listed in the profile. Do not fabricate project names.

VOICE — the candidate's own voice/tone notes are binding style law, not background color. Follow them exactly, including any banned words or phrasing they list.

STYLE RULES:
- No em dashes. No smart quotes. No unicode bullets — plain hyphens only.
- Banned: "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded", "facilitated", "synergies", "cutting-edge", "innovative solutions", "self-starter".
- Vary verbs. Do not start two consecutive bullets with the same word.`;

function resumeOutputFormatInstructions(): string {
  return `OUTPUT — a single JSON object, nothing before or after, matching exactly this shape:
{
  "name": string,
  "contactLine": string (pre-joined "email | phone" ONLY — NEVER include location, "open to" preferences, or links in this string; links go in the links array),
  "links": [ { "label": string, "url": string } ] (LinkedIn, Portfolio, GitHub from the profile — copy URLs exactly; omit key entirely if the profile has none),
  "summary": string,
  "targetPriorities": string[] (the 3-5 things this JD most values, from your Step 1 analysis),
  "subFocus": string (the specific sub-focus/practice-area of THIS role within its archetype, from your Step 1 analysis — 1 short phrase, e.g. "Capital Excellence: capital project delivery, cost/schedule optimization"),
  "keyWins": string[] (optional — only when the archetype instructions call for a Key Wins/Key Projects & Impact band; omit key entirely otherwise; one line each, part of the same 3-4 total item budget as "projects" below),
  "sectionOrder": "education-first" | "experience-first",
  "experience": [ { "company": string, "role": string, "tenure": string, "location": string, "bullets": [ { "text": string, "priority": number } ] } ] (1-2 bullets per entry, each ONE line — see ONE-PAGE CONTENT BUDGET),
  "education": [ { "institution": string, "degree": string, "field": string, "years": string, "gpa": string (optional), "achievements": string[] (optional) } ],
  "skills": [ { "category": string, "items": string[] } ],
  "projects": [ { "name": string, "description": string, "repoUrl": string (optional) } ] (optional, omit key entirely if not used),
  "certifications": [ { "name": string, "issuer": string (optional), "date": string (optional) } ] (optional, omit key entirely if none qualify)
}

Do NOT output a "sectionSequence" field — the system sets the final section order from the archetype spec.

BULLET PRIORITY — every bullet needs a "priority" integer: 1 = most relevant to this JD, must survive any cut. Higher numbers = progressively safer to cut first if the page runs long. Rank every bullet honestly; do not mark everything priority 1.

Output the JSON now. No preamble, no markdown code fence, no explanation.`;
}

export function resumePrompt(profile: Profile, app: Application, archetype: ResumeArchetype): string {
  const atsKeywords = app.jdParsed?.keywords?.join(", ") ?? "";
  const keyReqs = app.jdParsed?.keyRequirements?.join("; ") ?? "";
  const techSkills = app.jdParsed?.technicalSkills?.join(", ") ?? "";
  const expCount = profile.experience.length;
  const spec = RESUME_SPECS[archetype];
  // Deterministic pre-ranking pass (BUG 1 fix): reorders every entry's bullets
  // and every project by relevance to this JD — never drops anything, the
  // FULL profile still reaches the prompt below, just with the most relevant
  // material first so the model selects/writes from ranked complete data
  // instead of an unranked list it has to judge cold.
  const rankedProfile = rankProfileForResume(profile, app, archetype);
  const relevanceHintsBlock = renderRelevanceHintsBlock(computeBulletRelevanceHints(rankedProfile, app));

  return `You are a senior resume strategist specializing in ${spec.label} hiring. Write a tailored resume for ${profile.name} applying for the ${app.role} role at ${app.company}.

${buildProfileContext(rankedProfile)}

---

${buildJDContext(app)}

${relevanceHintsBlock ? `---\n\n${relevanceHintsBlock}` : ""}

${atsKeywords ? `ATS KEYWORDS — weave these exact phrases in naturally: ${atsKeywords}` : ""}
${keyReqs ? `MUST-COVER REQUIREMENTS: ${keyReqs}` : ""}
${techSkills ? `MUST-LIST TECH SKILLS (only if candidate actually has them per profile): ${techSkills}` : ""}

---

STEP 1 — JD ANALYSIS (do this BEFORE writing anything). Go deeper than the archetype label — two roles in the same archetype (e.g. two consulting roles) can have completely different sub-focuses and must NOT produce interchangeable resumes:

1a. SUB-FOCUS: read the role title, the JD's own section headers/practice-area language, and the key requirements. Identify the SPECIFIC sub-focus or practice area of THIS role beyond the generic archetype — e.g. a "Capital Excellence" consulting role is about capital project delivery, cost/schedule optimization, and capital allocation; a "Performance Improvement" consulting role at the same firm is about operational turnaround and cost reduction. Name this specifically in the "subFocus" output field. If the JD gives no such signal, describe the narrowest specific slice of the archetype the requirements point to.
1b. TARGET PRIORITIES: from that sub-focus, identify the 3-5 things THIS specific role most values. Put them in "targetPriorities".
1c. SELECT AND FOREGROUND: using the sub-focus (not the generic archetype) as the lens, choose the experiences, bullets, and projects that most directly evidence it — those come first and get the lowest priority numbers. A generic "led a project" bullet that doesn't touch the sub-focus should rank low even if it's a strong bullet for some other job.
1d. FRAME to mirror: phrase each bullet in the JD's own vocabulary where truthful — mirror what the role and its sub-focus call the work, never generic language the profile happens to use.
1e. Everything must remain true to the profile. Reframing and re-selecting what to foreground is expected and required; inventing a fact or metric is not.

${RESUME_BASE_RULES}

WHAT SCREENERS IN THIS FIELD ACTUALLY WANT: ${spec.whatScreenersWant}

WHAT "QUANTIFIED IMPACT" MEANS HERE — prefer these units of proof over generic phrasing: ${spec.quantifiedImpactMeaning}

LANGUAGE CONVENTIONS FOR THIS FIELD: ${spec.languageConventions}

ONE-PAGE CONTENT BUDGET — this resume is generated to fit ONE page from the start, not trimmed after the fact. Write within these limits directly; a server-side clamp enforces them afterward as a backstop, but writing over budget just means your best material gets cut arbitrarily instead of by your own judgment:
- Summary: 2-3 lines, ~300 characters max.
- Key Projects & Impact (if this archetype uses it): 3-4 items total, ONE line each.
- Experience: EVERY entry must appear, but each entry gets only 1-2 bullets, and EVERY bullet is ONE line (~120-140 characters) — a crisp, compressed clause, never a paragraph. If a project needs more than one line of detail, that detail belongs in Key Projects & Impact, not stretched into a giant experience bullet.
- Skills: max 3 categories, max 6 items each.
- Education: one line per entry (institution/degree/years), no achievements bullets.

EXPERIENCE INCLUSION RULES:
- There are ${expCount} experience entries in the profile. You MUST include ALL ${expCount} of them, each trimmed to its 1-2 strongest bullets per the budget above.
- The bullets under each entry above are already deterministically pre-ranked by relevance to this JD (most relevant first, per entry) — see DETERMINISTIC RELEVANCE RANKING below. Pick from the top of that ranking for each entry, then apply the SUB-FOCUS lens to refine the choice; do not ignore the ranking and pick arbitrarily.
- Direct delivery beats tool-building when both are plausible picks: if two bullets from the same entry could both fill a slot, prefer the one where the candidate directly did the JD's core work over one that describes building a tool or platform that merely touches similar topics. See the DETERMINISTIC RELEVANCE RANKING above for where this specifically applies.
- MUST NOT drop entire experience entries, even a weak one — trim its bullets instead.
- Preserve the exact company name and tenure for every entry.

NO REPETITION — if a fact, project, or number appears in Key Projects & Impact, do NOT also restate it (even paraphrased) in the summary or in an experience bullet. Each fact lives in exactly one place. Pick the single best home for it: the Key Projects & Impact band if it's a headline win, otherwise the relevant experience bullet.

PROFILE SUMMARY:
- ${spec.summaryAllowed ? spec.summaryStyle : "Do NOT include a summary for this archetype — omit it (set \"summary\" to an empty string). " + spec.summaryStyle}
- If a summary is written: 2-3 lines MAX (~300 characters), a crisp positioning statement — what the candidate does, plus the single strongest proof point for THIS role. NEVER meta-commentary about how well past firms or experience "match" this role or "exactly what this role asks" — just state the positioning directly. NEVER filler like "approaches every engagement from first principles" or similar generic consultant-speak. No filler adjectives, never generic, and never a fact already used in Key Projects & Impact.

ARCHETYPE — ${spec.label}:
- MANDATORY SECTIONS (include if the profile has any data for them): ${spec.mandatorySections.join(", ")}.
- NEVER INCLUDE: ${spec.omittedSections.length > 0 ? spec.omittedSections.join(", ") : "(no sections banned for this archetype)"}.
- SECTION ORDER (enforced by the renderer, listed so you write for it): ${spec.sectionSequence.join(" -> ")}.
- BULLET STYLE: ${spec.bulletPattern}
- EMPHASIZE: ${spec.emphasize}
- OMIT: ${spec.omit}
- CERTIFICATIONS: ${spec.certificationPolicy}
${spec.sectionSequence.includes("selectedImpact") ? '- KEY PROJECTS & IMPACT — MANDATORY, this is not optional for this archetype, and it renders as a HIGHLIGHTED block immediately after the summary, before experience. Populate BOTH fields, they render together under ONE combined heading, never as two separate sections: a "keyWins" array of the highest-impact, quantified achievements pulled from across ALL experience entries (not just the current role), AND a "projects" array with ONLY the profile projects that most directly match THIS role\'s sub-focus. 3-4 items TOTAL across both arrays combined, ONE line each, most relevant first, each with a real number from the profile where the profile has one. This is the most relevant material for THIS specific JD, ranked and pulled from the full profile — not an afterthought. Do not leave "keyWins" empty when the profile has quantified achievements available — search across every experience entry for them.' : ""}
${(!spec.sectionSequence.includes("selectedImpact") && spec.includeKeyWins) ? '- KEY WINS: include a "keyWins" array of the 3-4 highest-impact, quantified achievements pulled from across ALL experience entries (not just the current role). Each one line, each with a real number from the profile. These are the resume\'s headline band — pick the wins that best match THIS role\'s sub-focus, not generic wins.' : ""}
${(!spec.sectionSequence.includes("selectedImpact") && spec.sectionSequence.includes("projects")) ? '- RELEVANT PROJECTS: include a "projects" array with ONLY the 2-4 profile projects that most directly match THIS role\'s sub-focus, one line each, most relevant first. If no project genuinely matches, omit the key.' : ""}
${spec.sectionSequence.includes("leadership") ? '- LEADERSHIP & ACTIVITIES: include a "leadership" array of 2-3 bullets proving ability to mobilize/lead people — drawn only from real profile content (roles, projects, or education achievements that genuinely show this, e.g. team leadership, mentoring, extracurricular leadership). Do not invent an activity that is not in the profile; omit the key if the profile has nothing that qualifies.' : ""}

HEADER: the contactLine carries ONLY email | phone. NEVER put location or "open to" preferences anywhere in the header — the location field on the candidate profile is for internal use only, it does not belong on the resume.

LINKS: put LinkedIn/Portfolio/GitHub URLs from the profile in the "links" array (label + exact URL).

SKILLS: maximum 3 categories, each with no more than 6 items. Do not pad this section.

${resumeOutputFormatInstructions()}`;
}

export function resumeRefinePrompt(
  profile: Profile,
  app: Application,
  archetype: ResumeArchetype,
  currentContent: ResumeContent,
  instruction: string,
): string {
  const spec = RESUME_SPECS[archetype];
  return `You are refining a ${spec.label} resume for ${profile.name} applying to the ${app.role} role at ${app.company}.

${buildProfileContext(profile)}

---

CURRENT RESUME (JSON):
${JSON.stringify(currentContent, null, 2)}

---

USER REFINEMENT INSTRUCTION:
${instruction}

---

${RESUME_BASE_RULES}

RULES:
1. Apply ONLY what the instruction requests. Do not rewrite parts that were not mentioned.
2. NEVER invent facts, metrics, education, or experience not in the CANDIDATE PROFILE.
3. Education, company names, and tenures must remain exactly as in the profile unless the instruction specifically targets them.
4. Keep every experience entry present (you may add/remove/reprioritize bullets, never drop an entire entry) unless the instruction says otherwise.
5. Preserve the "priority" ranking convention: 1 = most relevant, higher = more cuttable. Re-rank if the instruction changes emphasis (e.g. "emphasize AI" should lower the priority number on AI-relevant bullets).
6. Preserve the existing "subFocus" and "targetPriorities" fields unless the instruction specifically asks to change what this resume targets.

ARCHETYPE reference (still applies unless the instruction overrides it): section order ${spec.sectionOrder}, summary ${spec.summaryAllowed ? "allowed" : "omitted"}, certifications: ${spec.certificationPolicy}, mandatory sections: ${spec.mandatorySections.join(", ")}, never include: ${spec.omittedSections.length > 0 ? spec.omittedSections.join(", ") : "(none)"}

${resumeOutputFormatInstructions()}`;
}

export function coverLetterPrompt(profile: Profile, app: Application): string {
  return `You are writing a cover letter for ${profile.name} applying to ${app.company} for the ${app.role} role.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Write a sharp, differentiated cover letter that does NOT sound generic.

HARD RULES:
1. No em dashes.
2. Never use: "excited to apply", "passionate about", "synergy", "leverage" as verb, "cutting-edge", "innovative solutions", "self-starter", "proven track record", "consumer-facing".
3. Follow the OPENING PATTERNS from the voice notes exactly.
4. Direct and specific. Lead with substantive claim, then evidence.
5. Maximum 4 paragraphs. No fluff.
6. Adjust tone by audience type from voice notes.

OUTPUT:
Dear Hiring Manager,

[Opening — most compelling connection]
[Middle — specific experience matching a key requirement]
[Middle — AI builds or unique capability]
[Closing — clear next step, no platitudes]

${profile.name}`;
}

export function executiveSummaryPrompt(profile: Profile, app: Application): string {
  const keyReqs: string[] = app.jdParsed?.keyRequirements?.slice(0, 6) ?? [];
  return `You are creating a complete executive summary document for ${profile.name} targeting the ${app.role} role at ${app.company}.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Produce a complete, untruncated executive summary document with four sections. This will be read by a senior hiring decision-maker — it must be tight, substantive, and specific.

RULES:
1. No em dashes anywhere. Use commas, semicolons, or restructure.
2. No corporate filler: "passionate", "results-oriented", "driven", "synergy", "leverage" as verb, "self-starter", "proven track record".
3. Every claim must be backed by something real from the profile. No invented metrics.
4. Write in third person for the summary, first person for the pitch.
5. Be direct and specific about ${app.company}. Do not be generic.
6. Complete all four sections fully. Do not cut off mid-section.

---

COMPLETE OUTPUT (all four sections, unabridged):

EXECUTIVE SUMMARY
[4-5 sentences in third person. Lead with: years of experience + domain + one distinctive angle that makes ${profile.name} unusual. Reference one concrete quantified achievement. State what kind of role they are targeting and why ${app.company} specifically makes sense. Do not use em dashes.]

---

CAPABILITY MAP
[For each of the following ${app.role} requirements, write one bullet: [Requirement] → [Specific evidence from ${profile.name}'s career].
Requirements to cover: ${keyReqs.length > 0 ? keyReqs.map(r => `"${r}"`).join(", ") : "extract from the JD above"}
Format each bullet exactly as: - [Requirement]: [Evidence — specific, quantified where possible]]

---

WHAT I BRING TO ${app.company.toUpperCase()}
[3-4 sentences, first person. Be specific about ${app.company}'s sector, stage, or known challenges. Explain what the candidate would actually do differently or better in this role. Connect at least one project or past achievement directly to ${app.company}'s context. No platitudes.]

---

AREAS FOR GROWTH
[2-3 honest sentences. Identify 1-2 areas where the candidate is not a perfect fit and what they are doing about it. Hiring managers respect self-awareness. Do not hide weaknesses behind spin.]

Output all four sections completely. Do not stop early.`;
}

export function problemSolverPrompt(profile: Profile, app: Application, researchContext?: string): string {
  return `You are crafting a "Problem Solver Pitch" for ${profile.name} applying to ${app.company} for the ${app.role} role.

A Problem Solver Pitch is a structured argument that (1) names a specific real problem the company faces, (2) reasons about its structural difficulty, (3) proposes a concrete approach grounded in first principles, (4) shows proven capability through past work, and (5) proposes specific AI tools the candidate could build and demonstrate. It is NOT a cover letter. It is a thinking document designed for cold outreach to hiring managers.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

${researchContext ? `---

RECENT COMPANY RESEARCH (use this to be specific):
${researchContext}
` : ""}
---

RULES:
1. No em dashes anywhere. Use commas, semicolons, or restructure.
2. Be specific about ${app.company} — their business model, competitive position, sector dynamics, or known operational challenges. Use the research above if provided.
3. No sycophancy. No "I'm excited to", "I admire your", "I've been following".
4. Every section must reference something real from ${profile.name}'s profile or ${app.company}'s known context.
5. The "How I'd Approach It" section must be genuinely actionable — not abstract frameworks or buzzwords.
6. The AI Tool Ideas must be buildable using Claude Code, Cursor, V0, or similar agentic platforms by a non-engineer with AI assistance. Each tool must solve a real, specific pain at ${app.company}.
7. Write all nine sections completely. Do not truncate.

---

OUTPUT:

THE CORE PROBLEM AT ${app.company.toUpperCase()}
[3-4 sentences. Name a specific, non-obvious problem. Connect it to the JD — what challenge does this ${app.role} role exist to solve? Be precise about the sector dynamic or operational gap. Reference the research context above where relevant. No clichés.]

WHY THIS IS STRUCTURALLY HARD
[3-4 sentences. Reason from first principles. What makes this hard to solve even with good intent and resources? Identify the underlying tension, constraint, or tradeoff — not just the surface symptom.]

THE CONVENTIONAL APPROACH (AND ITS FLAW)
[2-3 sentences. Describe how most companies or teams try to solve this. Identify the specific failure mode — what does the conventional approach miss?]

HOW I WOULD APPROACH IT DIFFERENTLY
[4-5 sentences. Lay out a concrete, specific approach. What would you do in the first 90 days? What data would you look for? What assumption would you pressure-test first? Be specific enough that a skeptical hiring manager can evaluate it.]

PROOF FROM PAST WORK
[3-4 sentences. Reference a specific past situation from ${profile.name}'s career that is most analogous — same underlying problem structure, similar constraints, comparable stakes. Include an outcome or metric if available.]

WHY NOW, WHY ${app.company.toUpperCase()}
[2-3 sentences. Why is this the right moment for this problem at this company? What makes ${app.company}'s context specifically suited to the approach above?]

---

AI TOOL IDEAS

Three concrete AI tools or workflows ${profile.name} could build using Claude Code, Cursor, V0, or similar agentic platforms, then demonstrate to ${app.company} as proof of approach. These are not hypotheticals — they are buildable in days, not months.

TOOL 1: [Give it a specific, evocative name — not "AI Dashboard" or "Chatbot"]
What it does: [One sharp sentence. The tool's core function in plain English.]
Why ${app.company} specifically: [1-2 sentences. Tie it directly to the company's sector, business model, or the problem named above. Be precise — not generic.]
How to build it: [Tech stack in plain English. Use Claude API for the AI layer. Front-end via V0 or basic HTML. Data layer via Airtable, Supabase, or local JSON. State the approximate effort honestly: "a focused weekend", "3-5 hours with Claude Code", "one evening". Do not say "complex" or "enterprise-grade".]
Value it delivers: [Specific outcome. What does it save or generate for the company? Quantify where possible — "cuts X from Y hours to Z minutes", "surfaces the top 10 leads from a list of 500 in seconds".]
Best demo format: [Choose one: Video walkthrough (screen-record a live run) / Working prototype shared via link / Slide deck with live output screenshots. Explain in one sentence why this format lands best with a hiring manager at this type of company.]

TOOL 2: [Specific name]
What it does: [One sentence.]
Why ${app.company} specifically: [1-2 sentences.]
How to build it: [Stack + effort.]
Value it delivers: [Specific outcome.]
Best demo format: [Format + rationale.]

TOOL 3: [Specific name]
What it does: [One sentence.]
Why ${app.company} specifically: [1-2 sentences.]
How to build it: [Stack + effort.]
Value it delivers: [Specific outcome.]
Best demo format: [Format + rationale.]

---

OUTREACH DELIVERY STRATEGY
[3 sentences. Which of the three tools should ${profile.name} build first and lead with in the cold outreach? What format should the demo take — embedded video in email, a Loom link, a live prototype URL, or a PDF one-pager with screenshots? Tailor the advice to whether ${app.company} is a startup, enterprise, consulting firm, or investor, and whether this role is likely gatekept by a recruiter or reached directly by a hiring manager.]

Write all nine sections completely. Do not truncate.`;
}

export function skillGapPrompt(profile: Profile, app: Application): string {
  return `You are a career coach doing a skill gap analysis for ${profile.name} applying to the ${app.role} role at ${app.company}.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Analyze how well this candidate matches this specific role.

Return ONLY raw JSON:
{
  "strongMatches": [{ "skill": "string", "evidence": "string" }],
  "partialMatches": [{ "skill": "string", "gap": "string", "suggestion": "string" }],
  "missingSkills": [{ "skill": "string", "priority": "high|medium|low", "suggestion": "string" }],
  "overallReadiness": number 0-100,
  "headline": "string, one sentence summary"
}

Be honest and specific. Use actual profile data. Limit 3-5 items per category.`;
}

export function hmOutreachPrompt(profile: Profile, app: Application): string {
  const topReq = app.jdParsed?.keyRequirements?.[0] ?? "";
  return `You are writing a cold outreach email from ${profile.name} to the Hiring Manager at ${app.company} for the ${app.role} role.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Write a cold outreach email that earns a response. This is NOT a cover letter or a mass-blast template. A real person will read this and decide in 10 seconds whether to reply.

THE WINNING FORMULA:
- Hook: Lead with the single most unusual or specific thing about ${profile.name} that maps to what the HM cares about. Not the most impressive resume line — the most relevant one.
- Match: One concrete past achievement that directly addresses a key challenge this role exists to solve${topReq ? ` (e.g. "${topReq}")` : ""}.
- Ask: One low-friction, time-bounded ask. Not "I'd love to connect." Not "Happy to send my resume." Offer something specific: a brief insight, a question, a 15-min call with a clear agenda.

RULES:
1. No em dashes. No smart quotes.
2. Never use: "excited to apply", "passionate about", "synergy", "leverage" as verb, "cutting-edge", "innovative solutions", "self-starter", "proven track record", "consumer-facing", "disruptive".
3. Subject line: 5-8 words, specific to ${app.company} or the role challenge. Not generic. Not "Interested in ${app.role} Role."
4. Body: maximum 140 words after the greeting.
5. Tone: peer-to-peer, warm, direct. Not supplicating. Not performatively casual.
6. Signature includes name, one-line credibility statement, and contact.

Write two versions — Version A (more direct/analytical) and Version B (warmer/narrative). Label each clearly.

FORMAT:
VERSION A
Subject: [subject]

Hi [First Name],

[Hook — 1-2 sentences]
[Match — 1-2 sentences with specific evidence]
[Ask — 1 sentence]

${profile.name}
[One credibility line]
${profile.email} | ${profile.phone}

---

VERSION B
Subject: [subject]

Hi [First Name],

[Hook — 1-2 sentences, different angle]
[Match — 1-2 sentences]
[Ask — 1 sentence]

${profile.name}
[One credibility line]
${profile.email} | ${profile.phone}`;
}

export function linkedInDMPrompt(profile: Profile, app: Application): string {
  return `You are writing a LinkedIn DM for ${profile.name} to a contact at ${app.company} about the ${app.role} role.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Write a LinkedIn DM that a real human would actually reply to. Most LinkedIn DMs fail because they are obviously templated, immediately ask for something, or tell the recipient why THEY should care about the sender rather than offering something of value.

A great LinkedIn DM:
1. Opens with a specific, genuine observation — not a compliment, not "I saw you work at ${app.company}."
2. Identifies a reason it makes sense to reach out to THIS person (their role, their team, a specific signal).
3. Closes with a question or micro-ask that requires a one-word answer or a "yes/no." Never ask for "15 minutes" in the first message — too high friction.

RULES:
1. No em dashes. No bullet points.
2. Never: "excited", "passionate", "innovative", "synergy", "thought leader".
3. Maximum 65 words in the body (not counting greeting/sign-off).
4. Sound like a peer who happens to be job-seeking, not a job-seeker performing peer-ness.
5. Do not mention the job posting or that you "applied." Express genuine interest in the company/team.

Write two versions — Version A (question-first, curiosity framing) and Version B (value-first, brief insight).

FORMAT:
VERSION A
Hi [Name],

[65 words max — specific observation, reason for reaching out, low-friction question]

[First name sign-off]

---

VERSION B
Hi [Name],

[65 words max — different angle, brief insight or value offer, soft ask]

[First name sign-off]`;
}

export function ceoColdEmailPrompt(profile: Profile, app: Application, ceo?: ContactProfile): string {
  const ceoLine = ceo ? `Recipient: ${ceo.name}${ceo.title ? `, ${ceo.title}` : ", CEO"} at ${app.company}.` : `Recipient: CEO of ${app.company}.`;
  const firstName = ceo?.name?.split(" ")[0] ?? "[First Name]";
  return `You are writing a cold email from ${profile.name} to the CEO of ${app.company}. The goal is NOT to apply for a posted role. The goal is to start a conversation about creating value for the company, with a soft pitch toward the ${app.role} space.

${ceoLine}

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: A CEO-level cold email. Different from a Hiring Manager outreach.

RULES:
1. No em dashes anywhere.
2. Never use: "excited", "passionate", "synergy", "leverage" as verb, "cutting-edge", "innovative", "disrupt", "scale", "10x", "self-starter", "proven track record".
3. Subject line: provocative or specific, no fluff. Eight words max.
4. Open with an observation about the company that proves you've done your homework, NOT a compliment.
5. Second paragraph: a thesis about a problem they likely face, reasoned from first principles, not jargon.
6. Third paragraph: one specific thing you've done that proves you can help with that thesis.
7. Close: a 15-minute conversation ask, framed around helping them think, not asking for a job.
8. 180 words maximum. Tight, sharp, peer-to-peer tone.
9. Sign off with name + one credibility line + LinkedIn link.

FORMAT:
Subject: [subject]

${ceo?.name ? firstName : "[First Name]"},

[Opening — observation about ${app.company}]

[Thesis paragraph — first principles]

[Evidence paragraph — your specific proof point]

[Ask — soft 15-min frame]

${profile.name}
${profile.headline ?? ""}
${profile.linkedin ?? ""}`;
}

// Profile-aware variants — include the discovered contact's name, title, public signals
export function hmOutreachPromptWithProfile(profile: Profile, app: Application, target: ContactProfile): string {
  const firstName = target.name.split(" ")[0];
  const topReq = app.jdParsed?.keyRequirements?.[0] ?? "";
  return `You are writing a cold outreach email from ${profile.name} to ${target.name} at ${app.company} for the ${app.role} role.

RECIPIENT (found via people search — treat as verified):
Name: ${target.name}
Title: ${target.title ?? "(unknown)"}
Company: ${target.company}
LinkedIn: ${target.linkedinUrl ?? "(not provided)"}
Location: ${target.location ?? "(unknown)"}

Adjust your framing based on their seniority. A Director cares about team output and execution. A VP cares about org impact and talent strategy. A C-suite cares about business results and strategic bets.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: A personalized cold outreach email to ${target.name} specifically — not a generic HM email. Make it clear you know who they are and what their team likely needs.

THE WINNING FORMULA:
- Hook: The single most relevant thing about ${profile.name} for what ${firstName}'s team is trying to accomplish. Tie to ${target.title ?? "their seniority"} concerns.
- Match: One specific past achievement that maps to a real challenge in this role${topReq ? ` — e.g. "${topReq}"` : ""}.
- Ask: One clear, low-friction 15-min call ask with a specific agenda ("I'd like to share how I approached X — curious if that maps to what you're building").

RULES:
1. No em dashes. No smart quotes.
2. Never: "excited to apply", "passionate", "synergy", "leverage" as verb, "innovative", "self-starter", "proven track record".
3. Subject: 5-8 words, specific to ${app.company} or the role.
4. Body: max 140 words after greeting.
5. Tone: peer-to-peer, warm, direct. Not supplicating.
6. Do not invent facts about ${target.name}. Use only what's in the RECIPIENT block above.

FORMAT:
Subject: [subject]

Hi ${firstName},

[Hook — 1-2 sentences]
[Match — 1-2 sentences with specific evidence from profile]
[Ask — 1 sentence, specific agenda]

${profile.name}
${profile.headline ?? ""}
${profile.email} | ${profile.phone}`;
}

export function referralDMPromptWithProfile(profile: Profile, app: Application, target: ContactProfile): string {
  return `You are writing a LinkedIn DM from ${profile.name} to a potential REFERRAL CONTACT at ${app.company}. The goal is to ask if they'd be willing to refer ${profile.name} for the ${app.role} role, or share what their experience at ${app.company} has been like.

RECIPIENT:
Name: ${target.name}
Title: ${target.title ?? "(unknown)"}
Company: ${target.company}
${target.linkedinUrl ? `LinkedIn: ${target.linkedinUrl}` : ""}

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Short, human LinkedIn DM. NOT a hiring manager pitch. This is asking a peer or near-peer for a referral or insight.

RULES:
1. No em dashes.
2. Never: "excited", "passionate", "innovative", "synergy".
3. Maximum 70 words.
4. Lead with a real reason you're reaching out to ${target.name} specifically.
5. Don't ask for a referral in the first message. Ask for 10 minutes of their time or one specific question about ${app.company}.
6. Tone: warm, low-stakes, peer-to-peer. NOT supplicating.

FORMAT:
Hi ${target.name.split(" ")[0]},

[2-3 sentences: who, why them specifically given their role/title, why worth responding]
[Soft ask: 10-min call or one specific question]
[Sign-off]

${profile.name.split(" ")[0]}`;
}

export function linkedInDMPromptWithProfile(profile: Profile, app: Application, target: ContactProfile): string {
  const firstName = target.name.split(" ")[0];
  return `You are writing a LinkedIn DM from ${profile.name} to ${target.name} (${target.title ?? "professional"} at ${app.company}).

RECIPIENT:
Name: ${target.name}
Title: ${target.title ?? "(unknown)"}
Company: ${target.company}
${target.linkedinUrl ? `LinkedIn: ${target.linkedinUrl}` : ""}

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Write a LinkedIn DM that feels like it was written specifically for ${target.name}, not from a template. Use their title to infer what they care about and what their typical week looks like. Find the intersection with ${profile.name}'s background.

KEY INSIGHT: The reason most LinkedIn DMs fail is that they center the sender. Center the recipient — what's in it for them to reply?

RULES:
1. No em dashes. No bullet points in the message itself.
2. Never: "excited", "passionate", "innovative", "synergy", "thought leader".
3. Maximum 65 words in the body.
4. Open with something specific to ${firstName}'s role or context, not a generic compliment.
5. Do not mention you "applied." Express interest in ${app.company}'s work or their team's direction.
6. Close with a question or micro-ask that has a low cost to answer.

FORMAT:
Hi ${firstName},

[65 words max — specific to their role, genuine connection, soft ask]

${profile.name.split(" ")[0]}`;
}

export function refinePrompt(
  profile: Profile,
  app: Application,
  action: string,
  currentContent: string,
  instruction: string
): string {
  return `You are refining a "${action}" document for ${profile.name} applying to the ${app.role} role at ${app.company}.

CANDIDATE PROFILE (source of truth — never invent facts not in this profile):
${buildProfileContext(profile)}

---

CURRENT VERSION OF THE DOCUMENT:
${currentContent}

---

USER REFINEMENT INSTRUCTION:
${instruction}

---

RULES:
1. Apply ONLY what the instruction requests. Do not rewrite sections that were not mentioned.
2. NEVER invent facts, metrics, education, or experience not in the CANDIDATE PROFILE above.
3. Education, company names, and tenures must remain exactly as in the profile.
4. No em dashes. No smart quotes. Plain hyphens only for bullets.
5. Maintain the same format and section structure unless the instruction specifically changes it.
6. If the instruction would require fabricating something (e.g. adding a degree not in the profile), refuse that specific part and explain briefly at the end of the document as a comment: [NOTE: Could not apply X — Y reason].
7. Preserve all hyperlinks in the format [Text](URL) — do not convert to plain text URLs.

Output the complete refined document now. Same format as the input. No preamble, no meta-commentary.`;
}

export function afScoringPrompt(
  profile: Profile,
  jdText: string,
  meta: { company: string; role: string; location: string; seniority: string; sector: string; remote: boolean },
  buckets: { id: string; name: string; description: string }[]
): string {
  const profileContext = buildProfileContext(profile);
  const bucketDesc = buckets.map(b => `- ${b.name} (id: ${b.id}): ${b.description}`).join("\n");
  return `You are an expert career coach evaluating a job opportunity for ${profile.name}.

${profileContext}

CANDIDATE'S TARGET ARCHETYPES (North Star — the kinds of roles they want):
${bucketDesc}

JOB DETAILS:
Company: ${meta.company}
Role: ${meta.role}
Location: ${meta.location}${meta.remote ? " (Remote)" : ""}
Seniority: ${meta.seniority}
Sector: ${meta.sector}

JOB DESCRIPTION:
${jdText.slice(0, 6000)}

---

TASK: Score this opportunity across 5 dimensions (each 1-5), compute a weighted Global score (1-5), assess posting legitimacy, classify the role archetype, and extract structured JD data.

SCORING RUBRIC (qualitative, mirror career-ops framework):

**CV Match (1-5)** — How well do the candidate's actual skills, experience, and proof points match the JD requirements?
- 5: Direct line-by-line match across most requirements with strong evidence
- 4: Strong match on most key requirements, minor gaps
- 3: Match on half the requirements, notable gaps
- 2: Some overlap, multiple hard gaps
- 1: Almost no match

**North Star Alignment (1-5)** — How well does this role fit the candidate's target archetypes (above)?
- 5: Perfect fit for the primary archetype
- 4: Strong fit for primary OR perfect fit for secondary
- 3: Hybrid that touches at least one target archetype
- 2: Adjacent but not aligned with their stated targets
- 1: Off-target

**Compensation (1-5)** — Salary vs market for this role/location/seniority. If JD doesn't list comp, infer from company tier and role:
- 5: Top quartile for the market
- 4: Above market
- 3: At market
- 2: Below market
- 1: Well below market

**Cultural Signals (1-5)** — Remote policy, stability, growth signals, team dynamics, transparency:
- 5: All positive signals (remote-first or candidate-aligned, growing, transparent)
- 4: Mostly positive
- 3: Mixed
- 2: Several concerning signals
- 1: Red flags throughout

**Red Flags (1-5)** — INVERTED: 5 = no red flags, 1 = many red flags. Penalties for: vague compensation in regulated jurisdictions, contradictory requirements (entry-level title with staff requirements), suspiciously generic JD, unrealistic experience asks, recent layoff news in same department, repost patterns, suspicious apply flow.

**Global (1-5)** — Weighted average. Weights are qualitative (use judgment): CV Match and North Star matter most, Comp and Culture moderate, Red Flags can pull the score down significantly when severe.

**Recommendation thresholds:**
- 4.5+ → "apply_immediately"
- 4.0-4.4 → "apply"
- 3.5-3.9 → "review_manually"
- Below 3.5 → "skip"

---

ARCHETYPE: Classify the role as one of:
- AI Platform / LLMOps
- Agentic / Automation
- Technical AI PM
- AI Solutions Architect
- AI Forward Deployed
- AI Transformation
- Strategy / Consulting (MBB-style)
- General Product Management
- Other (specify)

If hybrid, give primary + secondary.

---

LEGITIMACY ASSESSMENT (Block G):

Analyze the JD for ghost-job signals. Output one of three tiers:
- **high_confidence** — Multiple positive signals, real active opening
- **proceed_with_caution** — Mixed signals worth noting
- **suspicious** — Multiple ghost-job indicators

Signals to evaluate (each: signal description, finding, weight as positive/neutral/concerning):
1. Description Quality — does it name specific technologies, tools, team size?
2. Realism — are requirements vs years of experience plausible?
3. Specificity — what % is role-specific vs boilerplate?
4. Internal Contradictions — entry-level title + staff requirements?
5. Compensation Transparency — context-dependent (legitimate omissions exist)
6. Scope Clarity — clear first 6-12 months?

NEVER default to "suspicious" without evidence. Default to "proceed_with_caution" when data is limited.
NEVER present findings as accusations — observations only.

---

ALSO EXTRACT structured JD data (for downstream ATS optimization and skill analysis):
- keyRequirements: top 5-8 must-haves
- technicalSkills: explicit tools/frameworks/languages
- softSkills: collaboration/leadership signals
- yearsExperienceRequired: number or null
- redFlags: any concerning items found
- keywords: 15-20 ATS-relevant keywords from the JD

Pick the SINGLE best-matching bucket (id and name) from the candidate's archetypes. If none matches well, pick the closest.

---

Return ONLY raw JSON (no markdown fences):

{
  "archetype": { "primary": "string", "secondary": "string or null" },
  "scores": {
    "cv_match": { "score": number, "reasoning": "string", "evidence": ["string"], "gaps": ["string"] },
    "north_star": { "score": number, "reasoning": "string" },
    "comp": { "score": number, "reasoning": "string" },
    "culture": { "score": number, "reasoning": "string", "signals": ["string"] },
    "red_flags": { "score": number, "reasoning": "string", "signals": ["string"] }
  },
  "global": number,
  "recommendation": "apply_immediately" | "apply" | "review_manually" | "skip",
  "legitimacy": {
    "tier": "high_confidence" | "proceed_with_caution" | "suspicious",
    "signals": [{ "signal": "string", "finding": "string", "weight": "positive" | "neutral" | "concerning" }],
    "notes": "string or null"
  },
  "jdParsed": {
    "keyRequirements": ["string"],
    "technicalSkills": ["string"],
    "softSkills": ["string"],
    "yearsExperienceRequired": number | null,
    "redFlags": ["string"],
    "keywords": ["string"]
  },
  "bucket": "string (id of best-matching bucket)",
  "bucketName": "string (display name of best-matching bucket)"
}

Be honest. Cite specific evidence from the candidate's profile. Don't invent metrics. Use the actual archetype names from the JD context.`;
}

export function jdScoringPrompt(jdText: string, role: string, company: string, location: string, seniority: string, sector: string): string {
  return `You are an expert technical recruiter analyzing a Job Description.
Job: ${role} at ${company}
Location: ${location}
Seniority: ${seniority}
Sector: ${sector}

Job Description:
${jdText.substring(0, 4000)}

Extract the following and return ONLY raw JSON:
{
  "keyRequirements": ["string"],
  "technicalSkills": ["string"],
  "softSkills": ["string"],
  "yearsExperienceRequired": number or null,
  "redFlags": ["string"]
}`;
}

export function skillBuilderPrompt(profile: Profile, jdSkills: string[], jdRequirements: string[]): string {
  return `You are a career development coach building a personalized skill progression roadmap for ${profile.name}.

${buildProfileContext(profile)}

---

AGGREGATED REQUIREMENTS FROM ALL TARGET ROLES IN PIPELINE:
Technical Skills Demand: ${jdSkills.join(", ") || "(none yet)"}
Key Requirements Across Roles: ${jdRequirements.join(" | ") || "(none yet)"}

---

TASK: Produce a structured skill progression plan. For each tracked skill, evaluate the candidate's current level, target level, and concrete progression path.

Levels:
- novice: theoretical knowledge only, no production work
- intermediate: has shipped 1-2 projects, can do under guidance
- advanced: multiple production deployments, can teach others
- expert: thought leader, deep expertise, others seek their advice

For evidence, use SPECIFIC items from the profile: actual project names, actual experience entries, actual certifications. Don't make things up.

Return ONLY raw JSON:
{
  "trackedSkills": [
    {
      "name": "string — the skill",
      "category": "string — AI/Strategy/Technical/Domain/etc",
      "currentLevel": "novice|intermediate|advanced|expert",
      "targetLevel": "intermediate|advanced|expert",
      "demandFromJDs": number 0-10 representing how often this appears in target JDs,
      "evidence": [{ "source": "string — project/experience/cert name", "description": "string — what it proves" }],
      "progressPercent": number 0-100 representing where they are between current level baseline and target,
      "nextMilestone": "string — specific next concrete output that proves progression",
      "estimatedWeeks": number — realistic weeks to reach next milestone given they have a job,
      "learningPath": [
        { "step": 1, "action": "string — what to do", "resource": "string — specific resource/project", "weeks": number }
      ],
      "priority": "critical|high|medium|low"
    }
  ],
  "topGaps": ["string", ...],
  "topStrengths": ["string", ...],
  "recommendedFocus": "string — one paragraph on where to invest time in next 90 days"
}

Track at least 8 skills. Order by priority (critical first). Be specific, realistic, and use the candidate's actual past work as evidence.`;}

export type NLUpdateResult = {
  summary: string;
  statusChange: boolean;
  newStatus: "sourced" | "reviewed" | "applied" | "interview" | "offer" | "rejected" | null;
  contact: { name: string; title?: string } | null;
  interview: {
    round: "phone_screen" | "first" | "second" | "final" | "case" | "technical" | "exec" | "other";
    scheduledAt: string | null;
    format: "video" | "phone" | "in_person" | "async" | null;
    contact: string | null;
  } | null;
  reminderDays: number | null;
  noteToAppend: string;
};

export function nlUpdatePrompt(text: string, app: Application): string {
  const today = new Date().toISOString().split("T")[0];
  return [
    "You are parsing a natural-language job search update into structured data.",
    "",
    "Today's date: " + today,
    "Application: " + app.company + " — " + app.role + " (current status: " + app.status + ")",
    "",
    "USER UPDATE:",
    '"' + text + '"',
    "",
    "Parse this update and return ONLY raw JSON:",
    "{",
    '  "summary": "one sentence human-readable summary of what happened",',
    '  "statusChange": true/false — should the application status change?,',
    '  "newStatus": "applied|reviewed|interview|offer|rejected|null" — the new status if changed, else null,',
    '  "contact": { "name": "full name", "title": "job title if mentioned" } or null if no new person mentioned,',
    '  "interview": {',
    '    "round": "phone_screen|first|second|final|case|technical|exec|other",',
    '    "scheduledAt": "YYYY-MM-DD or null if no specific date",',
    '    "format": "video|phone|in_person|async|null",',
    '    "contact": "interviewer name if mentioned, else null"',
    "  } or null if no interview mentioned,",
    '  "reminderDays": number of days until next follow-up or null if not relevant,',
    '  "noteToAppend": "a clean note to append to the application notes, written in past tense, dated today"',
    "}",
    "",
    "Rules:",
    '- If user says "got a call", "had a call", "phone screen" → round = "phone_screen", status = "interview"',
    '- If user says "second round", "final round" → set round accordingly',
    '- If user says "rejected", "didn\'t get it", "passed on" → status = "rejected"',
    '- If user says "offer" → status = "offer"',
    "- Extract date references like \"next Tuesday\", \"this Friday\" into YYYY-MM-DD format relative to today (" + today + ")",
    '- If a name is mentioned with a title (e.g. "Priya, recruiter at Bain") → extract as contact',
    "- reminderDays: set to 7 if they just applied, 1 if interview is tomorrow, null if no clear follow-up needed",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Profile enrichment (Features 1 & 3) — extract candidate entities from
// freeform text. Matching/merging against the existing profile is
// deterministic (lib/profile-merge.ts), not the model's job — this prompt
// only needs to propose clean structured entities and avoid re-proposing
// things clearly already in the profile.
// ---------------------------------------------------------------------------

export function profileExtractionPrompt(text: string, profile: Profile, diffAgainstText?: string): string {
  return `You extract structured career information from freeform text for ${profile.name}'s profile.

${buildProfileContext(profile)}

---

${diffAgainstText ? `PREVIOUS VERSION OF THE TEXT (for reference only — do not re-extract anything already covered here):
${diffAgainstText.slice(0, 4000)}

---

NEW/EDITED TEXT — extract ONLY details that are new here compared to the previous version above AND not already in the candidate profile:
${text.slice(0, 4000)}` : `TEXT TO EXTRACT FROM:
${text.slice(0, 6000)}`}

---

RULES:
1. NEVER invent facts. Extract only what is explicitly stated or very strongly implied in the text.
2. Do not re-propose anything that is already clearly present in the candidate profile above (same company, same institution, same project name, same skill). It is fine to propose additional bullets/details for something already in the profile — just don't repeat what's already there.
3. Experience bullets: action + specific detail + outcome, in the candidate's own words where possible — do not embellish or add fake metrics.
4. Only include a field if the text actually supports it. Omit fields entirely rather than guessing (e.g. omit "gpa" if no GPA is mentioned).
5. Skills: group into sensible categories (e.g. "Technical", "Leadership"). Only extract skills explicitly named in the text.
6. If nothing new and extractable is found for a category, omit that array entirely (or return it empty).

Output ONLY raw JSON matching exactly this shape, nothing before or after:
{
  "experience": [ { "company": string, "role": string, "tenure": string, "location": string (optional), "bullets": string[] } ],
  "education": [ { "institution": string, "degree": string, "field": string (optional), "years": string, "gpa": string (optional), "achievements": string[] (optional) } ],
  "projects": [ { "name": string, "description": string, "stack": string (optional), "outcomes": string (optional), "repoUrl": string (optional) } ],
  "publications": [ { "title": string, "publication": string, "year": string, "url": string (optional) } ],
  "certifications": [ { "name": string, "issuer": string (optional), "date": string (optional), "relevance": string (optional) } ],
  "skills": [ { "category": string, "items": string[] } ]
}

Omit any top-level key entirely if you found nothing for it. Output the JSON now. No preamble, no explanation.`;
}

// ---------------------------------------------------------------------------
// Interactive profile interview (Feature 2) — question generation + answer
// incorporation. Targets the weakest/most-generic bullets specifically.
// ---------------------------------------------------------------------------

export function profileQuestionsPrompt(
  profile: Profile,
  candidates: BulletCandidate[],
  excludeQuestionTexts: string[] = [],
): string {
  const excludeBlock = excludeQuestionTexts.length > 0
    ? `\nDo NOT repeat or closely rephrase any of these already-asked questions:\n${excludeQuestionTexts.map(q => `- ${q}`).join("\n")}\n`
    : "";

  const candidateBlock = candidates
    .map((c, i) => `${i + 1}. [${c.targetType}] ${c.targetLabel}\n   "${c.currentText}"`)
    .join("\n");

  return `You are a career coach helping ${profile.name} strengthen their profile with sharp, specific follow-up questions.

${buildProfileContext(profile)}

---

A deterministic pre-filter has already scanned every experience bullet and project description and flagged the ones with NO quantification at all (no digit, no %, no currency symbol, no scale keyword like revenue/users/headcount/deal/margin/time). These are the ONLY candidates you may pick from — do not consider or invent any bullet not listed here, and do not pick anything already quantified.

CANDIDATE BULLETS/DESCRIPTIONS (pre-filtered, unquantified):
${candidateBlock}

TASK: Pick the 2-3 HIGHEST-IMPACT candidates from the list above — the ones where a missing number would matter most to a hiring manager reading this profile (prefer the candidate's most recent/senior roles and headline-relevant work over minor ones). For each, write one targeted, specific question that would let the candidate supply the missing number or detail. Good questions ask for a concrete, answerable fact — e.g. "For the India market-entry project, what was the measurable outcome — deal size, revenue impact, or time saved?" or "How many people did you lead on the multi-plant capital program?" Bad questions are vague ("tell me more about this").
${excludeBlock}
Output ONLY raw JSON matching exactly this shape, nothing before or after:
{
  "questions": [
    {
      "id": "short slug, e.g. bain-2025-bullet-1",
      "targetType": "experience" | "project",
      "targetId": "the exact targetId from the candidate list above, copied exactly",
      "targetLabel": "the exact targetLabel from the candidate list above, copied exactly",
      "currentText": "the exact current bullet/description text, copied verbatim from the candidate list above",
      "question": "the specific follow-up question"
    }
  ]
}

Pick at most 3, from the candidates listed above only. Output the JSON now. No preamble, no explanation.`;
}

export function bulletRewritePrompt(
  profile: Profile,
  targetLabel: string,
  currentText: string,
  question: string,
  answer: string,
): string {
  return `You are rewriting one resume bullet for ${profile.name} to incorporate a new quantified detail they just supplied.

CONTEXT: ${targetLabel}

CURRENT BULLET:
"${currentText}"

QUESTION ASKED:
"${question}"

CANDIDATE'S ANSWER:
"${answer}"

RULES:
1. Rewrite the bullet to naturally incorporate the specific detail(s) from the candidate's answer. Do not invent any number or fact not present in the answer.
2. If the answer doesn't actually contain a usable fact (e.g. "I don't know" or "not sure"), return the CURRENT bullet unchanged.
3. Keep it one line, action-verb-first, no em dashes, no smart quotes, no banned resume filler ("passionate about", "leveraged", "spearheaded", "synergies").
4. Do not change parts of the bullet unrelated to the question/answer.

Output ONLY raw JSON: { "rewrittenText": "the rewritten bullet" }. No preamble, no explanation.`;
}

// ---------------------------------------------------------------------------
// Job-scoped gap analysis (resume rebuild #5): compares a SPECIFIC JD's
// target priorities against the profile and asks about genuine gaps —
// distinct from profileQuestionsPrompt above, which scans the whole profile
// for generic weak bullets regardless of any particular job.
// ---------------------------------------------------------------------------

export function resumeGapQuestionsPrompt(
  profile: Profile,
  app: Application,
  targetPriorities: string[],
  subFocus?: string | null,
): string {
  const cap = targetPriorities.length > 0 ? Math.min(targetPriorities.length, 4) : 4;

  return `You are helping ${profile.name} identify what is MISSING from their profile for a specific job, so they can supply it before finalizing their resume for ${app.company} — ${app.role}.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

TARGET SUB-FOCUS FOR THIS ROLE: ${subFocus || "(not given — infer it yourself from the JD above)"}
TARGET PRIORITIES FOR THIS ROLE: ${targetPriorities.length > 0 ? targetPriorities.join("; ") : "(not given — infer them yourself from the JD above)"}

TASK: For each target priority, check whether the candidate's profile already evidences it well.
- If it is ALREADY well evidenced (a bullet or project clearly proves it with a real number), skip it — do not ask about it.
- If it is PARTIALLY evidenced (something relevant exists but lacks a number or specific), put what already exists in "existingEvidence" and ask a specific question for the missing detail.
- If it is NOT evidenced at all, pick the single most plausible existing experience or project this could plausibly attach to (never invent a new entry to attach to), leave "existingEvidence" empty, and ask a specific question that would surface a genuinely new but truthful detail.

Ask AT MOST ${cap} questions — one per priority that genuinely needs one; skip priorities that don't. Every question must be answerable with a concrete fact (a number, a name, a scale) — never vague ("tell me more about this").

Good question examples: "This role emphasizes cost optimization — do you have a project with a quantified cost saving?" or "How many people did you lead on the multi-plant capital program?"

Output ONLY raw JSON matching exactly this shape, nothing before or after:
{
  "questions": [
    {
      "id": "short slug, e.g. cost-optimization-1",
      "priority": "the target priority this question addresses, copied from above",
      "targetType": "experience" | "project",
      "targetId": "the exact company name (experience) or project name (project), copied exactly from the profile above",
      "targetLabel": "human-readable label, e.g. 'Bain & Company — Consultant'",
      "existingEvidence": "what's already in the profile that's relevant, if anything — omit or null if nothing exists",
      "question": "the specific question"
    }
  ]
}

If every priority is already well evidenced, return { "questions": [] }. Output the JSON now. No preamble, no explanation.`;
}

export function resumeGapAnswerPrompt(
  profile: Profile,
  targetLabel: string,
  priority: string,
  question: string,
  answer: string,
): string {
  return `You are turning a candidate's plain-text answer into one polished, quantified resume bullet.

CONTEXT: ${targetLabel}
TARGET PRIORITY THIS ADDRESSES: ${priority || "(general strengthening)"}

QUESTION ASKED:
"${question}"

CANDIDATE'S ANSWER:
"${answer}"

RULES:
1. Write ONE new bullet that captures the fact(s) in the answer, phrased to speak to "${priority || "the target role"}". Action-verb-first, quantified using only numbers actually present in the answer.
2. NEVER invent a number, scale, or outcome not stated in the answer.
3. If the answer does not actually contain a usable fact (e.g. "I don't know" or "not sure"), return an empty string for "newBulletText".
4. No em dashes, no smart quotes, no banned resume filler ("passionate about", "leveraged", "spearheaded", "synergies").
5. One line, no preamble.

Output ONLY raw JSON: { "newBulletText": "the new bullet, or empty string if the answer had no usable fact" }. No preamble, no explanation.`;
}
