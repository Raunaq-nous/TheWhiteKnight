import { Profile } from "./profile";
import { Application } from "./store";

export type GenerationAction = "resume" | "cover-letter" | "executive-summary" | "problem-solver" | "skill-gap" | "outreach-hm" | "linkedin-dm" | "ceo-cold-email" | "referral-dm";

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
  archetype: { primary: string; secondary?: string };
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
    notes?: string;
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
  const expSummary = profile.experience.slice(0, 4).map(e =>
    `${e.company} (${e.tenure}): ${e.role}\n${e.bullets.split("\n").filter(b => b.trim()).slice(0, 3).map(b => `  - ${b.trim()}`).join("\n")}`
  ).join("\n\n");

  const skillsList = Object.entries(profile.skills).map(([cat, skills]) =>
    `${cat}: ${skills}`
  ).join("\n");

  const projectHighlights = profile.projects.slice(0, 6).map(p =>
    `${p.name}: ${p.description} (Stack: ${p.stack})`
  ).join("\n");

  return `
CANDIDATE PROFILE
Name: ${profile.name}
Headline: ${profile.headline}
Years of Experience: ${profile.yearsOfExperience}
Location: ${profile.location}
Open To: ${profile.locationsOpenTo}

EXPERIENCE HIGHLIGHTS:
${expSummary}

SKILLS:
${skillsList}

KEY PROJECTS:
${projectHighlights}

VOICE AND TONE NOTES:
${profile.voiceNotes}
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

export function resumePrompt(profile: Profile, app: Application): string {
  const atsKeywords = app.jdParsed?.keywords?.join(", ") ?? "";
  const keyReqs = app.jdParsed?.keyRequirements?.join("; ") ?? "";
  const techSkills = app.jdParsed?.technicalSkills?.join(", ") ?? "";
  const isStrategy = profile.roleType === "strategy-consulting";

  return `You are a senior resume strategist. Tailor a one-page, ATS-optimized resume for ${profile.name} targeting the ${app.role} role at ${app.company}.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

${atsKeywords ? `ATS KEYWORDS (weave in naturally, exact wording where possible): ${atsKeywords}` : ""}
${keyReqs ? `MUST-COVER REQUIREMENTS: ${keyReqs}` : ""}
${techSkills ? `MUST-LIST TECHNICAL SKILLS (only if candidate has them): ${techSkills}` : ""}

---

REASONING APPROACH (think before writing):
1. Identify the 5-7 highest-leverage requirements from the JD.
2. For each, pick the single strongest piece of evidence in the profile (a bullet, project, or metric).
3. Choose 3-4 experience entries to feature; cut the rest.
4. Per entry, select 3-4 bullets that map directly to JD requirements; reorder so most relevant comes first.
5. Calibrate scope language to ${app.seniority} seniority.
6. Build a Skills section using JD terminology exactly (e.g. "LLMOps" if JD says LLMOps).

OUTPUT RULES:
- Max ~30 content lines total. One page.
- Every bullet: strong past-tense verb + specific action + quantified outcome (use only metrics from the profile, never invent).
- No em dashes anywhere. Use commas, semicolons, or restructure.
- No smart quotes, no fancy unicode bullets — plain hyphens only.
- Banned phrases: "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded", "facilitated", "synergies", "cutting-edge", "innovative solutions", "self-starter".
- Vary verbs and sentence lengths. Do not start consecutive bullets with the same word.
- Summary: 2-3 sentences, lead with years + domain + distinctive angle; weave 3-5 JD keywords naturally.${isStrategy ? '\n- For this strategy/consulting candidate, weave "first principles" into the summary naturally — not as a buzzword.' : ""}
- Location line: ${profile.location}${profile.locationsOpenTo ? `, open to ${profile.locationsOpenTo}` : ""}.

OUTPUT FORMAT (clean markdown, exactly this structure, nothing else):
# ${profile.name}
${profile.email} | ${profile.phone} | ${profile.location}${profile.linkedin ? ` | ${profile.linkedin}` : ""}${profile.github ? ` | ${profile.github}` : ""}

## Summary
[2-3 sentences]

## Experience
### [Role] | [Company] | [Tenure]
- [Most JD-relevant bullet, quantified]
- [Next most relevant]
- [...]

## Skills
**[Category]:** [comma-separated, JD terminology]

## Education
[Degree | Institution | Year]

Write the resume now. Output the markdown only — no preamble, no explanation.`;
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
  return `You are creating an executive summary for ${profile.name} targeting the ${app.role} role at ${app.company}.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Tight executive summary profile, 3-5 sentences, plus a capability match.

RULES:
1. No em dashes.
2. Lead with years + domain + distinctive angle.
3. Weave "approaches each engagement from first principles" naturally.
4. Mention AI/agentic work concretely if relevant.
5. End with what role you're looking for.
6. Match voice notes: direct, non-corporate.

Then 5-7 capability bullets mapping your experience to JD requirements.

OUTPUT:
EXECUTIVE SUMMARY
[3-5 sentences]

CAPABILITY MATCH
- [Capability]: [Evidence]`;
}

export function problemSolverPrompt(profile: Profile, app: Application): string {
  return `You are crafting a "Problem Solver Pitch" for ${profile.name} applying to ${app.company} for the ${app.role} role.

A Problem Solver Pitch identifies a specific real problem this company faces, reasons about it from first principles, proposes a specific approach, and demonstrates relevant past work.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

RULES:
1. No em dashes.
2. Be specific about ${app.company} — their sector, their actual challenges.
3. Don't be sycophantic. No "I'm excited."
4. Use evidence from the profile.
5. 300-400 words. Tight.

OUTPUT:
THE PROBLEM AT ${app.company.toUpperCase()}
[2-3 sentences]

WHY IT'S HARDER THAN IT LOOKS
[2-3 sentences, first principles]

HOW I'D APPROACH IT
[3-4 sentences]

WHY THIS IS FAMILIAR TERRITORY
[2-3 sentences from past work]`;
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
  return `You are writing a cold outreach email for ${profile.name} to the Hiring Manager at ${app.company} for the ${app.role} role.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Write a cold outreach email that gets a response. NOT a cover letter.

RULES:
1. No em dashes.
2. Never: "excited", "passionate", "synergy", "leverage" as verb, "cutting-edge", "innovative", "self-starter".
3. Subject line: specific, intriguing.
4. Body: 3 paragraphs max, 150 words.
5. Lead with the most differentiated thing.
6. One specific low-friction ask.
7. Tone: warm, peer-to-peer, not supplicating.

FORMAT:
Subject: [subject]

Hi [First Name],

[Opening hook]
[Most compelling match]
[Specific low-friction ask]

${profile.name}
${profile.email}
${profile.phone}`;
}

export function linkedInDMPrompt(profile: Profile, app: Application): string {
  return `You are writing a LinkedIn DM for ${profile.name} to someone at ${app.company} about the ${app.role} role.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Short human DM. Not salesy.

RULES:
1. No em dashes.
2. No "excited", "passionate", "innovative", "synergy".
3. 75 words maximum.
4. Sound human, not template.
5. One clear ask: 15-min call or simple question.
6. No links or attachments.
7. Warm, not gushing. Confident, not arrogant.

FORMAT:
Hi [Name],

[2-3 sentences: who, why them specifically, why worth responding]
[One sentence ask]
[Sign-off]`;
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
  return `You are writing a cold outreach email for ${profile.name} to a likely Hiring Manager at ${app.company} for the ${app.role} role.

RECIPIENT (discovered via people search):
Name: ${target.name}
Title: ${target.title ?? "(unknown)"}
Company: ${target.company}
LinkedIn: ${target.linkedinUrl ?? "(not provided)"}
Location: ${target.location ?? "(unknown)"}

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Cold outreach email tailored to this specific person. Reference what their title/seniority signals (e.g. if they are a Director vs VP, the framing differs). Don't fabricate facts about them — use only what's provided.

RULES:
1. No em dashes.
2. Never: "excited", "passionate", "synergy", "leverage" as verb, "cutting-edge", "innovative", "self-starter".
3. Subject line: specific, intriguing.
4. Body: 3 paragraphs max, 150 words.
5. Open with the most differentiated thing about ${profile.name} that maps to what ${target.name}'s team likely cares about.
6. Middle: one specific match.
7. Close: 15-min call ask.
8. Tone: warm, peer-to-peer, not supplicating.

FORMAT:
Subject: [subject]

Hi ${target.name.split(" ")[0]},

[Opening hook]
[Most compelling match]
[Specific low-friction ask]

${profile.name}
${profile.email}
${profile.phone}`;
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
  return `You are writing a LinkedIn DM for ${profile.name} to ${target.name} (${target.title ?? "professional"} at ${app.company}) about the ${app.role} role.

RECIPIENT:
Name: ${target.name}
Title: ${target.title ?? "(unknown)"}
Company: ${target.company}
${target.linkedinUrl ? `LinkedIn: ${target.linkedinUrl}` : ""}

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Short human DM. Tailored to ${target.name}'s role. NOT salesy.

RULES:
1. No em dashes.
2. No "excited", "passionate", "innovative", "synergy".
3. 75 words maximum.
4. Sound human, not template.
5. Address the recipient by first name.
6. One clear ask: 15-min call or specific question.
7. No links or attachments.
8. Warm, not gushing. Confident, not arrogant.

FORMAT:
Hi ${target.name.split(" ")[0]},

[2-3 sentences: who, why them specifically, why worth responding]
[One sentence ask]
[Sign-off]`;
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
