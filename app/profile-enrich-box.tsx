"use client";

import { useState } from "react";
import { getProfile } from "../lib/profile";
import { extractProfileData } from "../lib/profile-enrichment";
import { diffExtractionAgainstProfile, MergeDiffItem } from "../lib/profile-merge";
import { ProfileMergeReview } from "./profile-merge-review";

/** Feature 1: paste freeform text (old CV, website content, a brain-dump) -> extract -> review -> merge. */
export function ProfileEnrichBox() {
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<MergeDiffItem[] | null>(null);

  const handleExtract = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found."); return; }
    if (text.trim().length < 30) { setError("Paste a bit more text — at least a few sentences."); return; }
    setExtracting(true);
    setError("");
    setItems(null);
    try {
      const extracted = await extractProfileData(text.trim(), profile);
      const diff = diffExtractionAgainstProfile(extracted, profile);
      setItems(diff);
      if (diff.length === 0) setError("Nothing new found — everything in this text already looks like it's on your profile.");
    } catch (e: any) {
      setError(e.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
      <div className="label" style={{ marginBottom: 8 }}>ENRICH FROM TEXT</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 12, lineHeight: 1.5 }}>
        Paste an old CV, your website copy, or a brain-dump. We'll extract experience, projects, skills, publications, and certifications, and show you a diff to accept or reject item by item — nothing is added automatically.
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste freeform text here..."
        rows={6}
        disabled={extracting}
        style={{ width: "100%", padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", resize: "vertical", borderRadius: 4 }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={handleExtract} disabled={extracting || !text.trim()}>
          {extracting ? "EXTRACTING..." : "EXTRACT"}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 8, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{error}</div>
      )}
      {items && items.length > 0 && (
        <ProfileMergeReview items={items} offerPortfolioPush onDone={() => { setItems(null); setText(""); }} />
      )}
    </div>
  );
}
