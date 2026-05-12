"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUSES } from "./data";
import { ScoreBar, StatusPill, Header, Footer } from "./components";
import { getApplications, deleteApplication, Application } from "../lib/store";
import { hasProfile } from "../lib/profile";

function AppCard({ app, onDelete }: { app: Application; onDelete: (id: string, label: string) => void }) {
  return (
    <div className="card" style={{ position: "relative", color: "inherit" }}>
      <Link href={`/application/?slug=${app.slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        <div className="card-company">{app.company}</div>
        <div className="card-role">{app.role}</div>
        <div className="card-meta">
          <span className="card-location">{app.location}{app.remote ? " · REMOTE" : ""}</span>
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
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); if (app.id) onDelete(app.id, `${app.company} — ${app.role}`); }}
        aria-label="Delete application"
        title="Delete"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 24,
          height: 24,
          padding: 0,
          background: "transparent",
          border: "1px solid var(--border-light)",
          borderRadius: 4,
          color: "var(--text-tertiary)",
          cursor: "pointer",
          fontSize: "0.875rem",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    if (!hasProfile()) {
      window.location.href = "/onboard";
      return;
    }
    setApps(getApplications());

    const handleUpdate = () => setApps(getApplications());
    window.addEventListener("careeros-data-change", handleUpdate);
    return () => window.removeEventListener("careeros-data-change", handleUpdate);
  }, []);

  const handleDelete = (id: string, label: string) => {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleteApplication(id);
    setApps(getApplications());
  };

  const counts: Record<string, number> = {};
  STATUSES.forEach(s => { counts[s] = apps.filter(a => a.status === s).length; });
  const totalActive = apps.filter(a => a.status !== "rejected").length;
  const avgScore = apps.length > 0 ? (apps.reduce((sum, a) => sum + a.score, 0) / apps.length).toFixed(1) : "0.0";
  const interviewRate = apps.length > 0 ? Math.round((apps.filter(a => ["interview", "offer"].includes(a.status)).length / apps.length) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
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

        <div className="stats-bar">
          {STATUSES.map(s => (
            <div className="stat" key={s}>
              <div className="stat-value" style={{ color: `var(--status-${s})` }}>{counts[s]}</div>
              <div className="stat-label">{s}</div>
            </div>
          ))}
        </div>

        <div className="section-header">
          <span className="section-title">APPLICATION PIPELINE</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn">SCAN PORTALS</button>
            <Link href="/ingest" className="btn btn-primary" style={{ textDecoration: "none" }}>+ INGEST JD</Link>
          </div>
        </div>

        <div className="pipeline">
          {STATUSES.map(status => (
            <div className="column" key={status}>
              <div className="column-header">
                <span className="column-title" style={{ color: `var(--status-${status})` }}>{status}</span>
                <span className="column-count">{counts[status]}</span>
              </div>
              <div className="column-body">
                {apps.filter(a => a.status === status).map((app, i) => (
                  <AppCard app={app} key={i} onDelete={handleDelete} />
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
