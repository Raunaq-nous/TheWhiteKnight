"use client";

import { useState } from "react";
import Link from "next/link";
import { getProfile } from "../lib/profile";
import { pullFromPortfolio, hasPortfolioToken } from "../lib/portfolio-sync-client";
import { MergeDiffItem } from "../lib/profile-merge";
import { ProfileMergeReview } from "./profile-merge-review";
import { PORTFOLIO_REPO } from "../lib/portfolio-config";

/** Pull half of portfolio sync: fetch builds/battles/education from the portfolio repo, map, diff, review. */
export function PortfolioSyncBox() {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<MergeDiffItem[] | null>(null);

  const handleSync = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found."); return; }
    setSyncing(true);
    setError("");
    setItems(null);
    try {
      const diff = await pullFromPortfolio(profile);
      setItems(diff);
      if (diff.length === 0) setError("Nothing new — your profile already reflects the portfolio.");
    } catch (e: any) {
      setError(e.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const tokenConfigured = hasPortfolioToken();

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
      <div className="label" style={{ marginBottom: 8 }}>SYNC FROM PORTFOLIO</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 12, lineHeight: 1.5 }}>
        Pulls builds, work history, and education from {PORTFOLIO_REPO.owner}/{PORTFOLIO_REPO.repo} ({PORTFOLIO_REPO.branch}) and shows a diff to accept or reject item by item — nothing is added automatically, and an already-quantified CareerOS bullet is never overwritten by portfolio prose.
      </div>
      {!tokenConfigured ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          No GitHub token configured. <Link href="/settings/" style={{ color: "var(--accent)" }}>Add one in Settings</Link> (Contents: read is enough to pull).
        </div>
      ) : (
        <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={handleSync} disabled={syncing}>
          {syncing ? "SYNCING..." : "SYNC FROM PORTFOLIO"}
        </button>
      )}
      {error && <div style={{ marginTop: 8, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{error}</div>}
      {items && items.length > 0 && (
        <ProfileMergeReview items={items} onDone={() => setItems(null)} />
      )}
    </div>
  );
}
