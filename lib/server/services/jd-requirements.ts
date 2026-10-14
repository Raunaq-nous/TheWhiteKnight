import "server-only";
// Step 0 of resume generation: the JD's top 5 requirements, extracted
// before ranking or writing. They drive the ranking prompt, the summary's
// sentences 2-3 and skills selection, and verify-resume prints the bullet
// covering each. Fewer than 3 means the JD text is too thin to tailor to,
// and that is flagged rather than papered over.

import { z } from "zod";
import { chatJSON, type ProviderSettings } from "../../ai-client";
import { jdTopRequirementsPrompt } from "../../prompts";
import { normalizeTextForATS } from "../../ats";
import type { Application } from "../../store";

export const JD_TOP_REQUIREMENTS = 5;
export const JD_MIN_REQUIREMENTS = 3;
export const JD_TOO_THIN_WARNING =
  "The JD text is too thin to tailor to: fewer than 3 concrete requirements could be extracted. Paste the full job description for a targeted resume.";

const Schema = z.object({ requirements: z.array(z.string()) });

export type JdRequirements = { requirements: string[]; tooThin: boolean; warning: string | null; source: "model" | "parsed" };

function clean(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map(r => normalizeTextForATS(String(r ?? "")).trim())
    .filter(r => r.length >= 3 && r.length <= 160)
    .filter(r => { const k = r.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, JD_TOP_REQUIREMENTS);
}

export async function extractTopRequirements(app: Application, providerSettings?: ProviderSettings): Promise<JdRequirements> {
  let requirements: string[] = [];
  let source: JdRequirements["source"] = "model";
  const hasText = (app.jdRaw ?? "").trim().length > 0 || (app.jdParsed?.keyRequirements?.length ?? 0) > 0;
  if (hasText) {
    try {
      const data = await chatJSON<z.infer<typeof Schema>>(
        [{ role: "user", content: jdTopRequirementsPrompt(app) }],
        { temperature: 0, maxTokens: 400, task: "jd_extraction" },
        providerSettings,
        Schema,
      );
      requirements = clean(data?.requirements ?? []);
    } catch (e) {
      console.warn(`[CareerOS] JD requirement extraction failed, using parsed requirements: ${(e as Error).message}`);
    }
  }
  if (requirements.length === 0) {
    requirements = clean(app.jdParsed?.keyRequirements ?? []);
    source = "parsed";
  }
  const tooThin = requirements.length < JD_MIN_REQUIREMENTS;
  return { requirements, tooThin, warning: tooThin ? JD_TOO_THIN_WARNING : null, source };
}
