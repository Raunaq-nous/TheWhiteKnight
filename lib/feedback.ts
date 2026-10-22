// FEEDBACK CAPTURE. Structured events the playbook reflector learns from:
//   approval_decision  approve/reject at the gate, with an optional reason
//   bullet_unchecked   a bullet I unchecked in the resume builder
//   draft_edit         a refine instruction on a draft, or bullets I removed/added by hand
//   evaluator_findings the fresh-context evaluator's failing criteria
//   status_change      an application's status moved
//   reply              a reply / response recorded on an application
// Client-safe: types, validation, and a fire-and-forget recorder.

export type FeedbackKind = "approval_decision" | "bullet_unchecked" | "draft_edit" | "evaluator_findings" | "status_change" | "reply";
export const FEEDBACK_KINDS: FeedbackKind[] = ["approval_decision", "bullet_unchecked", "draft_edit", "evaluator_findings", "status_change", "reply"];

export type FeedbackContext = { applicationId?: string; company?: string; role?: string; archetype?: string; trackId?: string };

export type FeedbackEventInput =
  | ({ kind: "approval_decision"; approvalKind: string; decision: "approve" | "reject"; reason?: string } & FeedbackContext)
  | ({ kind: "bullet_unchecked"; sourceBulletId: string; text: string; employer?: string } & FeedbackContext)
  | ({ kind: "draft_edit"; artifact: string; instruction?: string; removed?: string[]; added?: string[] } & FeedbackContext)
  | ({ kind: "evaluator_findings"; artifact: string; verdict: "PASS" | "FAIL"; failing: string[] } & FeedbackContext)
  | ({ kind: "status_change"; from: string; to: string } & FeedbackContext)
  | ({ kind: "reply"; detail?: string } & FeedbackContext);

export type FeedbackEvent = FeedbackEventInput & { id: number; at: string };

const MAX_TEXT = 400;
const clip = (v: unknown, n = MAX_TEXT) => (typeof v === "string" ? v.slice(0, n) : undefined);
const clipList = (v: unknown) => (Array.isArray(v) ? v.slice(0, 20).map(x => String(x).slice(0, MAX_TEXT)) : undefined);

/** Validates and bounds an incoming event; null when malformed. */
export function sanitiseFeedback(raw: unknown): FeedbackEventInput | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!FEEDBACK_KINDS.includes(r.kind as FeedbackKind)) return null;
  const ctx: FeedbackContext = {
    applicationId: clip(r.applicationId, 80), company: clip(r.company, 120), role: clip(r.role, 160),
    archetype: clip(r.archetype, 40), trackId: clip(r.trackId, 40),
  };
  const strip = (o: FeedbackEventInput): FeedbackEventInput => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as FeedbackEventInput;
  switch (r.kind) {
    case "approval_decision":
      if (r.decision !== "approve" && r.decision !== "reject") return null;
      return strip({ kind: "approval_decision", approvalKind: clip(r.approvalKind, 60) ?? "unknown", decision: r.decision, reason: clip(r.reason), ...ctx });
    case "bullet_unchecked":
      if (!r.text) return null;
      return strip({ kind: "bullet_unchecked", sourceBulletId: clip(r.sourceBulletId, 40) ?? "", text: clip(r.text)!, employer: clip(r.employer, 120), ...ctx });
    case "draft_edit":
      return strip({ kind: "draft_edit", artifact: clip(r.artifact, 40) ?? "document", instruction: clip(r.instruction), removed: clipList(r.removed), added: clipList(r.added), ...ctx });
    case "evaluator_findings":
      if (r.verdict !== "PASS" && r.verdict !== "FAIL") return null;
      return strip({ kind: "evaluator_findings", artifact: clip(r.artifact, 40) ?? "document", verdict: r.verdict, failing: clipList(r.failing) ?? [], ...ctx });
    case "status_change":
      return strip({ kind: "status_change", from: clip(r.from, 30) ?? "", to: clip(r.to, 30) ?? "", ...ctx });
    case "reply":
      return strip({ kind: "reply", detail: clip(r.detail), ...ctx });
  }
  return null;
}

/** Fire-and-forget from the browser: feedback must never block or break the action it describes. */
export function recordFeedback(event: FeedbackEventInput): void {
  if (typeof window === "undefined") return;
  try {
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

/** The approval_decision event for a gate decision, with context lifted from the staged payload. */
export function approvalDecisionEvent(
  action: { kind: string; applicationId?: string; payload?: Record<string, unknown> },
  decision: "approve" | "reject",
  reason?: string,
): FeedbackEventInput {
  const p = action.payload ?? {};
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    kind: "approval_decision", approvalKind: action.kind, decision, reason: str(reason?.trim()),
    applicationId: action.applicationId ?? str(p.applicationId), company: str(p.company), role: str(p.role),
    archetype: str(p.archetype), trackId: str(p.trackId),
  };
}

type EvaluationLike = {
  verdict: "PASS" | "FAIL"; evaluatedAt: string; previousFindings?: string[]; error?: string;
  criteria: { label: string; pass: boolean; finding: string }[];
};
type AppLike = {
  id: string; company?: string; role?: string; status?: string; emailEvents?: unknown[];
  track?: { id: string; archetype: string } | null;
  evaluations?: Partial<Record<string, EvaluationLike>>;
};

/** The evaluator_findings event for one evaluation: failing criteria, plus a regenerated first draft's findings. */
export function evaluatorFindingsEvent(artifact: string, evaluation: EvaluationLike, ctx: FeedbackContext): FeedbackEventInput {
  const failing = [
    ...evaluation.criteria.filter(c => !c.pass).map(c => `${c.label}: ${c.finding}`),
    ...(evaluation.previousFindings ?? []).map(f => `first draft: ${f}`),
  ];
  if (evaluation.error) failing.push("evaluator call failed");
  return { kind: "evaluator_findings", artifact, verdict: evaluation.verdict, failing, ...ctx };
}

/** Context fields for an application, for any event about it. */
export function appContext(app: Pick<AppLike, "id" | "company" | "role" | "track"> | null | undefined): FeedbackContext {
  if (!app) return {};
  return { applicationId: app.id, company: app.company, role: app.role, archetype: app.track?.archetype, trackId: app.track?.id };
}

const OUTCOME_STATUSES = new Set(["interview", "offer", "rejected"]);

/**
 * Events implied by an application update: a status_change when the status
 * moves, and a reply when an email event is added or the status moves to an
 * outcome (interview, offer, rejected), since each means the employer answered;
 * and evaluator_findings for each newly stored evaluation.
 */
export function applicationChangeFeedback(prev: AppLike | null | undefined, changes: Partial<AppLike>): FeedbackEventInput[] {
  if (!prev) return [];
  const ctx = appContext({ ...prev, ...changes, id: prev.id });
  const out: FeedbackEventInput[] = [];
  const from = prev.status ?? "";
  const to = changes.status;
  if (to && to !== from) {
    out.push({ kind: "status_change", from, to, ...ctx });
    if (OUTCOME_STATUSES.has(to)) out.push({ kind: "reply", detail: `status moved to ${to}`, ...ctx });
  }
  const before = prev.emailEvents?.length ?? 0;
  const after = changes.emailEvents?.length;
  if (after !== undefined && after > before && !(to && OUTCOME_STATUSES.has(to) && to !== from)) {
    out.push({ kind: "reply", detail: `${after - before} email event(s) recorded`, ...ctx });
  }
  for (const [artifact, evaluation] of Object.entries(changes.evaluations ?? {})) {
    if (evaluation && evaluation.evaluatedAt !== prev.evaluations?.[artifact]?.evaluatedAt) {
      out.push(evaluatorFindingsEvent(artifact, evaluation, ctx));
    }
  }
  return out;
}

/**
 * bullet_unchecked events for the experience bullets I unchecked in the
 * builder before confirming (a whole section unchecked is not a per-bullet
 * signal, so it is skipped). Capped so one confirm cannot flood the log.
 */
export function uncheckedBulletEvents(
  draft: { experience: { company: string; bullets: { sourceBulletId?: string; text: string }[] }[] },
  checked: { sections: Record<string, boolean | undefined>; experience: boolean[][] },
  ctx: FeedbackContext,
  max = 12,
): FeedbackEventInput[] {
  if (checked.sections.experience === false) return [];
  const out: FeedbackEventInput[] = [];
  draft.experience.forEach((entry, i) => entry.bullets.forEach((b, j) => {
    if (checked.experience[i]?.[j] === false && out.length < max) {
      out.push({ kind: "bullet_unchecked", sourceBulletId: b.sourceBulletId ?? "", text: b.text, employer: entry.company, ...ctx });
    }
  }));
  return out;
}

type BulletsLike = { experience: { bullets: { text: string }[] }[] };

/** Bullet texts removed and added between two resume versions. */
export function resumeBulletDiff(before: BulletsLike | null | undefined, after: BulletsLike): { removed: string[]; added: string[] } {
  const texts = (c: BulletsLike | null | undefined) => new Set((c?.experience ?? []).flatMap(e => e.bullets.map(b => b.text)));
  const a = texts(before);
  const b = texts(after);
  return { removed: [...a].filter(t => !b.has(t)), added: [...b].filter(t => !a.has(t)) };
}
