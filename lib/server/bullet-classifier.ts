import "server-only";
// Classifies experience bullets as consulting_engagement or ai_build ONCE,
// at write time (see lib/bullet-category.ts). Bullet text comes from the
// user's own pasted text, portfolio repo or answers: it is treated as data
// to classify, never as instructions.

import { z } from "zod";
import { chatJSON, type ProviderSettings } from "../ai-client";
import { bulletCategoryPrompt } from "../prompts";
import { parseBulletCategory } from "../bullet-category";
import type { BulletCategory } from "../profile";

const ResultSchema = z.object({
  categories: z.array(z.object({ index: z.number(), category: z.string() })),
});

export type BulletToClassify = { company: string; role?: string | null; text: string };

/**
 * One category per input bullet, index-aligned. If the model call fails, or
 * omits a bullet, that bullet is stored as a consulting engagement (the
 * meaning an untagged bullet has anyway): writes never block on this.
 */
export async function classifyBulletCategories(
  bullets: BulletToClassify[],
  providerSettings?: ProviderSettings,
): Promise<BulletCategory[]> {
  const out: BulletCategory[] = bullets.map(() => "consulting_engagement");
  if (bullets.length === 0) return out;
  try {
    const data = await chatJSON<z.infer<typeof ResultSchema>>(
      [{ role: "user", content: bulletCategoryPrompt(bullets) }],
      { temperature: 0, maxTokens: 60 + bullets.length * 25, task: "profile_extraction" },
      providerSettings,
      ResultSchema,
    );
    for (const c of data.categories ?? []) {
      if (Number.isInteger(c.index) && c.index >= 0 && c.index < out.length) out[c.index] = parseBulletCategory(c.category);
    }
  } catch (e) {
    console.warn(`[CareerOS] bullet classification failed, storing consulting_engagement: ${(e as Error).message}`);
  }
  return out;
}

/** Classifies every bullet of extracted experience candidates and attaches bulletCategories (text -> category). */
export async function attachBulletCategories<C extends { company: string; role?: string | null; bullets: string[]; bulletCategories?: Record<string, BulletCategory> | null }>(
  candidates: C[] | null | undefined,
  providerSettings?: ProviderSettings,
): Promise<C[]> {
  const list = candidates ?? [];
  const flat = list.flatMap(c => c.bullets.map(text => ({ company: c.company, role: c.role, text })));
  const categories = await classifyBulletCategories(flat, providerSettings);
  let i = 0;
  return list.map(c => ({
    ...c,
    bulletCategories: Object.fromEntries(c.bullets.map(text => [text, categories[i++]])),
  }));
}
