import { Profile } from "./profile";
import { Application } from "./store";

export type GenerationAction = "resume" | "cover-letter" | "executive-summary" | "problem-solver" | "skill-gap" | "outreach-hm" | "linkedin-dm";

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
  return `You are a professional resume writer helping ${profile.name} apply for a specific role.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

TASK: Write a tailored, one-page resume for this specific application.

HARD RULES:
1. No em dashes anywhere. Use commas, semicolons, or restructure.
2. One page maximum. Prioritize bullets that match the JD.
3. Lead bullets with strong verbs and concrete outcomes.
4. Weave "first principles" naturally into the summary.
5. Match the writing voice from VOICE AND TONE NOTES.
6. Highlight AI/agentic work prominently if relevant.
7. Output clean markdown.

STRUCTURE:
# ${profile.name}
[Contact line]

## Summary
[2-3 sentences]

## Experience
[Most relevant entries]

## Skills
## Education

Generate the resume now.`;
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

Track at least 8 skills. Order by priority (critical first). Be specific, realistic, and use the candidate's actual past work as evidence.`;
}
