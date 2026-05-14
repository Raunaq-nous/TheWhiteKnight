"use client";

import { useState } from "react";
import { getProfile, saveProfile } from "../lib/profile";

export type ProfileSuggestion = {
  type: "skill" | "certification" | "achievement" | "voice_note";
  description: string;
  value: string;
};

type Props = {
  suggestions: ProfileSuggestion[];
  onDismiss: () => void;
};

function typeLabel(type: ProfileSuggestion["type"]): string {
  switch (type) {
    case "skill": return "SKILL";
    case "certification": return "CERT";
    case "achievement": return "ACHIEVEMENT";
    case "voice_note": return "PREFERENCE";
  }
}

function applyToProfile(s: ProfileSuggestion) {
  const profile = getProfile();
  if (!profile) return;

  if (s.type === "skill") {
    // Append to existing "Other" skills category, or add one
    const updated = { ...profile.skills };
    const otherKey = Object.keys(updated).find(k => k.toLowerCase().includes("other")) ?? "Other";
    if (updated[otherKey]) {
      updated[otherKey] = updated[otherKey].includes(s.value)
        ? updated[otherKey]
        : `${updated[otherKey]}, ${s.value}`;
    } else {
      updated[otherKey] = s.value;
    }
    saveProfile({ ...profile, skills: updated });

  } else if (s.type === "certification") {
    const newCert = {
      id: Math.random().toString(36).slice(2, 9),
      name: s.value,
      issuer: "",
      date: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      relevance: "",
    };
    saveProfile({ ...profile, certifications: [...(profile.certifications ?? []), newCert] });

  } else {
    // achievement or voice_note — append to voiceNotes
    const prefix = s.type === "achievement" ? "ACHIEVEMENT" : "NOTE";
    const addition = `\n\n${prefix}: ${s.value}`;
    saveProfile({ ...profile, voiceNotes: (profile.voiceNotes ?? "") + addition });
  }
}

export function ProfileEnrichmentBanner({ suggestions, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const active = suggestions.filter((_, i) => !dismissed.has(i) && !accepted.has(i));

  if (active.length === 0) return null;

  const handleAccept = (i: number) => {
    applyToProfile(suggestions[i]);
    setAccepted(prev => new Set([...prev, i]));
    if (active.length === 1) onDismiss();
  };

  const handleSkip = (i: number) => {
    setDismissed(prev => new Set([...prev, i]));
    if (active.length === 1) onDismiss();
  };

  return (
    <div style={{
      background: "rgba(50,200,100,0.07)",
      border: "1px solid var(--success)",
      borderRadius: "var(--radius)",
      padding: "14px 18px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="label" style={{ color: "var(--success)", fontSize: "0.625rem" }}>
          NEW PROFILE INFO DETECTED ({active.length})
        </div>
        <button
          className="btn"
          style={{ fontSize: "0.5rem", padding: "2px 8px", borderColor: "var(--success)", color: "var(--success)" }}
          onClick={onDismiss}
        >
          DISMISS ALL
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.map((s, i) => {
          if (dismissed.has(i) || accepted.has(i)) return null;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.5rem", padding: "2px 6px",
                  background: "rgba(50,200,100,0.15)", border: "1px solid var(--success)",
                  borderRadius: 2, color: "var(--success)", marginRight: 8, whiteSpace: "nowrap",
                }}>
                  {typeLabel(s.type)}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {s.description}
                </span>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-primary)", marginTop: 3 }}>
                  "{s.value}"
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: "0.5rem", padding: "3px 10px" }}
                  onClick={() => handleAccept(i)}
                >
                  ADD TO PROFILE
                </button>
                <button
                  className="btn"
                  style={{ fontSize: "0.5rem", padding: "3px 10px" }}
                  onClick={() => handleSkip(i)}
                >
                  SKIP
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
