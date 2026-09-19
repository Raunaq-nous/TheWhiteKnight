"use client";

import { useState, useEffect } from "react";
import { Header, Footer } from "../components";
import { getApplications, Application } from "../../lib/store";
import { computeResponseAnalytics, StatusCounts } from "../../lib/analytics";

const STATUS_LABELS: Record<keyof StatusCounts, string> = {
  sourced: "Sourced",
  reviewed: "Reviewed",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, flex: "1 1 200px" }}>
      <div className="label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.75rem", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function correlationLabel(r: number | null): string {
  if (r === null) return "Not enough data yet";
  const abs = Math.abs(r);
  const strength = abs >= 0.7 ? "Strong" : abs >= 0.4 ? "Moderate" : abs >= 0.2 ? "Weak" : "Negligible";
  const direction = r >= 0 ? "positive" : "negative";
  return `${strength} ${direction} (r = ${r.toFixed(2)})`;
}

export default function AnalyticsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setApps(getApplications());
    setMounted(true);
    const handler = () => setApps(getApplications());
    window.addEventListener("careeros-data-change", handler);
    return () => window.removeEventListener("careeros-data-change", handler);
  }, []);

  const analytics = computeResponseAnalytics(apps);
  const maxStatusCount = Math.max(1, ...Object.values(analytics.statusCounts));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">RESPONSE ANALYTICS</span>
          <span className="label">{analytics.total} APPLICATION{analytics.total === 1 ? "" : "S"} TOTAL</span>
        </div>

        {!mounted ? null : analytics.total === 0 ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
            NO APPLICATIONS YET — analytics will appear here once you've sourced and applied to a few roles.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
              <StatCard
                label="REPLY RATE"
                value={analytics.replyRate.rate === null ? "—" : `${Math.round(analytics.replyRate.rate * 100)}%`}
                sub={analytics.replyRate.sentTotal === 0
                  ? "No applications sent yet"
                  : `${analytics.replyRate.responded} of ${analytics.replyRate.sentTotal} sent applications got a response`}
              />
              <StatCard
                label="AVG. TIME TO RESPONSE"
                value={analytics.avgTimeToResponseDays === null ? "—" : `${analytics.avgTimeToResponseDays.toFixed(1)}d`}
                sub={analytics.avgTimeToResponseDays === null ? "No responses recorded yet" : "Days from capture to last status change (proxy — see note below)"}
              />
              <StatCard
                label="SCORE ↔ RESPONSE CORRELATION"
                value={analytics.scoreCorrelation === null ? "—" : analytics.scoreCorrelation.toFixed(2)}
                sub={correlationLabel(analytics.scoreCorrelation)}
              />
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
              <div className="label" style={{ marginBottom: 16 }}>APPLICATIONS BY STATUS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(Object.keys(STATUS_LABELS) as (keyof StatusCounts)[]).map(status => {
                  const count = analytics.statusCounts[status];
                  const pct = Math.round((count / maxStatusCount) * 100);
                  return (
                    <div key={status} style={{ display: "grid", gridTemplateColumns: "110px 1fr 40px", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>{STATUS_LABELS[status]}</span>
                      <div style={{ background: "var(--bg-primary)", borderRadius: 4, overflow: "hidden", height: 18 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", minWidth: count > 0 ? 4 : 0 }} />
                      </div>
                      <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", textAlign: "right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", lineHeight: 1.5, maxWidth: 640 }}>
              "Responded" means status is Interview, Offer, or Rejected (a rejection is still a
              response — silence is the only non-response). There is no separate inbound-reply
              channel in this app, so these are proxies over the pipeline data you already have,
              not a literal reply webhook. Time-to-response uses when the application record was
              last updated, which can include non-status edits.
            </p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
