"use client";
// Choose the career tracks to pursue: they drive track-aware scanning
// (titles, keywords, target companies, preferred sources) and /skills.
import { useEffect, useState } from "react";
import { CAREER_TRACKS } from "../lib/career-tracks";

export function CareerTrackPicker({ onChange }: { onChange?: (active: string[]) => void }) {
  const [active, setActive] = useState<string[] | null>(null);
  useEffect(() => {
    fetch("/api/tracks").then(r => (r.ok ? r.json() : { active: [] })).then(d => setActive(d.active ?? [])).catch(() => setActive([]));
  }, []);
  const toggle = async (id: string) => {
    const next = active?.includes(id) ? active.filter(x => x !== id) : [...(active ?? []), id];
    setActive(next);
    const res = await fetch("/api/tracks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: next }) });
    if (res.ok) onChange?.((await res.json()).active);
  };
  if (!active) return null;
  return (
    <div data-testid="career-track-picker" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {CAREER_TRACKS.map(t => (
        <button key={t.id} className="btn" onClick={() => toggle(t.id)}
          style={{ fontSize: "0.6875rem", borderColor: active.includes(t.id) ? "var(--accent)" : undefined, color: active.includes(t.id) ? "var(--accent)" : undefined }}>
          {active.includes(t.id) ? "✓ " : ""}{t.label}
        </button>
      ))}
    </div>
  );
}
