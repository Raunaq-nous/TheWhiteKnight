"use client";
// Settings > Model gateway: the OpenRouter chain per task family (one model
// id per line, tried in order), monthly spend caps per paid provider with
// this month's spend, and the recent calls per task with the model that
// served each. Editing is admin-only (server-wide provider keys).
import { useEffect, useState } from "react";

type Chain = "structured" | "writing" | "vision";
type Call = { at: string; task: string; provider: string; modelRequested: string; modelServed: string; promptTokens: number; completionTokens: number; reasoningTokens: number; costUsd: number; ok: boolean; error?: string };
type View = {
  isAdmin: boolean;
  keys: { openrouter: boolean; together: boolean };
  defaults: Record<Chain, string[]>;
  edited: Partial<Record<Chain, string[]>>;
  resolved: Record<Chain, string[]>;
  caps: Partial<Record<string, number | null>>;
  spend: Record<string, number>;
  recentCalls: Record<string, Call[]>;
};

const CHAIN_LABELS: Record<Chain, string> = {
  structured: "Structured tasks (scoring, JD extraction, requirement map, resume selection, gap analysis, evaluator, skill extraction)",
  writing: "Writing (summary, cover letters, outreach, pitches)",
  vision: "Vision (screenshots and PDFs)",
};
const PROVIDERS = ["openrouter", "together", "anthropic", "openai"];

export function ModelGatewaySettings() {
  const [view, setView] = useState<View | null>(null);
  const [chains, setChains] = useState<Record<Chain, string>>({ structured: "", writing: "", vision: "" });
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = (v: View) => {
    setView(v);
    setChains({ structured: v.resolved.structured.join("\n"), writing: v.resolved.writing.join("\n"), vision: v.resolved.vision.join("\n") });
    setCaps(Object.fromEntries(PROVIDERS.map(p => [p, v.caps[p] === null || v.caps[p] === undefined ? "" : String(v.caps[p])])));
  };

  useEffect(() => {
    fetch("/api/gateway").then(r => r.ok ? r.json() : null).then(v => v && load(v)).catch(() => setMsg("Could not load the model gateway."));
  }, []);

  const save = async () => {
    setMsg("Saving...");
    const res = await fetch("/api/gateway", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chains: Object.fromEntries(Object.entries(chains).map(([k, v]) => [k, v.split("\n").map(x => x.trim()).filter(Boolean)])),
        caps: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, v.trim() === "" ? null : Number(v)])),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(body.error ?? "Save failed."); return; }
    load(body);
    setMsg("Saved.");
  };

  if (!view) return <div className="label" style={{ color: "var(--text-tertiary)" }}>{msg || "Loading model gateway..."}</div>;
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.75rem" };

  return (
    <div data-testid="model-gateway-settings" style={{ ...mono, display: "grid", gap: 16 }}>
      <div style={{ color: "var(--text-secondary)" }}>
        OpenRouter key {view.keys.openrouter ? "set" : "missing (OPENROUTER_API_KEY)"} · Together key {view.keys.together ? "set (last fallback)" : "missing"}
        . Each chain is sent as OpenRouter's fallback list with data collection denied. Validate ids with <code>npm run check:models</code>.
      </div>
      {(Object.keys(CHAIN_LABELS) as Chain[]).map(c => (
        <label key={c} style={{ display: "grid", gap: 4 }}>
          <span className="label">{CHAIN_LABELS[c]}{view.edited[c]?.length ? "" : " (default)"}</span>
          <textarea rows={3} value={chains[c]} disabled={!view.isAdmin} onChange={e => setChains({ ...chains, [c]: e.target.value })} style={{ ...mono, width: "100%" }} />
        </label>
      ))}
      <div>
        <div className="label" style={{ marginBottom: 6 }}>MONTHLY SPEND CAPS (USD; blank = no cap). At the cap a provider is skipped.</div>
        {PROVIDERS.map(p => (
          <div key={p} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ width: 90 }}>{p}</span>
            <input type="number" min={0} step="0.5" value={caps[p] ?? ""} disabled={!view.isAdmin} onChange={e => setCaps({ ...caps, [p]: e.target.value })} style={{ ...mono, width: 100 }} />
            <span style={{ color: "var(--text-tertiary)" }}>spent this month ${(view.spend[p] ?? 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
      {view.isAdmin
        ? <div><button className="btn btn-primary" onClick={save}>SAVE GATEWAY</button> <span>{msg}</span></div>
        : <div style={{ color: "var(--text-tertiary)" }}>Only the admin can edit the gateway.</div>}
      <div>
        <div className="label" style={{ marginBottom: 6 }}>RECENT CALLS PER TASK (which model served each)</div>
        {Object.keys(view.recentCalls).length === 0 && <div style={{ color: "var(--text-tertiary)" }}>No calls recorded yet.</div>}
        {Object.entries(view.recentCalls).map(([task, calls]) => (
          <div key={task} style={{ marginBottom: 10 }}>
            <div style={{ color: "var(--accent)" }}>{task}</div>
            {calls.map((c, i) => (
              <div key={i} style={{ color: c.ok ? "var(--text-secondary)" : "var(--error)" }}>
                {new Date(c.at).toLocaleString()} · {c.provider} · {c.ok ? c.modelServed : `failed (${c.error ?? "error"})`} · {c.promptTokens}+{c.completionTokens} tok ({c.reasoningTokens} reasoning) · ${c.costUsd.toFixed(4)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
