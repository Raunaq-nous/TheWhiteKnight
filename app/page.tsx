"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUSES } from "./data";
import { ScoreBar, StatusPill, Header, Footer } from "./components";
import CodeBrain from "./code-brain";
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
        className="card-delete"
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

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const inFlight = counts.applied + counts.interview;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <section className="dash-hero">
        <div className="container dash-hero-inner">
          <div className="dash-hero-copy">
            <div>
              <div className="eyebrow">Pipeline / 01 · {today}</div>
              <h1 className="display-sm" style={{ marginTop: 22, maxWidth: "12ch" }}>
                Your search, <span className="em">in motion.</span>
              </h1>
              <p className="lede" style={{ marginTop: 18, maxWidth: "40ch", fontSize: "0.9375rem" }}>
                {apps.length === 0
                  ? "Nothing in the pipeline yet. Ingest a job description or scan the portals to start."
                  : `${totalActive} active ${totalActive === 1 ? "role" : "roles"}, ${inFlight} in flight. Every application waits for your approval before anything is sent.`}
              </p>
            </div>
            <div className="kpis">
              <div>
                <div className="kpi-value">{totalActive}</div>
                <div className="kpi-label">Active</div>
              </div>
              <div>
                <div className="kpi-value">{avgScore}</div>
                <div className="kpi-label">Avg score</div>
              </div>
              <div>
                <div className="kpi-value" style={{ color: "var(--status-offer)" }}>{interviewRate}%</div>
                <div className="kpi-label">Interview rate</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <Link href="/batch/" className="btn">Scan portals</Link>
                <Link href="/ingest" className="btn btn-primary">+ Ingest JD</Link>
              </div>
            </div>
          </div>
          <div className="dash-brain" aria-hidden="true">
            <CodeBrain phase={2.35} focusX={0.52} focusY={0.52} scale={0.46} reach={0.45} labels="hover" />
          </div>
        </div>
      </section>

      <main className="container" style={{ paddingTop: 28, paddingBottom: 72, flex: 1 }}>
        <div className="stats-bar" style={{ marginTop: 0 }}>
          {STATUSES.map(s => (
            <div className="stat" key={s}>
              <div className="stat-value" style={{ color: `var(--status-${s})` }}>{counts[s]}</div>
              <div className="stat-label">{s}</div>
            </div>
          ))}
        </div>

        <div className="section-header" style={{ marginTop: 40 }}>
          <span className="section-title">Application pipeline</span>
          <span className="label">{apps.length} total</span>
        </div>

        <div className="pipeline">
          {STATUSES.map(status => (
            <div className="column" key={status}>
              <div className="column-header">
                <span className="column-title" style={{ color: `var(--status-${status})` }}>{status}</span>
                <span className="column-count">{String(counts[status]).padStart(2, "0")}</span>
              </div>
              <div className="column-body">
                {apps.filter(a => a.status === status).map((app, i) => (
                  <AppCard app={app} key={i} onDelete={handleDelete} />
                ))}
                {counts[status] === 0 && (
                  <div className="empty-state"><p>Empty</p></div>
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
