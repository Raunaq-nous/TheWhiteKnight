"use client";

import { useState, useEffect } from "react";
import { Header, Footer } from "../components";
import { TargetBucket } from "../../lib/store";
import { getBuckets, saveBuckets, resetBuckets } from "../../lib/buckets";

const profile = {
  name: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  portfolio: "",
  github: "",
};

const portals = [
  { name: "LinkedIn Jobs", url: "linkedin.com/jobs", status: "active", lastScan: "2026-04-27" },
  { name: "Greenhouse", url: "greenhouse.io", status: "active", lastScan: "2026-04-27" },
  { name: "Lever", url: "lever.co", status: "active", lastScan: "2026-04-26" },
  { name: "Ashby", url: "ashbyhq.com", status: "configured", lastScan: "never" },
];

// Comma-separated <-> string[] helpers for the plain-text editing fields below.
function toCsv(arr: string[]): string { return arr.join(", "); }
function fromCsv(s: string): string[] { return s.split(",").map(x => x.trim()).filter(Boolean); }

function emptyBucket(): TargetBucket {
  return {
    id: `bucket-${Date.now().toString(36)}`,
    name: "", description: "",
    titlesMatch: [], titlesExclude: [], sectorsPreferred: [], geographies: [],
    keywordsRequired: [], keywordsBoost: [], targetCompanies: [], seniority: [],
    weight: 0.2,
  };
}

function BucketEditor({ bucket, onChange, onRemove }: { bucket: TargetBucket; onChange: (b: TargetBucket) => void; onRemove: () => void }) {
  const field = (label: string, key: keyof TargetBucket, isCsv = true) => (
    <div>
      <span className="label" style={{ fontSize: "0.625rem" }}>{label}: </span>
      <input
        type="text"
        value={isCsv ? toCsv(bucket[key] as string[]) : (bucket[key] as string)}
        onChange={e => onChange({ ...bucket, [key]: isCsv ? fromCsv(e.target.value) : e.target.value })}
        style={{ width: "100%", marginTop: 4, padding: "6px 8px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: 4 }}
      />
    </div>
  );

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <input
          type="text"
          value={bucket.name}
          onChange={e => onChange({ ...bucket, name: e.target.value })}
          placeholder="Bucket name"
          style={{ flex: 1, fontWeight: 500, textTransform: "uppercase", padding: "6px 8px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: 4 }}
        />
        <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px", color: "var(--error, #e55)" }} onClick={onRemove}>REMOVE</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {field("DESCRIPTION", "description", false)}
        {field("TITLES MATCH", "titlesMatch")}
        {field("TITLES EXCLUDE", "titlesExclude")}
        {field("SENIORITY", "seniority")}
        {field("GEOGRAPHIES", "geographies")}
        {field("SECTORS PREFERRED", "sectorsPreferred")}
        {field("KEYWORDS REQUIRED", "keywordsRequired")}
        {field("KEYWORDS BOOST", "keywordsBoost")}
        {field("TARGET COMPANIES", "targetCompanies")}
        <div>
          <span className="label" style={{ fontSize: "0.625rem" }}>WEIGHT (0-1): </span>
          <input
            type="number" min={0} max={1} step={0.05}
            value={bucket.weight}
            onChange={e => onChange({ ...bucket, weight: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
            style={{ width: 80, marginTop: 4, padding: "6px 8px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: 4 }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const [buckets, setBuckets] = useState<TargetBucket[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setBuckets(getBuckets()); }, []);

  const updateBucket = (id: string, next: TargetBucket) => {
    setBuckets(prev => prev.map(b => b.id === id ? next : b));
    setDirty(true);
  };
  const removeBucket = (id: string) => {
    setBuckets(prev => prev.filter(b => b.id !== id));
    setDirty(true);
  };
  const addBucket = () => {
    setBuckets(prev => [...prev, emptyBucket()]);
    setDirty(true);
  };
  const handleSave = async () => {
    const ok = await saveBuckets(buckets);
    if (ok) { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };
  const handleReset = async () => {
    const ok = await resetBuckets();
    if (ok) { setBuckets(getBuckets()); setDirty(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">CONFIGURATION</span>
          <span className="label">USER LAYER</span>
        </div>

        <div className="config-grid">
          {/* Profile */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div className="label" style={{ marginBottom: 16 }}>PROFILE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(profile).map(([key, val]) => (
                <div key={key}>
                  <div className="label" style={{ fontSize: "0.625rem", marginBottom: 2 }}>{key.toUpperCase()}</div>
                  <div className="mono" style={{ fontSize: "0.8125rem" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Portals */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div className="label" style={{ marginBottom: 16 }}>JOB PORTALS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {portals.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <div className="mono" style={{ fontSize: "0.8125rem" }}>{p.name}</div>
                    <div className="label" style={{ fontSize: "0.625rem" }}>{p.url}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="label" style={{ fontSize: "0.625rem" }}>SCAN: {p.lastScan}</span>
                    <span className={`pill ${p.status === "active" ? "pill-offer" : "pill-sourced"}`}>
                      {p.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Target role buckets — the ONE persisted source of truth, consumed
            by both ingest (app/ingest/page.tsx) and batch scan
            (app/batch/page.tsx) via lib/buckets.ts's getBuckets(). Editing
            here changes scoring in both places the next time either runs. */}
        <div className="section-header">
          <span className="section-title">TARGET ROLE BUCKETS</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="label">{buckets.length} CONFIGURED</span>
            {saved && <span className="label" style={{ color: "var(--success)" }}>SAVED</span>}
            <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={handleReset}>RESET TO DEFAULTS</button>
            <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={addBucket}>+ ADD BUCKET</button>
            <button className="btn btn-primary" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={handleSave} disabled={!dirty}>
              SAVE CHANGES
            </button>
          </div>
        </div>

        <div className="config-grid">
          {buckets.map(b => (
            <BucketEditor key={b.id} bucket={b} onChange={next => updateBucket(b.id, next)} onRemove={() => removeBucket(b.id)} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
