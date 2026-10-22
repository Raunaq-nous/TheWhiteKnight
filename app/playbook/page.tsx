"use client";
// /playbook: rules learned from my own feedback. On demand, a reflector reads
// recent feedback events (approvals and rejections with reasons, unchecked
// bullets, draft edits, evaluator findings, status changes and replies) and
// proposes specific rules. I accept or reject each one; nothing is accepted
// automatically. Accepted rules are versioned, individually removable, and
// injected into generation prompts for the artifacts they are scoped to.
import { useCallback, useEffect, useState } from "react";
import { Header, Footer } from "../components";
import { getModelSettings } from "../../lib/model-settings";
import type { Playbook, PlaybookProposal, PlaybookScope } from "../../lib/playbook";
import type { FeedbackEvent } from "../../lib/feedback";

type View = {
  playbook: Playbook;
  proposals: PlaybookProposal[];
  feedback: { counts: Record<string, number>; recent: FeedbackEvent[] };
};

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.75rem" };
const small: React.CSSProperties = { ...mono, fontSize: "0.6875rem", color: "var(--text-tertiary)" };

function providerSettings() {
  const s = getModelSettings();
  return s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
}

function scopeLabel(s: PlaybookScope): string {
  return [s.artifact === "all" ? "all artifacts" : s.artifact, s.archetype, s.trackId].filter(Boolean).join(" · ");
}

function eventLine(e: FeedbackEvent): string {
  const who = [e.company, e.role].filter(Boolean).join(", ");
  const tail = who ? ` (${who})` : "";
  switch (e.kind) {
    case "approval_decision": return `${e.decision === "approve" ? "Approved" : "Rejected"} ${e.approvalKind}${e.reason ? `: "${e.reason}"` : ""}${tail}`;
    case "bullet_unchecked": return `Unchecked bullet${e.employer ? ` at ${e.employer}` : ""}: "${e.text}"${tail}`;
    case "draft_edit": return `Edited ${e.artifact}${e.instruction ? `: "${e.instruction}"` : ""}${e.removed?.length ? `, removed ${e.removed.length}` : ""}${e.added?.length ? `, added ${e.added.length}` : ""}${tail}`;
    case "evaluator_findings": return `Review ${e.verdict} on ${e.artifact}${e.failing.length ? `: ${e.failing.slice(0, 2).join("; ")}` : ""}${tail}`;
    case "status_change": return `Status ${e.from} to ${e.to}${tail}`;
    case "reply": return `Reply${e.detail ? `: ${e.detail}` : ""}${tail}`;
  }
}

export default function PlaybookPage() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/playbook").catch(() => null);
    if (r?.ok) setView(await r.json());
    else setMsg("Could not load the playbook.");
  }, []);
  useEffect(() => { load(); }, [load]);

  const propose = async () => {
    setBusy("propose"); setMsg("");
    try {
      const r = await fetch("/api/playbook/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerSettings: providerSettings() }) });
      const data = await r.json();
      if (!r.ok) setMsg(data.error ?? `Reflector failed (${r.status})`);
      else setMsg(data.skipped ?? (data.proposals.length ? `${data.proposals.length} new proposal(s) from ${data.eventsRead} events.` : `No new pattern in ${data.eventsRead} events.`));
      await load();
    } finally { setBusy(""); }
  };

  const decide = async (proposalId: string, decision: "accept" | "reject") => {
    setBusy(proposalId); setMsg("");
    try {
      const r = await fetch("/api/playbook/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId, decision }) });
      if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? "Decision failed");
      await load();
    } finally { setBusy(""); }
  };

  const removeRule = async (ruleId: string) => {
    setBusy(ruleId); setMsg("");
    try {
      const r = await fetch("/api/playbook/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId }) });
      if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? "Remove failed");
      await load();
    } finally { setBusy(""); }
  };

  const pending = view?.proposals.filter(p => p.status === "pending") ?? [];
  const totalEvents = Object.values(view?.feedback.counts ?? {}).reduce((n, c) => n + c, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">PLAYBOOK {view ? `v${view.playbook.version}` : ""}</span>
          <button className="btn btn-primary" style={{ fontSize: "0.625rem" }} disabled={!!busy} onClick={propose} data-testid="playbook-propose">
            {busy === "propose" ? "READING FEEDBACK..." : "PROPOSE RULES FROM FEEDBACK"}
          </button>
        </div>
        <p style={{ ...small, marginBottom: 16 }}>
          Rules learned from your own feedback, added one at a time and only when you accept them. Accepted rules are injected into resume,
          cover letter and outreach generation for the scope shown. They never override the hard rules.
        </p>
        {msg && <p style={{ ...mono, color: "var(--text-secondary)" }}>{msg}</p>}

        <div className="section-header" style={{ marginTop: 16 }}><span className="section-title">PROPOSED ({pending.length})</span></div>
        {pending.length === 0 && <p style={small}>No proposals waiting. Run the reflector once feedback has built up.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.map(p => (
            <div key={p.id} className="card" style={{ borderLeft: "3px solid var(--accent)" }} data-testid="playbook-proposal">
              <div style={{ ...mono, fontSize: "0.8125rem", color: "var(--text-primary)" }}>{p.text}</div>
              <div style={{ ...small, marginTop: 4 }}>{scopeLabel(p.scope)}{p.rationale ? ` · ${p.rationale}` : ""}</div>
              <div style={{ ...small, marginTop: 2 }}>Evidence: events {p.evidenceEventIds.map(id => `#${id}`).join(", ")}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: "0.625rem", padding: "4px 10px" }} disabled={!!busy} onClick={() => decide(p.id, "accept")}>ACCEPT</button>
                <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} disabled={!!busy} onClick={() => decide(p.id, "reject")}>REJECT</button>
              </div>
            </div>
          ))}
        </div>

        <div className="section-header" style={{ marginTop: 24 }}><span className="section-title">RULES ({view?.playbook.rules.length ?? 0})</span></div>
        {view && view.playbook.rules.length === 0 && <p style={small}>No rules yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {view?.playbook.rules.map(r => (
            <div key={r.id} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 8 }} data-testid="playbook-rule">
              <div>
                <div style={{ ...mono, fontSize: "0.8125rem", color: "var(--text-primary)" }}>{r.text}</div>
                <div style={{ ...small, marginTop: 4 }}>{scopeLabel(r.scope)} · added in v{r.version} · {new Date(r.acceptedAt).toLocaleDateString()}</div>
              </div>
              <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px", flexShrink: 0 }} disabled={!!busy} onClick={() => removeRule(r.id)}>REMOVE</button>
            </div>
          ))}
        </div>

        {view && view.playbook.history.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: 24 }}><span className="section-title">HISTORY</span></div>
            {[...view.playbook.history].reverse().slice(0, 20).map(h => (
              <div key={`${h.version}-${h.ruleId}`} style={small}>v{h.version} · {h.op === "add" ? "added" : "removed"}: {h.text}</div>
            ))}
          </>
        )}

        <div className="section-header" style={{ marginTop: 24 }}><span className="section-title">RECENT FEEDBACK ({totalEvents})</span></div>
        {view && Object.keys(view.feedback.counts).length > 0 && (
          <p style={small}>{Object.entries(view.feedback.counts).map(([k, n]) => `${k.replace(/_/g, " ")}: ${n}`).join(" · ")}</p>
        )}
        {view?.feedback.recent.map(e => (
          <div key={e.id} style={{ ...small, marginTop: 2 }}>#{e.id} · {new Date(e.at).toLocaleDateString()} · {eventLine(e)}</div>
        ))}
      </main>
      <Footer />
    </div>
  );
}
