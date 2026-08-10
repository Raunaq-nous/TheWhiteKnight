"use client";

import { useState } from "react";
import { hasPortfolioToken, pushProjectToPortfolio, PortfolioPushResult } from "../lib/portfolio-sync-client";

export type PushableProject = { name: string; description: string; outcomes?: string | null; stack?: string | null; repoUrl?: string | null };

/**
 * Review-gated PUSH offer: shown after a NEW project or a NEW quantified
 * project outcome lands in the profile. Drafting + opening the PR only
 * happens on explicit click — never automatic — and the PR always targets
 * a fresh branch, never main (see app/api/portfolio/push/route.ts).
 */
export function PortfolioPushOffer({ project }: { project: PushableProject }) {
  const [state, setState] = useState<"idle" | "pushing" | "done" | "error" | "declined">("idle");
  const [result, setResult] = useState<PortfolioPushResult | null>(null);
  const [error, setError] = useState("");

  if (!hasPortfolioToken() || state === "declined") return null;

  if (state === "done" && result) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--success)", marginTop: 4 }}>
        PR opened: <a href={result.pr.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>#{result.pr.number}</a> — review and merge whenever you're ready.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>Push this to your portfolio as a PR?</span>
      <button
        className="btn"
        style={{ fontSize: "0.5625rem", padding: "2px 8px" }}
        disabled={state === "pushing"}
        onClick={async () => {
          setState("pushing");
          setError("");
          try {
            const r = await pushProjectToPortfolio(project);
            setResult(r);
            setState("done");
          } catch (e: any) {
            setError(e.message || "Push failed.");
            setState("error");
          }
        }}
      >
        {state === "pushing" ? "OPENING PR..." : "PUSH"}
      </button>
      <button className="btn" style={{ fontSize: "0.5625rem", padding: "2px 8px" }} onClick={() => setState("declined")}>NOT NOW</button>
      {state === "error" && <span style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.625rem" }}>{error}</span>}
    </div>
  );
}
