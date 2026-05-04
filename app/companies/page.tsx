"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { CompanyTarget, Region, Sector, getCompanyTargets, saveCompanyTargets, resetCompanyTargets } from "../../lib/company-targets";

const REGION_LABELS: Record<Region, string> = {
  "global": "Global",
  "middle-east": "Middle East",
  "apac": "APAC",
  "india": "India",
  "north-america": "N. America",
  "europe": "Europe",
};

const SECTOR_LABELS: Record<Sector, string> = {
  "consulting": "Consulting",
  "big-tech-strategy": "Big Tech (Strategy)",
  "ai-emerging": "AI / Emerging",
  "fintech": "Fintech",
  "ecommerce": "E-commerce",
  "investment": "Investment",
  "industry": "Industry",
};

export default function CompaniesPage() {
  const [targets, setTargets] = useState<CompanyTarget[]>([]);
  const [regionFilter, setRegionFilter] = useState<Region | "all">("all");
  const [sectorFilter, setSectorFilter] = useState<Sector | "all">("all");
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<CompanyTarget>>({ enabled: true, region: ["global"], sector: "ai-emerging", ats: "custom" });

  useEffect(() => { setTargets(getCompanyTargets()); }, []);

  const persist = (next: CompanyTarget[]) => {
    setTargets(next);
    saveCompanyTargets(next);
  };

  const toggle = (id: string) => persist(targets.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  const remove = (id: string) => persist(targets.filter(t => t.id !== id));
  const handleReset = () => { if (confirm("Reset to default company list? Custom additions will be removed.")) { resetCompanyTargets(); setTargets(getCompanyTargets()); } };
  const handleAdd = () => {
    if (!draft.name || !draft.careersUrl) return;
    const id = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    persist([{ id, name: draft.name, region: draft.region ?? ["global"], sector: draft.sector ?? "ai-emerging", ats: draft.ats ?? "custom", atsTenant: draft.atsTenant, careersUrl: draft.careersUrl, enabled: true }, ...targets]);
    setDraft({ enabled: true, region: ["global"], sector: "ai-emerging", ats: "custom" });
    setAdding(false);
  };

  const filtered = targets.filter(t => {
    if (regionFilter !== "all" && !t.region.includes(regionFilter)) return false;
    if (sectorFilter !== "all" && t.sector !== sectorFilter) return false;
    if (showOnlyEnabled && !t.enabled) return false;
    return true;
  });

  const enabledCount = targets.filter(t => t.enabled).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">TARGET COMPANIES <span style={{ color: "var(--text-tertiary)", fontWeight: "normal" }}>{enabledCount}/{targets.length} ACTIVE</span></span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? "CANCEL" : "+ ADD"}</button>
            <button className="btn" onClick={handleReset}>RESET</button>
            <Link href="/" className="btn" style={{ textDecoration: "none" }}>BACK</Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value as any)} style={selectStyle}>
            <option value="all">All Regions</option>
            {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value as any)} style={selectStyle}>
            <option value="all">All Sectors</option>
            {Object.entries(SECTOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            <input type="checkbox" checked={showOnlyEnabled} onChange={e => setShowOnlyEnabled(e.target.checked)} /> ENABLED ONLY
          </label>
        </div>

        {adding && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>ADD COMPANY</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input placeholder="Company name *" value={draft.name ?? ""} onChange={e => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
              <input placeholder="Careers URL *" value={draft.careersUrl ?? ""} onChange={e => setDraft({ ...draft, careersUrl: e.target.value })} style={inputStyle} />
              <select value={draft.sector} onChange={e => setDraft({ ...draft, sector: e.target.value as Sector })} style={inputStyle}>
                {Object.entries(SECTOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={draft.ats} onChange={e => setDraft({ ...draft, ats: e.target.value as any })} style={inputStyle}>
                <option value="custom">Custom site</option>
                <option value="greenhouse">Greenhouse</option>
                <option value="ashby">Ashby</option>
                <option value="lever">Lever</option>
                <option value="workday">Workday</option>
                <option value="smartrecruiters">SmartRecruiters</option>
              </select>
              <input placeholder="ATS tenant slug (optional)" value={draft.atsTenant ?? ""} onChange={e => setDraft({ ...draft, atsTenant: e.target.value })} style={inputStyle} />
              <select value={draft.region?.[0] ?? "global"} onChange={e => setDraft({ ...draft, region: [e.target.value as Region] })} style={inputStyle}>
                {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleAdd} disabled={!draft.name || !draft.careersUrl}>SAVE</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {filtered.map(t => (
            <div key={t.id} style={{ background: "var(--surface)", border: `1px solid ${t.enabled ? "var(--border)" : "var(--border-light)"}`, borderRadius: "var(--radius)", padding: 12, opacity: t.enabled ? 1 : 0.55 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 500 }}>{t.name}</span>
                <input type="checkbox" checked={t.enabled} onChange={() => toggle(t.id)} />
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={tagStyle("var(--accent)")}>{SECTOR_LABELS[t.sector]}</span>
                <span style={tagStyle("var(--text-tertiary)")}>{t.ats.toUpperCase()}{t.atsTenant ? `:${t.atsTenant}` : ""}</span>
              </div>
              <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>
                {t.region.map(r => REGION_LABELS[r]).join(" · ")}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <a href={t.careersUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.625rem", color: "var(--accent)", textDecoration: "none", fontFamily: "var(--font-mono)" }}>VISIT →</a>
                <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "0.625rem", fontFamily: "var(--font-mono)" }}>REMOVE</button>
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "8px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderRadius: "var(--radius)" };
const selectStyle: React.CSSProperties = { ...inputStyle, padding: "6px 10px" };
const tagStyle = (color: string): React.CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color, textTransform: "uppercase", letterSpacing: "0.08em", border: `1px solid ${color}`, padding: "1px 5px", borderRadius: 3 });
