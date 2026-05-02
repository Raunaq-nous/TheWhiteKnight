"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header, Footer, ScoreBar, StatusPill } from "../components";
import { getApplications, Application } from "../../lib/store";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);

  useEffect(() => {
    setApps(getApplications());
    const handler = () => setApps(getApplications());
    window.addEventListener("careeros-data-change", handler);
    return () => window.removeEventListener("careeros-data-change", handler);
  }, []);

  const sorted = [...apps].sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">ALL APPLICATIONS</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="label">{apps.length} TOTAL</span>
            <Link href="/ingest/" className="btn btn-primary" style={{ textDecoration: "none" }}>+ INGEST JD</Link>
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px", gap: 0, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span className="label">COMPANY</span>
            <span className="label">ROLE</span>
            <span className="label">LOCATION</span>
            <span className="label">BUCKET</span>
            <span className="label">SCORE</span>
            <span className="label">STATUS</span>
          </div>

          {sorted.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
              NO APPLICATIONS YET — <Link href="/ingest/" style={{ color: "var(--accent)", textDecoration: "none" }}>INGEST A JD TO GET STARTED</Link>
            </div>
          ) : sorted.map((app, i) => (
            <Link
              key={app.id}
              href={`/application/?slug=${app.slug}`}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px",
                gap: 0,
                padding: "12px 16px",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--border-light)" : "none",
                textDecoration: "none",
                color: "inherit",
                transition: "background 150ms ease-out",
                alignItems: "center",
              }}
              className="card"
            >
              <span className="mono" style={{ fontWeight: 500, textTransform: "uppercase", fontSize: "0.8125rem" }}>{app.company}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{app.role}</span>
              <span className="label" style={{ alignSelf: "center" }}>{app.location}</span>
              <span className="label" style={{ alignSelf: "center" }}>{app.bucket}</span>
              <ScoreBar score={app.score} />
              <StatusPill status={app.status} days={app.days ?? 0} />
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
