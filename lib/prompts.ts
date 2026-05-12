import { Profile } from "./profile";
import { Application } from "./store";

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

// Per-role-type resume structure guidance. Each block returns:
//   - sectionOrder: how the output template orders the resume
//   - emphasis: what each bullet should emphasise
//   - voiceQuirk: optional one-line stylistic instruction
function getResumeStructureGuidance(roleType: string | undefined, yoeNum: number): {
  sectionOrder: "exp-first" | "edu-first" | "projects-first";
  emphasis: string;
  voiceQuirk: string;
  extraSection: string;
} {
  const rt = roleType ?? "professional";

  // Student / Intern / <2 yoe: education first
  if (rt === "other" && yoeNum < 2) {
    return {
      sectionOrder: "edu-first",
      emphasis: "Lead with academic strength, projects, and coursework. Use experience bullets for internships and part-time roles.",
      voiceQuirk: "",
      extraSection: "## Relevant Coursework\n[3-5 most relevant courses or research areas if listed in profile education achievements]",
    };
  }

  switch (rt) {
    case "strategy-consulting":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead each bullet with quantified business impact: revenue captured, cost saved, % uplift, deals closed, market sized. Show consulting toolkit: analytical frameworks, executive communication, due diligence depth.",
        voiceQuirk: 'Weave "first principles" naturally once in the Summary.',
        extraSection: "",
      };

    case "ai-tech":
    case "engineering":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead with technical scale and impact: latency improvements, throughput, model accuracy gains, system reliability, users served. Mention specific tools, languages, and architectures by name. Reference GitHub projects when relevant.",
        voiceQuirk: "Use precise technical terminology — say 'shipped a multi-agent RAG pipeline with sub-300ms p95 latency' not 'built an AI system'.",
        extraSection: profile_hasProjects(profile_from_closure) ? "## Notable Builds\n[2-3 highest-impact projects from profile with stack + outcome on one line each]" : "",
      };

    case "design":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead with named brands shipped for, scope of work (identity, web, packaging, motion, etc.), and measurable outcomes if available (engagement lift, brand recall, award recognition). Mention specific tools (Figma, After Effects, Adobe Suite). The portfolio link in the header is critical — it carries the visual proof.",
        voiceQuirk: "Pick verbs that signal craft: shipped, art-directed, illustrated, prototyped, defined. Not 'leveraged' or 'spearheaded'.",
        extraSection: "## Tools\n[Comma-separated list of design tools and skills from profile, e.g. Figma, Adobe Creative Suite, Webflow, After Effects]",
      };

    case "product":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead with user/business outcomes: MAU growth, retention, NPS, conversion, revenue per user, time-to-launch. Show 0-to-1 vs scaling roles distinctly. Mention cross-functional partners (eng, design, data, GTM) when scope justifies.",
        voiceQuirk: "Frame bullets around 'problem → bet → outcome'. Avoid 'managed product' — say what shipped and what changed.",
        extraSection: "",
      };

    case "marketing":
    case "sales":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead with quota attainment, pipeline generated, revenue closed, growth multipliers, ROAS, CAC, channels owned. Be ruthless about numbers — never use 'managed' or 'oversaw' without an outcome attached.",
        voiceQuirk: "Every bullet should contain at least one number when possible.",
        extraSection: "",
      };

    case "finance":
    case "operations":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead with scale of P&L owned, deals modelled/closed, processes built or saved (in hours or $), audits cleared. Demonstrate analytical rigor through tool fluency (Excel, SQL, Tableau, ERP systems).",
        voiceQuirk: "Pair process discipline with business outcome — 'cut close cycle from 12d to 4d, unlocking real-time CFO reporting'.",
        extraSection: "",
      };

    case "data":
    case "research":
      return {
        sectionOrder: rt === "research" ? "edu-first" : "exp-first",
        emphasis: "Lead with rigorous methodology: model type, dataset size, sample power, evaluation metric. Tie every project to a business or research outcome.",
        voiceQuirk: "Use precise quantitative language. Distinguish exploratory from production work.",
        extraSection: rt === "research" && profile_hasPubs(profile_from_closure) ? "## Selected Publications\n[2-4 most relevant publications from profile, copied verbatim]" : "",
      };

    case "creative":
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead with named work, the role you played (writer, director, producer, designer), audience scale (views, plays, units sold, screens), and any awards or notable critical reception. The portfolio link is essential.",
        voiceQuirk: "Use verbs of craft and authorship. Mention collaborators only when they sharpen the achievement.",
        extraSection: "",
      };

    default:
      return {
        sectionOrder: "exp-first",
        emphasis: "Lead each bullet with action + scope + outcome. Quantify where the profile provides numbers.",
        voiceQuirk: "",
        extraSection: "",
      };
  }
}

// Helper closures bound when called (avoid TS narrowing issues by passing profile in)
let profile_from_closure: Profile;
function profile_hasProjects(p: Profile) { return (p?.projects ?? []).length >= 2; }
function profile_hasPubs(p: Profile) { return (p?.publications ?? []).length >= 1; }

export function resumePrompt(profile: Profile, app: Application): string {
  profile_from_closure = profile;
  const atsKeywords = app.jdParsed?.keywords?.join(", ") ?? "";
  const keyReqs = app.jdParsed?.keyRequirements?.join("; ") ?? "";
  const techSkills = app.jdParsed?.technicalSkills?.join(", ") ?? "";

  // Build the exact education and experience blocks for the output template
  const eduBlock = (profile.education ?? []).map(ed => {
    let line = `${ed.degree}${ed.field ? ` in ${ed.field}` : ""} | ${ed.institution} | ${ed.years}`;
    if (ed.gpa) line += ` | GPA: ${ed.gpa}`;
    return line;
  }).join("\n") || "(copy from profile above)";

  const expCount = profile.experience.length;
  const yoeNum = parseInt((profile.yearsOfExperience || "0").replace(/[^0-9]/g, ""), 10) || 0;
  const guidance = getResumeStructureGuidance(profile.roleType, yoeNum);

  return `You are a senior resume strategist. Write a tailored, ATS-optimized resume for ${profile.name} applying for the ${app.role} role at ${app.company}.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

${atsKeywords ? `ATS KEYWORDS — weave these exact phrases in naturally: ${atsKeywords}` : ""}
${keyReqs ? `MUST-COVER REQUIREMENTS: ${keyReqs}` : ""}
${techSkills ? `MUST-LIST TECH SKILLS (only if candidate actually has them per profile): ${techSkills}` : ""}

---

ANTI-HALLUCINATION RULES — READ THESE FIRST, VIOLATING THEM IS A CRITICAL ERROR:
1. NEVER invent, guess, or extrapolate ANY fact. Every claim must exist in the CANDIDATE PROFILE above.
2. Education: copy institution names, degree names, and years EXACTLY as written in the profile. Do not alter, abbreviate, or guess. Do not add any education entry not listed.
3. Company names: copy exactly. Do not rename, consolidate, or infer employer names.
4. Metrics and numbers: use only numbers from the profile. NEVER invent percentages, revenue figures, team sizes, or timelines.
5. Skills: only list skills that appear in the profile's SKILLS section. Do not add "presumed" skills.
6. Projects: only reference projects listed in the profile. Do not fabricate project names.

EXPERIENCE INCLUSION RULES:
- There are ${expCount} experience entries in the profile. You MUST include ALL ${expCount} of them in the Experience section.
- For each entry, keep 2-4 bullets, reordering so JD-relevant bullets come first.
- You may trim low-relevance bullets but MUST NOT drop entire experience entries.
- Preserve the exact company name and tenure for every entry.

STYLE RULES:
- One page maximum — ~28-32 content lines. Ruthlessly trim BULLETS but never trim entries.
- Every bullet: strong past-tense action verb + specific action + outcome (quantified if profile has the number).
- No em dashes. No smart quotes. No unicode bullets — plain hyphens only.
- Banned: "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded", "facilitated", "synergies", "cutting-edge", "innovative solutions", "self-starter".
- Vary verbs. Do not start two consecutive bullets with the same word.
- Summary: 2-3 sentences. Lead with years + domain + distinctive angle. Weave 3-5 JD keywords.

ROLE-SPECIFIC GUIDANCE (this candidate is in: ${profile.roleType ?? "general"}, ${yoeNum} years exp):
- EMPHASIS: ${guidance.emphasis}
${guidance.voiceQuirk ? `- VOICE: ${guidance.voiceQuirk}` : ""}

OUTPUT FORMAT — markdown only, nothing before or after:
# ${profile.name}
${profile.email} | ${profile.phone} | ${profile.location}${profile.linkedin ? ` | [LinkedIn](${profile.linkedin})` : ""}${profile.github ? ` | [GitHub](${profile.github})` : ""}${profile.portfolio ? ` | [Portfolio](${profile.portfolio})` : ""}

## Summary
[2-3 sentences]
${guidance.sectionOrder === "edu-first" ? `
## Education
${eduBlock}
${guidance.extraSection ? `\n${guidance.extraSection}\n` : ""}
## Experience
[List ALL ${expCount} entries. If no experience, omit this section.]
### [Exact Role from Profile] | [Exact Company from Profile] | [Exact Tenure from Profile]
- [Most JD-relevant bullet]
- [Next bullet]

## Skills
**[Category]:** [comma-separated, JD terminology where applicable]
` : `
## Experience
[List ALL ${expCount} entries from the profile. Each in format:]
### [Exact Role from Profile] | [Exact Company from Profile] | [Exact Tenure from Profile]
- [Most JD-relevant bullet]
- [Next bullet]
- [...]

## Skills
**[Category]:** [comma-separated, JD terminology where applicable]
${guidance.extraSection ? `\n${guidance.extraSection}\n` : ""}
## Education
${eduBlock}
`}
${(profile.certifications ?? []).length > 0 ? `\n## Certifications\n${(profile.certifications ?? []).map(c => `- ${c.name} — ${c.issuer} (${c.date})`).join("\n")}` : ""}

Output the markdown now. No preamble. No explanation. Markdown only.`;
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

export function problemSolverPrompt(profile: Profile, app: Application): string {
  return `You are crafting a "Problem Solver Pitch" for ${profile.name} applying to ${app.company} for the ${app.role} role.

A Problem Solver Pitch is a structured argument that (1) names a specific real problem the company faces, (2) reasons about its structural difficulty, (3) proposes a concrete approach grounded in first principles, and (4) shows proven capability through past work. It is NOT a cover letter. It is a thinking document.

${buildProfileContext(profile)}

---

${buildJDContext(app)}

---

RULES:
1. No em dashes anywhere.
2. Be specific about ${app.company} — their business model, competitive position, sector dynamics, or known operational challenges. Do not be generic.
3. No sycophancy. No "I'm excited to", "I admire your", "I've been following".
4. Every section must reference something real from ${profile.name}'s profile or ${app.company}'s known context.
5. The "How I'd Approach It" section must be genuinely actionable — not abstract frameworks or buzzwords.
6. 450-550 words total. Write all six sections completely.

OUTPUT:

THE CORE PROBLEM AT ${app.company.toUpperCase()}
[3-4 sentences. Name a specific, non-obvious problem. Connect it to the JD — what challenge does this ${app.role} role exist to solve? Be precise about the sector dynamic or operational gap. No clichés.]

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

Write all six sections completely. Do not truncate.`;
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
