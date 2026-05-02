"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { applications as sampleData, STATUSES } from "./data";
import { ScoreBar, StatusPill, Header, Footer } from "./components";
import { getApplications, saveApplication, Application } from "../lib/store";

function AppCard({ app }: { app: Application | typeof sampleData[0] }) {
  return (
    <Link href={`/application/?slug=${app.slug}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div className="card-company">{app.company}</div>
      <div className="card-role">{app.role}</div>
      <div className="card-meta">
        <span className="card-location">{app.location}{app.remote ? " \u00B7 REMOTE" : ""}</span>
        <StatusPill status={app.status as any} days={app.days ?? 0} />
      </div>
      <div style={{ marginTop: 8 }}>
        <ScoreBar score={app.score} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span className="label">{app.bucket}</span>
        <span className="label" style={{ color: "var(--text-tertiary)", fontSize: "0.625rem" }}>
          {("capturedAt" in app) ? app.capturedAt : ""}
        </span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    // Load from local store, fallback to sample data if empty
    let stored = getApplications();
    if (stored.length === 0) {
      stored = sampleData as any[];
      // Optionally pre-populate store with sample data
      // stored.forEach(a => saveApplication(a as any));
    }
    setApps(stored);

    const handleUpdate = () => {
      const updated = getApplications();
      setApps(updated.length > 0 ? updated : sampleData);
    };
    window.addEventListener("careeros-data-change", handleUpdate);
    return () => window.removeEventListener("careeros-data-change", handleUpdate);
  }, []);

  const counts: Record<string, number> = {};
  STATUSES.forEach(s => { counts[s] = apps.filter(a => a.status === s).length; });
  const totalActive = apps.filter(a => a.status !== "rejected").length;
  const avgScore = apps.length > 0 ? (apps.reduce((sum, a) => sum + a.score, 0) / apps.length).toFixed(1) : "0.0";
  const interviewRate = apps.length > 0 ? Math.round((apps.filter(a => ["interview", "offer"].includes(a.status)).length / apps.length) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        {/* Hero metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 24, overflow: "hidden" }}>
          <div className="stat">
            <div className="stat-value" style={{ color: "var(--accent)" }}>{totalActive}</div>
            <div className="stat-label">ACTIVE</div>
          </div>
          <div className="stat">
            <div className="stat-value">{avgScore}</div>
            <div className="stat-label">AVG SCORE</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: "var(--success)" }}>{interviewRate}%</div>
            <div className="stat-label">INTERVIEW RATE</div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="stats-bar">
          {STATUSES.map(s => (
            <div className="stat" key={s}>
              <div className="stat-value" style={{ color: `var(--status-${s})` }}>{counts[s]}</div>
              <div className="stat-label">{s}</div>
            </div>
          ))}
        </div>

        {/* Pipeline header */}
        <div className="section-header">
          <span className="section-title">APPLICATION PIPELINE</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn">SCAN PORTALS</button>
            <Link href="/ingest" className="btn btn-primary" style={{ textDecoration: "none" }}>+ INGEST JD</Link>
          </div>
        </div>

        {/* Kanban columns */}
        <div className="pipeline">
          {STATUSES.map(status => (
            <div className="column" key={status}>
              <div className="column-header">
                <span className="column-title" style={{ color: `var(--status-${status})` }}>{status}</span>
                <span className="column-count">{counts[status]}</span>
              </div>
              <div className="column-body">
                {apps.filter(a => a.status === status).map((app, i) => (
                  <AppCard app={app} key={i} />
                ))}
                {counts[status] === 0 && (
                  <div className="empty-state"><p>NO APPLICATIONS</p></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}