"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { getProfile } from "../../lib/profile";
import { DEFAULT_BUCKETS } from "../../lib/buckets";
import { runBatch, loadBatchState, clearBatchState, BatchState, BatchInput } from "../../lib/batch-runner";
import { getCompanyTargets, getEnabledTargets, Region } from "../../lib/company-targets";
import { getIntegrationSettings } from "../../lib/integration-settings";

type Tab = "scan" | "paste";

export default function BatchPage() {
  const [tab, setTab] = useState<Tab>("scan");
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  // SCAN tab state
  const [query, setQuery] = useState("AI Product Manager");
  const [regions, setRegions] = useState<Region[]>(["middle-east", "india", "apac", "global"]);
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<{ title: string; company?: string; location?: string; url: string; snippet?: string; relevance?: number; source?: string; selected: boolean }[]>([]);

  // PASTE tab state
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    setBatchState(loadBatchState());
    const refresh = () => setBatchState(loadBatchState());
    window.addEventListener("careeros-batch-change", refresh);
    return () => window.removeEventListener("careeros-batch-change", refresh);
  }, []);

  const runScan = async () => {
    setError(""); setScanning(true);
    try {
      const integ = getIntegrationSettings();
      const targets = getCompanyTargets();
      const profile = getProfile();

      // Build role keywords from profile to refine relevance scoring
      const roleKeywords: string[] = [];
      if (profile?.roleType) roleKeywords.push(profile.roleType.replace(/-/g, " "));
      if (profile?.headline) roleKeywords.push(profile.headline);
      // Take role title from most recent experience entry
      const latestRole = profile?.experience?.[0]?.role;
      if (latestRole) roleKeywords.push(latestRole);

      // Build excludes from years-of-experience and latest tenure heuristic
      const excludeKeywords: string[] = [];
      const yoe = parseInt((profile?.yearsOfExperience || "0").replace(/[^0-9]/g, ""), 10) || 0;
      const headlineLower = (profile?.headline || "").toLowerCase();
      if (yoe >= 7 || /senior|director|vp|head|lead|principal|chief/.test(headlineLower)) {
        excludeKeywords.push("intern", "junior", "entry-level", "fresher", "trainee");
      }
      if (yoe < 2 || /student|intern|graduate/.test(headlineLower)) {
        excludeKeywords.push("director", "vp", "head of", "chief", "principal");
      }

      const res = await fetch("/api/scan/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query, regions,
          companies: targets.filter(t => t.enabled),
          exaApiKey: integ.exaApiKey,
          adzunaAppId: integ.adzunaAppId,
          adzunaAppKey: integ.adzunaAppKey,
          numResults: 30,
          roleKeywords,
          excludeKeywords,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setDiscovered((data.jobs ?? []).map((j: any) => ({ ...j, selected: true })));
      if (!data.jobs || data.jobs.length === 0) {
        const before = data.counts?.beforeFiltering ?? 0;
        if (before > 0) {
          setError(`${before} jobs found but none scored high enough on relevance. Try a more specific query or add role keywords to your profile.`);
        } else {
          setError("No jobs found. Add an Adzuna or Exa.ai key in Settings → Integrations.");
        }
      }
    } catch (e: any) { setError(e.message); }
    finally { setScanning(false); }
  };

  const startBatchFromScan = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found. Set up your profile first."); return; }
    const inputs: BatchInput[] = discovered.filter(d => d.selected).map(d => ({
      company: d.company ?? new URL(d.url).hostname.replace(/^www\.|jobs\.|careers\./g, "").split(".")[0],
      role: d.title,
      location: d.location ?? "",
      jdText: `${d.title}\n\n${d.snippet ?? ""}\n\nSource: ${d.url}`,
      jdUrl: d.url,
    }));
    if (inputs.length === 0) { setError("Select at least one job."); return; }
    setError(""); setRunning(true);
    try { await runBatch(inputs, profile, DEFAULT_BUCKETS, 2); }
    catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  };

  const startBatchFromPaste = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found. Set up your profile first."); return; }
    const lines = pasteText.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
    const inputs: BatchInput[] = lines.map(block => {
      // Format: "Company | Role | Location\n[JD body]"
      const [headerLine, ...bodyLines] = block.split("\n");
      const parts = headerLine.split("|").map(s => s.trim());
      return {
        company: parts[0] ?? "Unknown",
        role: parts[1] ?? "Unknown",
        location: parts[2] ?? "",
        jdText: bodyLines.join("\n").trim() || headerLine,
      };
    });
    if (inputs.length === 0) { setError("Paste at least one block."); return; }
    setError(""); setRunning(true);
    try { await runBatch(inputs, profile, DEFAULT_BUCKETS, 2); }
    catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  };

  const counts = useMemo(() => {
    if (!batchState) return null;
    const c = { queued: 0, scoring: 0, done: 0, error: 0 };
    for (const it of batchState.items) c[it.status as keyof typeof c]++;
    return c;
  }, [batchState]);

  const toggleRegion = (r: Region) => setRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleSelected = (idx: number) => setDiscovered(prev => prev.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">BATCH EVALUATION</span>
          <Link href="/" className="btn" style={{ textDecoration: "none" }}>BACK</Link>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <button className="btn" onClick={() => setTab("scan")} style={{ borderColor: tab === "scan" ? "var(--accent)" : "var(--border)", color: tab === "scan" ? "var(--accent)" : "var(--text-secondary)" }}>SCAN PORTALS</button>
          <button className="btn" onClick={() => setTab("paste")} style={{ borderColor: tab === "paste" ? "var(--accent)" : "var(--border)", color: tab === "paste" ? "var(--accent)" : "var(--text-secondary)" }}>PASTE LIST</button>
        </div>

        {tab === "scan" && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>SCAN PORTALS FOR JOBS</div>
            <input
              type="text"
              placeholder="e.g. AI Product Manager, Strategy Manager Consulting"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["middle-east", "india", "apac", "global", "europe", "north-america"] as Region[]).map(r => (
                <button key={r} className="btn" onClick={() => toggleRegion(r)} style={{ fontSize: "0.625rem", padding: "4px 10px", borderColor: regions.includes(r) ? "var(--accent)" : "var(--border)", color: regions.includes(r) ? "var(--accent)" : "var(--text-secondary)" }}>{r.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={runScan} disabled={scanning}>{scanning ? "SCANNING..." : "SCAN NOW"}</button>
              <Link href="/companies" className="btn" style={{ textDecoration: "none" }}>EDIT COMPANIES</Link>
            </div>
            <p style={{ marginTop: 8, fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
              Scans Adzuna (when configured) for structured listings + Greenhouse/Ashby/Lever ATS feeds for your enabled target companies + Exa.ai across portal domains. Results are filtered by relevance against your query and profile role keywords; jobs scoring below 20/100 are dropped.
            </p>
          </div>
        )}

        {tab === "scan" && discovered.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="label">DISCOVERED ({discovered.filter(d => d.selected).length}/{discovered.length} selected)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setDiscovered(prev => prev.map(d => ({ ...d, selected: true })))} style={{ fontSize: "0.625rem" }}>ALL</button>
                <button className="btn" onClick={() => setDiscovered(prev => prev.map(d => ({ ...d, selected: false })))} style={{ fontSize: "0.625rem" }}>NONE</button>
                <button className="btn btn-primary" onClick={startBatchFromScan} disabled={running}>{running ? "EVALUATING..." : "EVALUATE SELECTED"}</button>
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {discovered.map((d, i) => (
                <label key={i} style={{ display: "flex", gap: 10, padding: 8, border: "1px solid var(--border-light)", borderRadius: "var(--radius)", cursor: "pointer", background: d.selected ? "var(--surface-hover)" : "transparent" }}>
                  <input type="checkbox" checked={d.selected} onChange={() => toggleSelected(i)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", flex: 1, minWidth: 0 }}>{d.title}</div>
                      {typeof d.relevance === "number" && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: d.relevance >= 60 ? "var(--success)" : d.relevance >= 40 ? "var(--text-primary)" : "var(--text-tertiary)", flexShrink: 0 }}>
                          {d.relevance}/100
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {d.company ?? (() => { try { return new URL(d.url).hostname; } catch { return d.url; } })()}{d.location ? ` · ${d.location}` : ""}
                      {d.source && <span style={{ marginLeft: 8, opacity: 0.7 }}>via {d.source}</span>}
                    </div>
                    {d.snippet && <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.3 }}>{d.snippet.slice(0, 200)}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === "paste" && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 8 }}>PASTE JOB DESCRIPTIONS</div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
              One job per block. First line: <span className="mono">Company | Role | Location</span>. Following lines: full JD body. Separate jobs with a blank line.
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={14}
              placeholder={`Anthropic | AI Product Manager | Remote\nWe are looking for a senior AI PM...\n\nMcKinsey | Engagement Manager | Dubai\nLead consulting engagements...`}
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "0.75rem", resize: "vertical" }}
            />
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={startBatchFromPaste} disabled={running || !pasteText.trim()}>{running ? "EVALUATING..." : "EVALUATE BATCH"}</button>
          </div>
        )}

        {error && <div style={{ marginBottom: 16, color: "var(--error)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>{error}</div>}

        {batchState && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div className="label" style={{ color: "var(--accent)" }}>
                BATCH {batchState.id} {batchState.finishedAt ? "· DONE" : "· RUNNING"}
              </div>
              {counts && (
                <div style={{ fontSize: "0.625rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {counts.done}✓ · {counts.scoring}● · {counts.queued}◯ · {counts.error}✗
                </div>
              )}
              {batchState.finishedAt && (
                <button className="btn" onClick={() => { clearBatchState(); setBatchState(null); }} style={{ fontSize: "0.625rem" }}>CLEAR</button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {batchState.items.map(it => (
                <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 10px", border: "1px solid var(--border-light)", borderRadius: "var(--radius)", fontSize: "0.75rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.company} {"·"} {it.role}
                    </div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: "0.65rem", fontFamily: "var(--font-mono)" }}>{it.location}</div>
                    {it.error && <div style={{ color: "var(--error)", fontSize: "0.65rem", marginTop: 2 }}>{it.error}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {it.status === "done" && it.score !== undefined && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: it.score >= 4 ? "var(--success)" : it.score >= 3.5 ? "var(--accent)" : "var(--text-secondary)" }}>{it.score.toFixed(1)}</span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: it.status === "done" ? "var(--success)" : it.status === "error" ? "var(--error)" : it.status === "scoring" ? "var(--accent)" : "var(--text-tertiary)", border: "1px solid currentColor", padding: "2px 6px", borderRadius: 3 }}>
                      {it.status.toUpperCase()}
                    </span>
                    {it.applicationSlug && (
                      <Link href={`/application/?slug=${it.applicationSlug}`} style={{ fontSize: "0.5rem", color: "var(--accent)", textDecoration: "none", fontFamily: "var(--font-mono)" }}>VIEW →</Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-primary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.875rem",
  borderRadius: "var(--radius)",
};
