// THE PLAYBOOK. Rules learned from my own feedback, injected into generation.
//   - A reflector proposes rules from recent feedback events; each proposal
//     stays pending until I accept or reject it. Nothing is accepted
//     automatically.
//   - The playbook changes one rule at a time: accepting a proposal adds
//     exactly one rule, removing a rule removes exactly one. Each change bumps
//     the version and is logged; there is no wholesale replace.
//   - Rules shape tone and selection only. They never override the hard rules
//     (approval gate, profile-only bullets, confidentiality, no em dashes), and
//     a proposal that tries to is dropped before it reaches me.
// Pure and client-safe.

export type PlaybookArtifact = "resume" | "cover-letter" | "outreach" | "all";
export const PLAYBOOK_ARTIFACTS: PlaybookArtifact[] = ["resume", "cover-letter", "outreach", "all"];

export type PlaybookScope = { artifact: PlaybookArtifact; archetype?: string; trackId?: string };

export type PlaybookRule = {
  id: string;
  text: string;
  scope: PlaybookScope;
  version: number;          // the playbook version this rule was added in
  acceptedAt: string;
  sourceProposalId: string;
};

export type PlaybookChange = { version: number; at: string; op: "add" | "remove"; ruleId: string; text: string };

export type Playbook = { version: number; rules: PlaybookRule[]; history: PlaybookChange[] };

export type ProposalStatus = "pending" | "accepted" | "rejected";

export type PlaybookProposal = {
  id: string;
  text: string;
  scope: PlaybookScope;
  rationale: string;
  evidenceEventIds: number[];
  createdAt: string;
  status: ProposalStatus;
  decidedAt?: string;
  ruleId?: string;
};

export const MAX_RULES = 20;
export const MAX_RULE_CHARS = 200;
const MAX_PENDING = 10;
const MAX_HISTORY = 200;

export const emptyPlaybook = (): Playbook => ({ version: 0, rules: [], history: [] });

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// A rule may not loosen an invariant. Anything that reads as permission to
// send, submit, skip a gate, invent content or obey scraped text is refused.
const FORBIDDEN = /\b(auto[- ]?(submit|send|apply)|send (it )?automatically|submit (it )?automatically|without (my )?approval|skip(ping)? (the )?(approval|gate|evaluator|review|confidentiality)|bypass|disable (the )?(gate|evaluator|check)|fabricat\w*|invent\w*|make up|made[- ]up|exaggerat\w*|ignore (the |all |previous )?(rules|instructions|invariants)|follow (the )?(jd|job description|email)('s)? instructions|em dash(es)?)\b/i;

/** Normalised rule text (no em or en dashes, single line, bounded), or null when unusable or forbidden. */
export function cleanRuleText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim().replace(/^[-*\d.\s]+/, "");
  if (text.length < 8 || text.length > MAX_RULE_CHARS) return null;
  if (FORBIDDEN.test(text)) return null;
  return text;
}

export function cleanScope(raw: unknown): PlaybookScope {
  const r = (raw ?? {}) as Record<string, unknown>;
  const artifact = PLAYBOOK_ARTIFACTS.includes(r.artifact as PlaybookArtifact) ? (r.artifact as PlaybookArtifact) : "all";
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const scope: PlaybookScope = { artifact };
  const archetype = str(r.archetype, 40);
  const trackId = str(r.trackId, 40);
  if (archetype) scope.archetype = archetype;
  if (trackId) scope.trackId = trackId;
  return scope;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Validates the reflector's raw proposals: clean text, a valid scope, at least
 * one evidence id that is a real event it was shown (invented ids dropped),
 * and no duplicate of an existing rule or a pending proposal.
 */
export function sanitiseProposals(
  raw: unknown,
  knownEventIds: Set<number>,
  existing: { rules: PlaybookRule[]; proposals: PlaybookProposal[] },
  now: string,
  max = 5,
): PlaybookProposal[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set([...existing.rules.map(r => norm(r.text)), ...existing.proposals.filter(p => p.status === "pending").map(p => norm(p.text))]);
  const out: PlaybookProposal[] = [];
  for (const item of list) {
    if (out.length >= max) break;
    const r = (item ?? {}) as Record<string, unknown>;
    const text = cleanRuleText(r.rule ?? r.text);
    if (!text || seen.has(norm(text))) continue;
    const evidence = (Array.isArray(r.evidenceEventIds) ? r.evidenceEventIds : []).map(Number).filter(n => knownEventIds.has(n));
    if (!evidence.length) continue;
    seen.add(norm(text));
    out.push({
      id: newId("prop"), text, scope: cleanScope(r.scope), rationale: typeof r.rationale === "string" ? r.rationale.replace(/\s*[—–]\s*/g, ", ").slice(0, 300) : "",
      evidenceEventIds: [...new Set(evidence)].slice(0, 10), createdAt: now, status: "pending",
    });
  }
  return out;
}

/** Adds new pending proposals, keeping at most MAX_PENDING pending and the decided ones as a short log. */
export function addProposals(current: PlaybookProposal[], fresh: PlaybookProposal[]): PlaybookProposal[] {
  const pending = [...current.filter(p => p.status === "pending"), ...fresh].slice(-MAX_PENDING);
  const decided = current.filter(p => p.status !== "pending").slice(-50);
  return [...decided, ...pending];
}

export type DecideResult = { ok: true; playbook: Playbook; proposals: PlaybookProposal[]; rule?: PlaybookRule } | { ok: false; error: string };

/** Accept or reject ONE pending proposal. Accepting adds exactly one rule and bumps the version. */
export function decideProposal(playbook: Playbook, proposals: PlaybookProposal[], proposalId: string, decision: "accept" | "reject", now: string): DecideResult {
  const proposal = proposals.find(p => p.id === proposalId);
  if (!proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.status !== "pending") return { ok: false, error: `Proposal already ${proposal.status}` };
  if (decision === "reject") {
    return { ok: true, playbook, proposals: proposals.map(p => (p.id === proposalId ? { ...p, status: "rejected" as const, decidedAt: now } : p)) };
  }
  if (playbook.rules.length >= MAX_RULES) return { ok: false, error: `The playbook holds at most ${MAX_RULES} rules; remove one first` };
  if (playbook.rules.some(r => norm(r.text) === norm(proposal.text))) return { ok: false, error: "That rule is already in the playbook" };
  const version = playbook.version + 1;
  const rule: PlaybookRule = { id: newId("rule"), text: proposal.text, scope: proposal.scope, version, acceptedAt: now, sourceProposalId: proposal.id };
  return {
    ok: true,
    rule,
    playbook: { version, rules: [...playbook.rules, rule], history: [...playbook.history, { version, at: now, op: "add" as const, ruleId: rule.id, text: rule.text }].slice(-MAX_HISTORY) },
    proposals: proposals.map(p => (p.id === proposalId ? { ...p, status: "accepted" as const, decidedAt: now, ruleId: rule.id } : p)),
  };
}

/** Remove ONE rule by id and bump the version. */
export function removeRule(playbook: Playbook, ruleId: string, now: string): { ok: true; playbook: Playbook } | { ok: false; error: string } {
  const rule = playbook.rules.find(r => r.id === ruleId);
  if (!rule) return { ok: false, error: "Rule not found" };
  const version = playbook.version + 1;
  return {
    ok: true,
    playbook: { version, rules: playbook.rules.filter(r => r.id !== ruleId), history: [...playbook.history, { version, at: now, op: "remove" as const, ruleId, text: rule.text }].slice(-MAX_HISTORY) },
  };
}

/** The rules that apply to one generation: matching artifact (or "all"), and archetype / track when the rule names one. */
export function rulesFor(playbook: Playbook | null | undefined, target: { artifact: Exclude<PlaybookArtifact, "all">; archetype?: string | null; trackId?: string | null }): string[] {
  return (playbook?.rules ?? [])
    .filter(r => r.scope.artifact === "all" || r.scope.artifact === target.artifact)
    .filter(r => !r.scope.archetype || r.scope.archetype === target.archetype)
    .filter(r => !r.scope.trackId || r.scope.trackId === target.trackId)
    .map(r => r.text);
}

/** Which playbook artifact a generation action belongs to. */
export function playbookArtifactFor(action: string): Exclude<PlaybookArtifact, "all"> {
  if (action === "resume" || action === "refine") return "resume";
  if (action === "cover-letter") return "cover-letter";
  return "outreach";
}
