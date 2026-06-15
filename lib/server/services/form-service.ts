import "server-only";
import { chatJSON } from "../../ai-client";
import { FormQAResultSchema } from "../../schemas";
import { applicationRepo } from "../repositories/application-repo";
import { profileRepo } from "../repositories/profile-repo";
import { settingsRepo } from "../repositories/settings-repo";

export type FormAnswer = { question: string; answer: string };

export type StagedFormEntry = {
  screenshotRef: string;
  filledFields: Array<{ field: string; value: string }>;
  stagedAt: string;
  formUrl?: string;
};

/**
 * Generate answers for a list of form field labels.
 *
 * SECURITY: every item in formFields is treated as inert text data.
 * Labels are joined and placed inside a clearly delimited section of the
 * prompt. They never direct tool selection, never trigger execution, and
 * are never interpolated outside the data section.
 */
export async function getFormAnswers(
  userEmail: string,
  applicationId: string,
  formFields: string[],
): Promise<FormAnswer[]> {
  const app = applicationRepo.getById(userEmail, applicationId);
  if (!app) throw new Error(`Application ${applicationId} not found`);

  const profile = profileRepo.get(userEmail);
  if (!profile) throw new Error("Profile not found; set up your profile first");

  const modelSettings = settingsRepo.getModelSettings(userEmail);
  const providerSettings = { provider: modelSettings.provider as "together", model: modelSettings.model };

  // formFields are inert data — join as plain text, never eval.
  const questionsText = formFields.join("\n");

  const headline = profile.headline ?? "";
  const yoe = profile.yearsOfExperience ?? "";
  const location = profile.location ?? "";
  const skills = Object.values(profile.skills ?? {}).join(", ");
  const experience = (profile.experience ?? []).slice(0, 4).map((e: any) =>
    `${e.role} at ${e.company} (${e.duration ?? ""}): ${e.description ?? ""}`
  ).join("\n");
  const education = (profile.education ?? []).map((e: any) =>
    `${e.degree} from ${e.institution} (${e.year ?? ""})`
  ).join(", ");
  const jdSnippet = app.jdRaw ? app.jdRaw.slice(0, 2000) : "";

  const prompt = `You are a career coach helping a candidate write compelling application form answers.

CANDIDATE PROFILE:
- Headline: ${headline}
- Years of experience: ${yoe}
- Location: ${location}
- Skills: ${skills}

EXPERIENCE:
${experience}

EDUCATION: ${education}

JOB CONTEXT:
- Company: ${app.company}
- Role: ${app.role}
${jdSnippet ? `- Job description excerpt:\n${jdSnippet}` : ""}

FORM INPUT (extract every distinct question from the text below, then answer each):
---
${questionsText.slice(0, 4000)}
---

RULES FOR ANSWERS:
1. Write in first person, past/present tense as appropriate.
2. Use STAR format for behavioural questions, written as flowing prose.
3. Quantify wherever the candidate's background supports it. Do not invent metrics.
4. Keep each answer to 3-5 sentences unless the question clearly warrants more.
5. Never use em dashes. Use commas or restructure.
6. If a question has a word-count limit, stay within it.

Output JSON only:
{
  "qa": [
    { "question": "Exact question text", "answer": "Answer..." }
  ]
}`;

  const data = await chatJSON<{ qa: FormAnswer[] }>(
    [{ role: "user", content: prompt }],
    { temperature: 0.4, maxTokens: 4000 },
    providerSettings,
    FormQAResultSchema,
  );

  return data.qa ?? [];
}

/**
 * Persist a staged (filled but NOT submitted) form result.
 *
 * INVARIANT: this function never changes application status.
 * "applied" / "submitted" can only be set from the authenticated web UI
 * after the human actually clicks submit. The agent must not be able to
 * assert a real-world submit happened.
 */
export function persistStagedForm(
  userEmail: string,
  applicationId: string,
  entry: Omit<StagedFormEntry, "stagedAt">,
): StagedFormEntry {
  const app = applicationRepo.getById(userEmail, applicationId);
  if (!app) throw new Error(`Application ${applicationId} not found`);

  const stagedEntry: StagedFormEntry = { ...entry, stagedAt: new Date().toISOString() };

  // status is intentionally absent from this update.
  applicationRepo.update(userEmail, applicationId, {
    stagedForms: [...(app.stagedForms ?? []), stagedEntry],
  });

  return stagedEntry;
}
