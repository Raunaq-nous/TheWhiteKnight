"use client";

import { useState } from "react";
import { getProfile, saveProfile } from "../lib/profile";
import { MergeDiffItem, applyMergeDiffItem, CandidateProject } from "../lib/profile-merge";
import { showToast } from "../lib/toast";
import { PortfolioPushOffer } from "./portfolio-push-offer";

const ENTITY_LABELS: Record<MergeDiffItem["entityType"], string> = {
  experience: "EXPERIENCE",
  education: "EDUCATION",
  project: "PROJECT",
  publication: "PUBLICATION",
  certification: "CERTIFICATION",
  skill: "SKILL",
};

/**
 * Shared preview/diff review UI for profile enrichment (Features 1 & 3).
 * Every item is add-only or additive-merge-only (never overwrites/deletes
 * existing data) and requires an explicit ADD click — nothing is ever
 * auto-applied.
 */
export function ProfileMergeReview({
  items,
  onDone,
  offerPortfolioPush,
}: {
  items: MergeDiffItem[];
  onDone?: () => void;
  // Offers pushing a brand-new project to the portfolio as a PR right
  // after it's added. Defaults to false — deliberately NOT enabled for the
  // portfolio-sync pull review itself (app/portfolio-sync-box.tsx), which
  // would otherwise offer to push a project right back to where it just
  // came from. Only ProfileEnrichBox (enrich-from-text) turns this on.
  offerPortfolioPush?: boolean;
}) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [pushable, setPushable] = useState<Record<string, CandidateProject>>({});
  // Once any push offer has been shown, this review stays mounted (never
  // auto-closes via onDone) so the user has a chance to act on it — the
  // offer itself has no "I'm fully done" signal back to this component,
  // only its own internal idle/pushing/done/declined state.
  const [keepOpenForPush, setKeepOpenForPush] = useState(false);

  const pending = items.filter(i => !resolved.has(i.id));

  const accept = async (item: MergeDiffItem) => {
    const profile = getProfile();
    if (!profile) { showToast("No profile found.", "error"); return; }
    setBusy(item.id);
    try {
      const next = applyMergeDiffItem(profile, item);
      const ok = await saveProfile(next);
      if (!ok) return; // saveProfile already surfaced a toast
      showToast(`Added: ${item.summary}`, "ok");
      const showsPushOffer = !!offerPortfolioPush && item.entityType === "project" && item.action === "add";
      if (showsPushOffer) {
        setPushable(prev => ({ ...prev, [item.id]: item.payload as CandidateProject }));
        setKeepOpenForPush(true);
      }
      const nextResolved = new Set(resolved).add(item.id);
      setResolved(nextResolved);
      if (items.every(i => nextResolved.has(i.id)) && !showsPushOffer) onDone?.();
    } finally {
      setBusy(null);
    }
  };

  const skip = (item: MergeDiffItem) => {
    const nextResolved = new Set(resolved).add(item.id);
    setResolved(nextResolved);
    if (items.every(i => nextResolved.has(i.id)) && !keepOpenForPush) onDone?.();
  };

  const pushableEntries = Object.entries(pushable);
  if (pending.length === 0 && pushableEntries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      {pushableEntries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {pushableEntries.map(([id, project]) => (
            <PortfolioPushOffer key={id} project={project} />
          ))}
        </div>
      )}
      {pending.map(item => (
        <div key={item.id} style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
            <div>
              <span className="label" style={{ fontSize: "0.5625rem", color: "var(--accent)", marginRight: 8 }}>
                {ENTITY_LABELS[item.entityType]} · {item.action.toUpperCase()}
              </span>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)", marginTop: 4 }}>
                {item.summary}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: "0.625rem", padding: "4px 10px" }}
                disabled={busy === item.id}
                onClick={() => accept(item)}
              >
                {busy === item.id ? "ADDING..." : "ADD"}
              </button>
              <button
                className="btn"
                style={{ fontSize: "0.625rem", padding: "4px 10px" }}
                disabled={busy === item.id}
                onClick={() => skip(item)}
              >
                SKIP
              </button>
            </div>
          </div>
          <pre style={{
            whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
            color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5,
          }}>
            {item.preview}
          </pre>
        </div>
      ))}
    </div>
  );
}
