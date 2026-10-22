"use client";
// /skills, per career track: demand ranking from real JDs (rolling 90 days,
// emerging skills flagged), my coverage of each demanded skill (strong /
// weak / none, with the evidencing bullet), the gaps, and a pathway per gap.
// Seeded pathways come from docs/CAREER-TRACKS.md; a gap with no seed can
// get a model-drafted pathway, marked DRAFT until accepted or edited.
// Finishing a proof artifact offers a profile bullet: written by you,
// checked against the confidentiality gate, and added only when you click.
// Pathways are learning plans and never appear on a resume as claims.
import { useEffect, useState } from "react";
import { CareerTrackPicker } from "./career-track-picker";
import { getProfile, saveProfile } from "../lib/profile";
import { appendGapAnswerToProfile } from "../lib/profile-enrichment";
import { getModelSettings } from "../lib/model-settings";
import type { PathwayState } from "../lib/skill-pathways";

type SkillRow = {
  skill: string; count: number; share: number; recentShare: number; previousShare: number; emerging: boolean;
  coverage: { rating: "strong" | "weak" | "none"; evidence?: { company: string; bulletText: string } };
  pathway: PathwayState | null;
};
type TrackView = { id: string; label: string; jobs: number; recentJobs: number; fromSeed: boolean; skills: SkillRow[] };
type View = { active: string[]; unclassified: number; tracks: TrackView[] };

const RATING_COLOR = { strong: "var(--success)", weak: "var(--champagne, #e8b339)", none: "var(--error)" } as const;
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.75rem" };

function providerSettings() {
  const s = getModelSettings();
  return s.provider !== "together" ? { provider: s.provider, model: s.model, apiKey: s.apiKey } : undefined;
}

export function SkillTracks() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/skills/demand").then(r => (r.ok ? r.json() : null)).then(v => v && setView(v)).catch(() => setMsg("Could not load skill demand."));
  useEffect(() => { load(); }, []);

  const refineWithModel = async () => {
    setBusy("refine"); setMsg("");
    const res = await fetch("/api/skills/demand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelLimit: 10, providerSettings: providerSettings() }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setView(data); setMsg(`Re-extracted ${data.withModel} job(s) with the model.`); } else setMsg(data.error ?? "Refresh failed.");
    setBusy("");
  };

  const act = async (trackId: string, skill: string, update: Record<string, unknown>) => {
    setBusy(`${trackId}:${skill}`);
    const res = await fetch("/api/skills/pathway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId, skill, update, providerSettings: providerSettings() }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(data.error ?? "Action failed."); return; }
    setView(v => v && { ...v, tracks: v.tracks.map(t => t.id !== trackId ? t : { ...t, skills: t.skills.map(s => s.skill === skill ? { ...s, pathway: data.pathway } : s) }) });
  };

  if (!view) return <div style={{ ...mono, color: "var(--text-tertiary)" }}>{msg || "Loading career tracks..."}</div>;

  return (
    <div data-testid="skill-tracks" style={{ marginBottom: 40 }}>
      <div className="label" style={{ marginBottom: 8 }}>CAREER TRACKS</div>
      <CareerTrackPicker onChange={() => load()} />
      <div style={{ ...mono, color: "var(--text-tertiary)", margin: "8px 0 16px" }}>
        {view.active.length ? "" : "No track selected: showing all four. "}Demand counts jobs in your pipeline over the last 90 days; EMERGING means the skill's share of jobs in the last 30 days rose against the previous 60.
        {" "}<button className="btn" style={{ fontSize: "0.625rem" }} onClick={refineWithModel} disabled={busy === "refine"}>{busy === "refine" ? "EXTRACTING..." : "REFINE WITH MODEL (10 JOBS)"}</button>
        {msg && <span style={{ marginLeft: 8 }}>{msg}</span>}
      </div>
      {view.tracks.map(t => (
        <div key={t.id} className="surface-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div className="label" style={{ color: "var(--accent)" }}>{t.label.toUpperCase()}</div>
            <div style={{ ...mono, color: "var(--text-tertiary)" }}>{t.fromSeed ? "No JDs for this track yet: showing the seed skills" : `${t.jobs} JDs in 90 days (${t.recentJobs} in the last 30)`}</div>
          </div>
          {t.skills.map(s => (
            <div key={s.skill} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", ...mono }}>
                <span style={{ color: "var(--text-primary)", minWidth: 200 }}>{s.skill}</span>
                {!t.fromSeed && <span style={{ color: "var(--text-tertiary)" }}>{s.count} job{s.count === 1 ? "" : "s"} · {Math.round(s.share * 100)}%</span>}
                {s.emerging && <span style={{ color: "var(--accent)" }}>EMERGING</span>}
                <span style={{ color: RATING_COLOR[s.coverage.rating] }}>{s.coverage.rating.toUpperCase()}</span>
                {s.coverage.evidence && <span style={{ color: "var(--text-tertiary)" }} title={s.coverage.evidence.bulletText}>evidence: {s.coverage.evidence.company}</span>}
              </div>
              {s.coverage.rating !== "strong" && (
                <Pathway trackId={t.id} skill={s.skill} pathway={s.pathway} busy={busy === `${t.id}:${s.skill}`} act={act} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Pathway({ trackId, skill, pathway, busy, act }: { trackId: string; skill: string; pathway: PathwayState | null; busy: boolean; act: (t: string, s: string, u: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ steps: "", proof: "", estimate: "" });
  const [offer, setOffer] = useState<{ text: string; target: string } | null>(null);
  const [offerMsg, setOfferMsg] = useState("");

  if (!pathway) {
    return (
      <div style={{ ...mono, marginTop: 6 }}>
        <button className="btn" style={{ fontSize: "0.625rem" }} disabled={busy} onClick={() => act(trackId, skill, { kind: "generate" })}>{busy ? "DRAFTING..." : "DRAFT A PATHWAY"}</button>
      </div>
    );
  }

  const startEdit = () => { setDraft({ steps: pathway.steps.join("\n"), proof: pathway.proof, estimate: pathway.estimate }); setEditing(true); };
  const profile = getProfile();

  const addBullet = async () => {
    if (!offer?.text.trim() || !profile) return;
    setOfferMsg("Checking confidentiality...");
    const check = await fetch("/api/skills/proof-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: offer.text }) }).then(r => r.json()).catch(() => ({ ok: false, blockedTerms: ["check failed"] }));
    if (!check.ok) { setOfferMsg(`Blocked by the confidentiality gate: ${check.blockedTerms.join(", ")}. Rewrite it without client-confidential material.`); return; }
    const [type, id] = offer.target.split("::") as ["experience" | "project", string];
    const r = appendGapAnswerToProfile(profile, type, id, offer.text.trim());
    if (!r.applied) { setOfferMsg(r.summary); return; }
    if (await saveProfile(r.profile)) {
      await act(trackId, skill, { kind: "bulletAdded" });
      setOfferMsg(r.summary);
      setOffer(null);
    }
  };

  return (
    <div data-testid="pathway" style={{ ...mono, marginTop: 8, paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
      <div style={{ marginBottom: 4, color: "var(--text-secondary)" }}>
        PATHWAY{pathway.status === "draft" ? <span style={{ color: "var(--accent)" }}> · DRAFT</span> : pathway.origin === "seed" ? " · seeded" : " · accepted"} · {pathway.estimate}
      </div>
      {editing ? (
        <div style={{ display: "grid", gap: 6 }}>
          <textarea rows={4} value={draft.steps} onChange={e => setDraft({ ...draft, steps: e.target.value })} style={mono} />
          <input value={draft.proof} onChange={e => setDraft({ ...draft, proof: e.target.value })} placeholder="Proof artifact" style={mono} />
          <input value={draft.estimate} onChange={e => setDraft({ ...draft, estimate: e.target.value })} placeholder="Time estimate" style={mono} />
          <div><button className="btn" onClick={async () => { await act(trackId, skill, { kind: "edit", steps: draft.steps.split("\n"), proof: draft.proof, estimate: draft.estimate }); setEditing(false); }}>SAVE</button></div>
        </div>
      ) : (
        <>
          {pathway.steps.map((step, i) => (
            <label key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 2 }}>
              <input type="checkbox" checked={pathway.stepsDone.includes(i)} disabled={pathway.status === "draft" || busy} onChange={e => act(trackId, skill, { kind: "step", index: i, done: e.target.checked })} />
              <span style={{ textDecoration: pathway.stepsDone.includes(i) ? "line-through" : "none" }}>{step}</span>
            </label>
          ))}
          <label style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input type="checkbox" checked={pathway.proofDone} disabled={pathway.status === "draft" || busy} onChange={e => act(trackId, skill, { kind: "proof", done: e.target.checked })} />
            <span>Proof: {pathway.proof}</span>
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {pathway.status === "draft" && <button className="btn" style={{ fontSize: "0.625rem" }} onClick={() => act(trackId, skill, { kind: "accept" })}>ACCEPT</button>}
            <button className="btn" style={{ fontSize: "0.625rem" }} onClick={startEdit}>EDIT</button>
            {pathway.status === "accepted" && pathway.proofDone && !pathway.bulletAdded && profile && !offer && (
              <button className="btn" style={{ fontSize: "0.625rem", borderColor: "var(--accent)", color: "var(--accent)" }}
                onClick={() => setOffer({ text: "", target: profile.projects?.[0] ? `project::${profile.projects[0].name}` : `experience::${profile.experience[0]?.company ?? ""}` })}>
                OFFER AS A PROFILE BULLET
              </button>
            )}
            {pathway.bulletAdded && <span style={{ color: "var(--success)" }}>Bullet added to your profile.</span>}
          </div>
          {offer && profile && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <div style={{ color: "var(--text-tertiary)" }}>Write the bullet in your own words (action, what you built or did, outcome). Nothing is added until you click ADD, and never client-confidential material.</div>
              <textarea rows={3} value={offer.text} onChange={e => setOffer({ ...offer, text: e.target.value })} style={mono} />
              <select value={offer.target} onChange={e => setOffer({ ...offer, target: e.target.value })} style={mono}>
                {profile.projects?.map(p => <option key={`p-${p.id}`} value={`project::${p.name}`}>Project: {p.name}</option>)}
                {profile.experience.map(e => <option key={`e-${e.id}`} value={`experience::${e.company}`}>Role: {e.role} at {e.company}</option>)}
              </select>
              <div><button className="btn btn-primary" onClick={addBullet}>ADD TO MY PROFILE</button> <button className="btn" onClick={() => setOffer(null)}>CANCEL</button></div>
            </div>
          )}
          {offerMsg && <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>{offerMsg}</div>}
        </>
      )}
    </div>
  );
}
