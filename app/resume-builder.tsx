"use client";

import { useEffect, useMemo, useState } from "react";
import { getProfile, saveProfile } from "../lib/profile";
import { generateRequirementMap, answerResumeGapQuestion, appendGapAnswerToProfile } from "../lib/profile-enrichment";
import { generateTailoredResume } from "../lib/generate";
import { injectGapAnswerIntoResume } from "../lib/resume-gap-fill";
import {
  RequirementCoverage,
  LiveCoverage,
  BuilderCheckedState,
  defaultCheckedState,
  applyCheckedState,
  collectIncludedTexts,
  recomputeCoverage,
  findNewlyUncovered,
  buildReactiveProbeQuestion,
} from "../lib/resume-requirement-map";
import { ResumeContent, resolveSectionSequence } from "../lib/resume-schema";
import { ResumeArchetype } from "../lib/resume-archetype";
import { generateResumeAudit, ResumeAuditResult } from "../lib/resume-audit";
import type { Application } from "../lib/store";
import { showToast } from "../lib/toast";

const RATING_COLOR: Record<"strong" | "weak" | "none", string> = {
  strong: "var(--success)",
  weak: "var(--accent)",
  none: "var(--error, #e55)",
};

const VERDICT_COLOR: Record<ResumeAuditResult["verdict"], string> = {
  strong_pass: "var(--success)",
  pass: "var(--success)",
  borderline: "var(--accent)",
  weak: "var(--error, #e55)",
  reject: "var(--error, #e55)",
};

const SEVERITY_COLOR: Record<"minor" | "major", string> = {
  minor: "var(--accent)",
  major: "var(--error, #e55)",
};

/**
 * Interactive resume builder: JD requirement map -> checkbox draft -> live
 * reactive coverage probing -> confirm-to-render. Replaces fire-and-forget
 * generation with a step the user can actually see and steer.
 *
 * 1. Requirement map: what this JD asks for, what evidence exists, rated.
 * 2. Draft with every section/bullet as a pre-checked checkbox.
 * 3. Unchecking anything re-evaluates coverage instantly (pure client-side
 *    logic, see lib/resume-requirement-map.ts) — a requirement that loses
 *    its only evidence gets a specific, named follow-up question, never a
 *    generic one.
 * 4. Weak/missing requirements get the same targeted-question treatment
 *    from the start, not just reactively.
 * 5. Any answer supplied here writes into THIS draft immediately and into
 *    the profile via the existing non-destructive merge (same mechanism as
 *    ResumeGapFillBox).
 * 6. Only once confirmed does it hand back the final content to render.
 */
export function ResumeBuilder({
  app,
  onConfirm,
  onClose,
}: {
  app: Application;
  onConfirm: (content: ResumeContent, archetype: ResumeArchetype, audit: ResumeAuditResult | null, atsReadable: boolean | null) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"map" | "drafting" | "draft" | "error">("map");
  const [error, setError] = useState("");
  const [requirements, setRequirements] = useState<RequirementCoverage[]>([]);
  const [draft, setDraft] = useState<ResumeContent | null>(null);
  const [archetype, setArchetype] = useState<ResumeArchetype>("general");
  const [checked, setChecked] = useState<BuilderCheckedState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Adversarial hiring-side score (feature: adversarial resume evaluation).
  // Runs automatically once a draft exists; RE-SCORE lets the user refresh
  // it after editing checkboxes without spamming a call on every toggle.
  const [auditPhase, setAuditPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [audit, setAudit] = useState<ResumeAuditResult | null>(null);
  const [atsReadable, setAtsReadable] = useState<boolean | null>(null);
  const [auditError, setAuditError] = useState("");

  useEffect(() => {
    const profile = getProfile();
    if (!profile) { setError("No profile found."); setPhase("error"); return; }
    generateRequirementMap(profile, app)
      .then(reqs => setRequirements(reqs))
      .catch(e => { setError(e.message || "Requirement map generation failed."); setPhase("error"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildDraft = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found."); return; }
    setPhase("drafting");
    setError("");
    try {
      const { data, archetype: arch } = await generateTailoredResume(profile, app);
      setDraft(data);
      setArchetype(arch);
      const sequence = resolveSectionSequence(data, arch);
      setChecked(defaultCheckedState(data, sequence));
      setPhase("draft");
      runAudit(data, arch);
    } catch (e: any) {
      setError(e.message || "Draft generation failed.");
      setPhase("map");
    }
  };

  const runAudit = async (content: ResumeContent, arch: ResumeArchetype) => {
    setAuditPhase("loading");
    setAuditError("");
    try {
      const { audit: result, atsReadable: readable } = await generateResumeAudit(content, arch, app);
      setAudit(result);
      setAtsReadable(readable);
      setAuditPhase("done");
    } catch (e: any) {
      setAuditError(e.message || "Resume audit failed.");
      setAuditPhase("error");
    }
  };

  const applied = useMemo(() => (draft && checked ? applyCheckedState(draft, checked) : null), [draft, checked]);
  const liveCoverage: LiveCoverage[] = useMemo(() => {
    if (!applied) return requirements.map(r => ({ ...r, liveRating: r.rating, lostEvidence: false }));
    return recomputeCoverage(requirements, collectIncludedTexts(applied));
  }, [requirements, applied]);

  // Weak/none requirements needing a targeted question — whether they
  // started that way (JD-specific gaps, item 4) or just lost their only
  // evidence to a toggle (reactive probing, item 3). Same treatment either
  // way: a specific, named question, never generic.
  const needsAttention = liveCoverage.filter(r => r.liveRating !== "strong");

  const toggleSection = (key: string) => {
    if (!checked) return;
    setChecked({ ...checked, sections: { ...checked.sections, [key]: !(checked.sections[key as keyof typeof checked.sections] ?? true) } });
  };

  const toggleBullet = (entryIdx: number, bulletIdx: number) => {
    if (!checked) return;
    const experience = checked.experience.map((row, i) => (i === entryIdx ? row.map((v, j) => (j === bulletIdx ? !v : v)) : row));
    setChecked({ ...checked, experience });
  };

  const toggleKeyWin = (idx: number) => {
    if (!checked) return;
    setChecked({ ...checked, keyWins: checked.keyWins.map((v, i) => (i === idx ? !v : v)) });
  };

  const toggleProject = (idx: number) => {
    if (!checked) return;
    setChecked({ ...checked, projects: checked.projects.map((v, i) => (i === idx ? !v : v)) });
  };

  const submitAnswer = async (req: LiveCoverage) => {
    const profile = getProfile();
    const answer = answers[req.requirement]?.trim();
    if (!profile || !draft || !answer) return;
    setSubmitting(req.requirement);
    try {
      const targetLabel = req.evidence?.sourceId ?? draft.experience[0]?.company ?? "";
      const newBulletText = await answerResumeGapQuestion(profile, targetLabel || req.requirement, req.requirement, buildReactiveProbeQuestion(req, app.jdRaw), answer);
      if (!newBulletText.trim()) {
        showToast("No usable detail found in that answer.", "error");
        return;
      }

      const targetId = req.evidence?.sourceId ?? draft.experience[0]?.company ?? "";
      const { content: nextDraft, applied: appliedToDraft } = injectGapAnswerIntoResume(draft, "experience", targetId, newBulletText);
      if (appliedToDraft) {
        setDraft(nextDraft);
        // The new bullet lands at the end of its entry, already checked.
        const entryIdx = nextDraft.experience.findIndex(e => e.company === targetId);
        if (entryIdx >= 0 && checked) {
          const experience = checked.experience.map((row, i) =>
            i === entryIdx ? [...row, true] : row,
          );
          setChecked({ ...checked, experience });
        }
      }

      const { profile: nextProfile, applied: appliedToProfile, summary } = appendGapAnswerToProfile(profile, "experience", targetId, newBulletText);
      if (appliedToProfile) {
        const ok = await saveProfile(nextProfile);
        if (!ok) showToast("Added to this resume, but saving to your profile failed.", "error");
      }

      showToast(appliedToDraft ? `Added — ${summary}` : `Could not place on the resume — ${summary}`, appliedToDraft ? "ok" : "error");
      setAnswers(prev => ({ ...prev, [req.requirement]: "" }));
    } catch (e: any) {
      showToast(e.message || "Couldn't process that answer.", "error");
    } finally {
      setSubmitting(null);
    }
  };

  const handleConfirm = () => {
    if (!draft || !applied) return;
    onConfirm(applied, archetype, audit, atsReadable);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", overflow: "auto", padding: "24px 0" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="section-title">RESUME BUILDER — {app.company} · {app.role}</div>
          <button className="btn" style={{ fontSize: "0.75rem" }} onClick={onClose}>CLOSE</button>
        </div>

        {error && <div style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", marginBottom: 16 }}>{error}</div>}

        {/* Step 1: JD Requirement Map */}
        <div style={{ marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 8, color: "var(--accent)" }}>JD REQUIREMENT MAP</div>
          {requirements.length === 0 && phase === "map" && !error && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Analyzing JD against your profile...</div>
          )}
          {requirements.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {liveCoverage.map(req => (
                <div key={req.requirement} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderBottom: "1px solid var(--border-light)", paddingBottom: 6 }}>
                  <span style={{ color: RATING_COLOR[req.liveRating], fontWeight: 700, minWidth: 60, textTransform: "uppercase" }}>{req.liveRating}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "var(--text-primary)" }}>{req.requirement}{req.lostEvidence && <span style={{ color: "var(--error)" }}> — just lost its only evidence</span>}</div>
                    {req.evidence && <div style={{ color: "var(--text-tertiary)", fontSize: "0.6875rem", marginTop: 2 }}>{req.evidence.sourceId} — "{req.evidence.bulletText.slice(0, 90)}{req.evidence.bulletText.length > 90 ? "..." : ""}"</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {requirements.length > 0 && phase === "map" && (
            <button className="btn btn-primary" style={{ marginTop: 16, padding: "8px 16px" }} onClick={buildDraft}>GENERATE DRAFT</button>
          )}
          {phase === "drafting" && <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent)", marginTop: 12 }}>Drafting resume...</div>}
        </div>

        {/* Adversarial hiring-side score — shown once a draft exists, before CONFIRM & GENERATE PDF is even reachable. */}
        {draft && (
          <div style={{ marginBottom: 24, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="label" style={{ color: "var(--accent)" }}>ADVERSARIAL SCORE — HIRING SIDE</div>
              {auditPhase !== "loading" && (
                <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 8px" }} onClick={() => runAudit(draft, archetype)}>RE-SCORE</button>
              )}
            </div>

            {auditPhase === "loading" && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Scoring like a skeptical screener would...</div>
            )}
            {auditPhase === "error" && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--error)" }}>{auditError}</div>
            )}

            {audit && auditPhase === "done" && (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.75rem", fontWeight: 700, color: VERDICT_COLOR[audit.verdict] }}>{audit.overallScore}/10</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: VERDICT_COLOR[audit.verdict] }}>{audit.verdict.replace(/_/g, " ")}</span>
                  {atsReadable === false && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--error)" }}>ATS PARSE ISSUES FOUND</span>}
                </div>

                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>{audit.summary}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {audit.categories.map(c => (
                    <div key={c.category} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: "var(--font-mono)", fontSize: "0.75rem", borderBottom: "1px solid var(--border-light)", paddingBottom: 6 }}>
                      <span style={{ minWidth: 32, fontWeight: 700, color: c.score >= 4 ? "var(--success)" : c.score >= 3 ? "var(--accent)" : "var(--error)" }}>{c.score}/5</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "var(--text-primary)" }}>{c.label}</div>
                        {c.evidence.length > 0 && <div style={{ color: "var(--text-tertiary)", fontSize: "0.6875rem", marginTop: 2 }}>{c.evidence.join(" · ")}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {audit.deductions.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="label" style={{ fontSize: "0.625rem", color: "var(--error)", marginBottom: 6 }}>DEDUCTIONS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {audit.deductions.map((d, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                          <span style={{ color: SEVERITY_COLOR[d.severity], textTransform: "uppercase", minWidth: 46 }}>{d.severity}</span>
                          <span style={{ color: "var(--text-secondary)" }}>{d.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {audit.bonusPoints.length > 0 && (
                  <div>
                    <div className="label" style={{ fontSize: "0.625rem", color: "var(--success)", marginBottom: 6 }}>BONUS POINTS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {audit.bonusPoints.map((b, i) => (
                        <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          <span style={{ color: "var(--success)", fontWeight: 700 }}>{b.reason}:</span> {b.detail}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: gaps needing a targeted question — shown from the start for weak/none, and live for anything that just lost coverage */}
        {needsAttention.length > 0 && (
          <div style={{ marginBottom: 24, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
            <div className="label" style={{ marginBottom: 8, color: "var(--error)" }}>NEEDS ATTENTION</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {needsAttention.map(req => (
                <div key={req.requirement}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)", marginBottom: 6 }}>
                    {buildReactiveProbeQuestion(req, app.jdRaw)}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={answers[req.requirement] ?? ""}
                      onChange={e => setAnswers(prev => ({ ...prev, [req.requirement]: e.target.value }))}
                      placeholder="Your answer..."
                      style={{ flex: 1, padding: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", borderRadius: 4 }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: "0.75rem", padding: "6px 12px" }}
                      disabled={submitting === req.requirement || !answers[req.requirement]?.trim() || !draft}
                      onClick={() => submitAnswer(req)}
                    >
                      {submitting === req.requirement ? "ADDING..." : "ADD & RECHECK"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2/3: checkbox draft */}
        {draft && checked && applied && (
          <div style={{ marginBottom: 24 }}>
            <div className="label" style={{ marginBottom: 8, color: "var(--accent)" }}>DRAFT — UNCHECK ANYTHING TO EXCLUDE IT</div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
              <input type="checkbox" checked={checked.sections.summary ?? true} onChange={() => toggleSection("summary")} />
              Summary: {draft.summary}
            </label>

            {((draft.keyWins?.length ?? 0) > 0 || (draft.projects?.length ?? 0) > 0) && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "0.8125rem", fontWeight: 700 }}>
                  <input type="checkbox" checked={checked.sections.selectedImpact ?? true} onChange={() => toggleSection("selectedImpact")} />
                  Key Projects & Impact
                </label>
                <div style={{ paddingLeft: 24 }}>
                  {(draft.keyWins ?? []).map((w, i) => (
                    <label key={`kw-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                      <input type="checkbox" checked={checked.keyWins[i] ?? true} onChange={() => toggleKeyWin(i)} />
                      {w}
                    </label>
                  ))}
                  {(draft.projects ?? []).map((p, i) => (
                    <label key={`pr-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                      <input type="checkbox" checked={checked.projects[i] ?? true} onChange={() => toggleProject(i)} />
                      {p.name}: {p.description}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "0.8125rem", fontWeight: 700 }}>
                <input type="checkbox" checked={checked.sections.experience ?? true} onChange={() => toggleSection("experience")} />
                Experience
              </label>
              {draft.experience.map((e, entryIdx) => (
                <div key={entryIdx} style={{ paddingLeft: 24, marginBottom: 6 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>{e.company} — {e.role}</div>
                  {e.bullets.map((b, bulletIdx) => (
                    <label key={bulletIdx} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "0.75rem", paddingLeft: 8 }}>
                      <input type="checkbox" checked={checked.experience[entryIdx]?.[bulletIdx] ?? true} onChange={() => toggleBullet(entryIdx, bulletIdx)} />
                      {b.text}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
              <input type="checkbox" checked={checked.sections.skills ?? true} onChange={() => toggleSection("skills")} />
              Skills
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
              <input type="checkbox" checked={checked.sections.education ?? true} onChange={() => toggleSection("education")} />
              Education
            </label>

            <button className="btn btn-primary" style={{ marginTop: 16, padding: "10px 20px", width: "100%" }} onClick={handleConfirm}>
              CONFIRM & GENERATE PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
