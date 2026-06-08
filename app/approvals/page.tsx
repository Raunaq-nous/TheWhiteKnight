"use client";

import { useEffect, useState, useCallback } from "react";
import { Header, Footer } from "../components";

type ApprovalItem = {
  id: string;
  action: { kind: string; applicationId?: string; payload?: Record<string, unknown> };
  status: string;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  resolvedAt: string | null;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function ApprovalCard({
  item,
  onDecide,
}: {
  item: ApprovalItem;
  onDecide: (id: string, decision: "approve" | "reject") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      await onDecide(item.id, decision);
    } finally {
      setBusy(false);
    }
  };

  const isPending = item.status === "pending" && !item.expired;

  return (
    <div
      className="card"
      style={{
        opacity: item.expired ? 0.5 : 1,
        borderLeft: `3px solid ${item.status === "approved" ? "var(--success)" : item.status === "rejected" ? "var(--error, #e55)" : "var(--accent)"}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div className="card-company" style={{ marginBottom: 2 }}>
            {item.action.kind}
          </div>
          {item.action.applicationId && (
            <div className="card-role" style={{ fontSize: "0.75rem" }}>
              App: {item.action.applicationId}
            </div>
          )}
          <div className="card-meta" style={{ marginTop: 4 }}>
            <span className="label">
              {item.expired ? "EXPIRED" : item.status.toUpperCase()}
            </span>
            <span style={{ color: "var(--text-tertiary)", fontSize: "0.625rem" }}>
              {fmt(item.createdAt)}
            </span>
            {item.expiresAt && (
              <span style={{ color: "var(--text-tertiary)", fontSize: "0.625rem" }}>
                expires {fmt(item.expiresAt)}
              </span>
            )}
          </div>
        </div>
        {isPending && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: "0.625rem", padding: "4px 10px" }}
              disabled={busy}
              onClick={() => decide("approve")}
            >
              APPROVE
            </button>
            <button
              className="btn"
              style={{ fontSize: "0.625rem", padding: "4px 10px" }}
              disabled={busy}
              onClick={() => decide("reject")}
            >
              REJECT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approvals?status=pending");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { approvals: ApprovalItem[] };
      setItems(data.approvals);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDecide = async (id: string, decision: "approve" | "reject") => {
    const res = await fetch(`/api/approvals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      alert(data.error ?? `Request failed (${res.status})`);
      return;
    }
    await load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>
        <div className="section-header">
          <span className="section-title">PENDING APPROVALS</span>
          <button className="btn" style={{ fontSize: "0.625rem" }} onClick={load}>
            REFRESH
          </button>
        </div>

        {loading && <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Loading...</p>}
        {error && <p style={{ color: "var(--error, #e55)", fontSize: "0.75rem" }}>{error}</p>}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <p>NO PENDING APPROVALS</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {items.map(item => (
            <ApprovalCard key={item.id} item={item} onDecide={handleDecide} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
