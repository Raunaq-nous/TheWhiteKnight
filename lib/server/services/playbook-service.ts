import "server-only";
// The playbook, server side: stored per user in the singletons table, the
// reflector that proposes rules from recent feedback (structured chain), and
// one-at-a-time decisions. Nothing is accepted automatically: a proposal
// only becomes a rule through decide(), which the Playbook page calls on my
// click. Feedback text is data, never instructions.

import { z } from "zod";
import { chatJSON, type ProviderSettings } from "../../ai-client";
import { reflectorPrompt } from "../../prompts";
import { getUserSingleton, setUserSingleton } from "../user-singletons";
import { feedbackRepo } from "../repositories/feedback-repo";
import {
  addProposals, decideProposal, emptyPlaybook, removeRule, sanitiseProposals,
  type Playbook, type PlaybookProposal, type PlaybookRule,
} from "../../playbook";

const PLAYBOOK_KEY = "playbook";
const PROPOSALS_KEY = "playbook_proposals";
export const REFLECTOR_EVENT_LIMIT = 150;
export const MIN_EVENTS_TO_REFLECT = 3;

const ReflectorSchema = z.object({
  proposals: z.array(z.object({
    rule: z.string(),
    scope: z.object({ artifact: z.string(), archetype: z.string().optional().nullable(), trackId: z.string().optional().nullable() }).passthrough(),
    rationale: z.string().optional().default(""),
    evidenceEventIds: z.array(z.union([z.number(), z.string()])).default([]),
  }).passthrough()).default([]),
});

export function getPlaybook(userEmail: string): Playbook {
  return getUserSingleton<Playbook>(userEmail, PLAYBOOK_KEY) ?? emptyPlaybook();
}

export function getProposals(userEmail: string): PlaybookProposal[] {
  return getUserSingleton<PlaybookProposal[]>(userEmail, PROPOSALS_KEY) ?? [];
}

/** The playbook for a generation; null when there is none or storage is unavailable, so generation never fails on it. */
export function playbookForGeneration(userEmail: string | null | undefined): Playbook | null {
  if (!userEmail) return null;
  try { return getPlaybook(userEmail); } catch { return null; }
}

/**
 * Runs the reflector over recent feedback and stores what it proposes as
 * PENDING. Proposals are validated (evidence must cite real events, forbidden
 * or duplicate rules are dropped); none is accepted here.
 */
export async function proposeRules(userEmail: string, opts: { providerSettings?: ProviderSettings; now?: Date } = {}): Promise<{ proposals: PlaybookProposal[]; eventsRead: number; skipped?: string }> {
  const events = feedbackRepo.recent(userEmail, REFLECTOR_EVENT_LIMIT);
  if (events.length < MIN_EVENTS_TO_REFLECT) return { proposals: [], eventsRead: events.length, skipped: `Need at least ${MIN_EVENTS_TO_REFLECT} feedback events; have ${events.length}` };
  const playbook = getPlaybook(userEmail);
  const current = getProposals(userEmail);
  const r = await chatJSON<z.infer<typeof ReflectorSchema>>(
    [{ role: "user", content: reflectorPrompt({ events, rules: playbook.rules.map(x => x.text), pending: current.filter(p => p.status === "pending").map(p => p.text) }) }],
    { temperature: 0.2, maxTokens: 1500, task: "reflector" },
    opts.providerSettings,
    ReflectorSchema,
  );
  const fresh = sanitiseProposals(r?.proposals, new Set(events.map(e => e.id)), { rules: playbook.rules, proposals: current }, (opts.now ?? new Date()).toISOString());
  if (fresh.length) setUserSingleton(userEmail, PROPOSALS_KEY, addProposals(current, fresh));
  return { proposals: fresh, eventsRead: events.length };
}

/** Accept or reject ONE proposal. */
export function decide(userEmail: string, proposalId: string, decision: "accept" | "reject"): { ok: true; rule?: PlaybookRule; playbook: Playbook } | { ok: false; error: string } {
  const result = decideProposal(getPlaybook(userEmail), getProposals(userEmail), proposalId, decision, new Date().toISOString());
  if (!result.ok) return result;
  setUserSingleton(userEmail, PROPOSALS_KEY, result.proposals);
  if (result.rule) setUserSingleton(userEmail, PLAYBOOK_KEY, result.playbook);
  return { ok: true, rule: result.rule, playbook: result.playbook };
}

/** Remove ONE rule. */
export function remove(userEmail: string, ruleId: string): { ok: true; playbook: Playbook } | { ok: false; error: string } {
  const result = removeRule(getPlaybook(userEmail), ruleId, new Date().toISOString());
  if (result.ok) setUserSingleton(userEmail, PLAYBOOK_KEY, result.playbook);
  return result;
}
