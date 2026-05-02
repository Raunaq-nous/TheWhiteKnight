import { Profile } from "./profile";
import { Application } from "./store";

export type GenerationAction = "resume" | "cover-letter" | "executive-summary" | "problem-solver" | "skill-gap";

export type SkillGapResult = {
  strongMatches: { skill: string; evidence: string }[];
  partialMatches: { skill: string; gap: string; suggestion: string }[];
  missingSkills: { skill: string; priority: "high" | "medium" | "low"; suggestion: string }[];
  overallReadiness: number;
  headline: string;
};

async function callOpenAI(prompt: string, apiKey: string, temperature = 0.7): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Error: ${response.status} — ${err.slice(0, 200)}`);
  }

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

function buildProfileContext(profile: Profile): string {
  const expSummary = profile.experience.slice(0, 4).map(e =>
    `${e.company} (${e.tenure}): ${e.role}\n${e.bullets.split("\n").filter(b => b.trim()).slice(0, 3).map(b => `  - ${b.trim()}`).join("\n")}`
  ).join("\n\n");

  const skillsList = Object.entries(profile.skills).map(([cat, skills]) =>
    `${cat}: ${skills}`
  ).join("\n");

  const projectHighlights = profile.projects.slice(0, 4).map(p =>
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

function buildJDContext(app: Application): string {
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
${app.jdRaw ? app.jdRaw.slice(0, 3000) : "(Not available — using structured data above)"}
`.trim();
}

export async function generateTailoredResume(profile: Profile, app: Application, apiKey: string): Promise<string> {
  const profileCtx = buildProfileContext(profile);
  const jdCtx = buildJDContext(app);

  const prompt = `
You are a professional resume writer helping ${profile.name} apply for a specific role.

${profileCtx}

---

${jdCtx}

---

TASK: Write a tailored, one-page resume for this specific application.

HARD RULES:
1. No em dashes anywhere. Use commas, semicolons, or restructure sentences.
2. One page maximum — keep it tight. Prioritize bullets that directly match the JD requirements.
3. Lead experience bullets with strong action verbs and concrete outcomes.
4. Weave in "first principles" thinking naturally in the summary — not as a buzzword.
5. Match the writing voice from the VOICE AND TONE NOTES above.
6. Highlight AI/agentic work prominently if the role values it.
7. Output in clean markdown format.

STRUCTURE:
# ${profile.name}
[Contact line]

## Summary
[2-3 tight sentences, tailored to this specific role]

## Experience
[Most relevant entries, trimmed bullets focused on JD match]

## Skills
[Relevant skills only, not exhaustive]

## Education
[Brief]

Generate the resume now:
`;

  return callOpenAI(prompt, apiKey, 0.6);
}

export async function generateCoverLetter(profile: Profile, app: Application, apiKey: string): Promise<string> {
  const profileCtx = buildProfileContext(profile);
  const jdCtx = buildJDContext(app);

  const prompt = `
You are writing a cover letter for ${profile.name} applying to ${app.company} for the ${app.role} role.

${profileCtx}

---

${jdCtx}

---

TASK: Write a sharp, differentiated cover letter that does NOT sound like a generic application.

HARD RULES:
1. No em dashes anywhere.
2. Never use: "excited to apply", "passionate about", "synergy", "leverage" as verb, "cutting-edge", "innovative solutions", "self-starter", "proven track record", "consumer-facing".
3. Follow the OPENING PATTERNS from the voice notes exactly.
4. Be direct and specific. Lead with the substantive claim, then evidence.
5. Maximum 4 paragraphs. No fluff.
6. Adjust tone by role type based on the TONE BY AUDIENCE notes.

OUTPUT FORMAT:
Dear Hiring Manager,

[Opening paragraph — lead with the most compelling connection to this specific role]

[Middle paragraph — specific experience/project that maps exactly to a key requirement]

[Middle paragraph — AI builds or unique capability that differentiates]

[Closing — clear next step, no platitudes]

${profile.name}

Generate the cover letter now:
`;

  return callOpenAI(prompt, apiKey, 0.7);
}

export async function generateExecutiveSummary(profile: Profile, app: Application, apiKey: string): Promise<string> {
  const profileCtx = buildProfileContext(profile);
  const jdCtx = buildJDContext(app);

  const prompt = `
You are creating an executive summary for ${profile.name} targeting the ${app.role} role at ${app.company}.

${profileCtx}

---

${jdCtx}

---

TASK: Write a tight executive summary profile — the kind that goes at the top of a CV or is used as a LinkedIn "About" section tailored for this application.

RULES:
1. No em dashes.
2. 3-5 sentences maximum.
3. Lead with years + domain + distinctive angle.
4. Weave in "approaches each engagement from first principles" naturally — not as a buzzword.
5. Mention the AI/agentic work concretely if relevant to this role.
6. End with what you are specifically looking for (this role type).
7. Match the voice notes — direct, specific, non-corporate.

Then produce a bullet-point capability list (5-7 bullets) showing direct match to this JD's requirements. Each bullet: [YOUR CAPABILITY] — [SPECIFIC EVIDENCE].

Output format:
EXECUTIVE SUMMARY
[3-5 sentences]

CAPABILITY MATCH
- [Capability]: [Evidence from profile that maps to a JD requirement]
(repeat for each)

Generate now:
`;

  return callOpenAI(prompt, apiKey, 0.6);
}

export async function generateProblemSolverPitch(profile: Profile, app: Application, apiKey: string): Promise<string> {
  const profileCtx = buildProfileContext(profile);
  const jdCtx = buildJDContext(app);

  const prompt = `
You are crafting a "Problem Solver Pitch" for ${profile.name} applying to ${app.company} for the ${app.role} role.

A Problem Solver Pitch is a 300-400 word piece that does this:
1. Identifies a SPECIFIC, REAL problem this company or this role likely faces (not a generic one)
2. Shows you understand it from first principles — what's actually causing it economically or operationally
3. Proposes how you'd approach solving it, using your specific experience/capabilities
4. Demonstrates you've done this kind of work before, concretely

This is the piece that gets forwarded internally. It reads like a smart consultant's first-day hypothesis.

${profileCtx}

---

${jdCtx}

---

RULES:
1. No em dashes.
2. Be specific about the company — use their sector, what they likely struggle with, what the role is actually solving for.
3. Don't be sycophantic. Don't say "I'm excited." Lead with the problem.
4. Use evidence from the profile — specific projects or engagements that prove you can solve it.
5. 300-400 words. Tight.

OUTPUT FORMAT:
THE PROBLEM AT ${app.company.toUpperCase()}
[2-3 sentences identifying the specific problem]

WHY IT'S HARDER THAN IT LOOKS
[2-3 sentences on the underlying cause — first principles]

HOW I'D APPROACH IT
[3-4 sentences on the specific approach, referencing your actual experience]

WHY THIS IS FAMILIAR TERRITORY
[2-3 sentences on proof from past work]

Generate now:
`;

  return callOpenAI(prompt, apiKey, 0.75);
}

export async function generateSkillGap(profile: Profile, app: Application, apiKey: string): Promise<SkillGapResult> {
  const profileCtx = buildProfileContext(profile);
  const jdCtx = buildJDContext(app);

  const prompt = `
You are a career coach doing a skill gap analysis for ${profile.name} applying to the ${app.role} role at ${app.company}.

${profileCtx}

---

${jdCtx}

---

TASK: Analyze how well this candidate's skills and experience match this specific role. Produce a structured JSON skill gap report.

Return ONLY raw JSON (no markdown, no backticks):
{
  "strongMatches": [
    { "skill": "string — the JD requirement or skill", "evidence": "string — specific experience entry or project that proves this" }
  ],
  "partialMatches": [
    { "skill": "string — the requirement", "gap": "string — what is missing or shallow", "suggestion": "string — how to address or frame it" }
  ],
  "missingSkills": [
    { "skill": "string — the requirement not met", "priority": "high|medium|low", "suggestion": "string — how to acquire or work around it" }
  ],
  "overallReadiness": number between 0 and 100,
  "headline": "string — one sentence summary of fit, direct and honest"
}

Be honest and specific. Use actual data from the profile, not generic statements. Limit to the most important 3-5 items per category.
`;

  const raw = await callOpenAI(prompt, apiKey, 0.2);
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return JSON.parse(cleaned.trim()) as SkillGapResult;
}
