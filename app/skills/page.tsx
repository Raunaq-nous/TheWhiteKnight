"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "../components";
import { getProfile } from "../../lib/profile";
import { getApplications, Application } from "../../lib/store";
import { getPlan, savePlan, getStatuses, toggleStep, setStatus, StoredPlan } from "../../lib/skills-store";
import type { SkillBuilderResult } from "../../lib/prompts";

const LEVEL_ORDER: Array<"novice" | "intermediate" | "advanced" | "expert"> = ["novice", "intermediate", "advanced", "expert"];

function SkillProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="skill-bar-track">
      <div className="skill-bar-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color }} />
    </div>
  );
}

function priorityColor(p: string) {
  if (p === "critical") return "var(--error)";
  if (p === "high") return "var(--accent)";
  if (p === "medium") return "var(--info)";
  return "var(--text-tertiary)";
}

export default function SkillBuilderPage() {
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [statuses, setStatusesState] = useState<Record<string, any>>({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "high" | "in-progress" | "completed">("all");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  useEffect(() => {
    setHasProfile(!!getProfile());
    setApplications(getApplications());
    setPlan(getPlan());
    setStatusesState(getStatuses());
    setProfileLoaded(true);

    const refresh = () => {
      setStatusesState(getStatuses());
      setPlan(getPlan());
    };
    window.addEventListener("careeros-skill-change", refresh);
    return () => window.removeEventListener("careeros-skill-change", refresh);
  }, []);

  const generatePlan = async () => {
    const profile = getProfile();
    if (!profile) { setError("Set up your profile first."); return; }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/skill-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, applications }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const { data } = await res.json() as { data: SkillBuilderResult };
      savePlan(data);
      setPlan(getPlan());
    } catch (e: any) {
      setError(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const filteredSkills = useMemo(() => {
    if (!plan) return [];
    const skills = plan.result.trackedSkills;
    if (filter === "all") return skills;
    if (filter === "critical") return skills.filter(s => s.priority === "critical");
    if (filter === "high") return skills.filter(s => s.priority === "high" || s.priority === "critical");
    if (filter === "in-progress") return skills.filter(s => {
      const stat = statuses[s.name];
      return stat && stat.completedSteps && stat.completedSteps.length > 0 && stat.completedSteps.length < s.learningPath.length;
    });
    if (filter === "completed") return skills.filter(s => {
      const stat = statuses[s.name];
      return stat && stat.completedSteps && stat.completedSteps.length === s.learningPath.length;
    });
    return skills;
  }, [plan, filter, statuses]);

  const aggregateStats = useMemo(() => {
    if (!plan) return { total: 0, critical: 0, inProgress: 0, completed: 0, totalWeeks: 0 };
    const skills = plan.result.trackedSkills;
    const total = skills.length;
    const critical = skills.filter(s => s.priority === "critical").length;
    let inProgress = 0;
    let completed = 0;
    let totalWeeks = 0;
    for (const s of skills) {
      const stat = statuses[s.name];
      const done = stat?.completedSteps?.length ?? 0;
      const all = s.learningPath.length;
      if (done === all && all > 0) completed++;
      else if (done > 0) inProgress++;
      totalWeeks += s.estimatedWeeks ?? 0;
    }
    return { total, critical, inProgress, completed, totalWeeks };
  }, [plan, statuses]);

  if (!profileLoaded) {
    return (
      <div className="page-shell">
        <Header />
        <div className="page-main">
          <div className="container" style={{ textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            LOADING...
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className="page-shell">
        <Header />
        <div className="page-main">
          <div className="container">
            <div className="surface-card" style={{ textAlign: "center", padding: 64 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", color: "var(--text-secondary)", marginBottom: 16 }}>
                NO PROFILE FOUND
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-tertiary)", marginBottom: 24 }}>
                The Skill Builder needs your profile to map skills to evidence and to your specific projects.
              </p>
              <Link href="/profile/" className="btn btn-primary" style={{ textDecoration: "none" }}>SET UP PROFILE</Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Header />
      <main className="page-main">
        <div className="container">
          {/* Hero */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 24 }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <div className="label" style={{ marginBottom: 8 }}>SKILL PROGRESSION SYSTEM</div>
              <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "2.25rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 12 }}>
                BUILD WHAT THE MARKET WANTS
              </h1>
              <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: 720 }}>
                Aggregates skill demand from every JD in your pipeline, maps each skill to specific evidence in your profile and AI tool builds, and produces a concrete progression plan with weekly milestones.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                onClick={generatePlan}
                disabled={generating}
                style={{ padding: "10px 20px" }}
              >
                {generating ? "ANALYZING..." : plan ? "REGENERATE PLAN" : "GENERATE PLAN"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid var(--error)", padding: 16, borderRadius: "var(--radius)", marginBottom: 24, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          {!plan && !generating && (
            <div className="surface-card" style={{ textAlign: "center", padding: 64 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-tertiary)", marginBottom: 12 }}>
                NO PLAN YET
              </div>
              <p style={{ color: "var(--text-secondary)", maxWidth: 560, margin: "0 auto 24px", lineHeight: 1.6 }}>
                You have <strong style={{ color: "var(--text-primary)" }}>{applications.length}</strong> application{applications.length === 1 ? "" : "s"} in pipeline.
                {applications.length === 0 && " Add at least one to get demand-weighted skill recommendations. You can generate a profile-only plan in the meantime."}
              </p>
              <button onClick={generatePlan} className="btn btn-primary" disabled={generating}>
                GENERATE FIRST PLAN
              </button>
            </div>
          )}

          {plan && (
            <>
              {/* Headline summary */}
              <div className="surface-card-accent" style={{ marginBottom: 24 }}>
                <div className="label" style={{ marginBottom: 8, color: "var(--accent)" }}>RECOMMENDED FOCUS — NEXT 90 DAYS</div>
                <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                  {plan.result.recommendedFocus}
                </p>
                <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 24, fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                  <span>GENERATED: {new Date(plan.generatedAt).toLocaleDateString()}</span>
                  <span>BASED ON: {applications.length} APPLICATION{applications.length === 1 ? "" : "S"} + PROFILE</span>
                </div>
              </div>

              {/* Stats bar */}
              <div className="stats-bar">
                <div className="stat">
                  <div className="stat-value">{aggregateStats.total}</div>
                  <div className="stat-label">TRACKED</div>
                </div>
                <div className="stat">
                  <div className="stat-value" style={{ color: "var(--error)" }}>{aggregateStats.critical}</div>
                  <div className="stat-label">CRITICAL</div>
                </div>
                <div className="stat">
                  <div className="stat-value" style={{ color: "var(--accent)" }}>{aggregateStats.inProgress}</div>
                  <div className="stat-label">IN PROGRESS</div>
                </div>
                <div className="stat">
                  <div className="stat-value" style={{ color: "var(--success)" }}>{aggregateStats.completed}</div>
                  <div className="stat-label">COMPLETED</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{aggregateStats.totalWeeks}</div>
                  <div className="stat-label">TOTAL WEEKS</div>
                </div>
                <div className="stat">
                  <div className="stat-value" style={{ color: "var(--info)" }}>
                    {aggregateStats.total > 0 ? Math.round((aggregateStats.completed / aggregateStats.total) * 100) : 0}%
                  </div>
                  <div className="stat-label">DONE</div>
                </div>
              </div>

              {/* Strengths and gaps */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div className="surface-card">
                  <div className="label" style={{ color: "var(--success)", marginBottom: 12 }}>TOP STRENGTHS</div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.7 }}>
                    {plan.result.topStrengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div className="surface-card">
                  <div className="label" style={{ color: "var(--error)", marginBottom: 12 }}>TOP GAPS</div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.7 }}>
                    {plan.result.topGaps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {([
                  ["all", "ALL"],
                  ["critical", `CRITICAL (${aggregateStats.critical})`],
                  ["high", "HIGH+"],
                  ["in-progress", `IN PROGRESS (${aggregateStats.inProgress})`],
                  ["completed", `COMPLETED (${aggregateStats.completed})`],
                ] as [typeof filter, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className="btn"
                    onClick={() => setFilter(key)}
                    style={filter === key ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Skill cards grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
                {filteredSkills.map(skill => {
                  const stat = statuses[skill.name];
                  const completedCount = stat?.completedSteps?.length ?? 0;
                  const totalSteps = skill.learningPath.length;
                  const stepProgress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
                  const effectiveProgress = Math.max(skill.progressPercent, stepProgress);
                  const isExpanded = expandedSkill === skill.name;
                  const currentLevel = stat?.manualLevel ?? skill.currentLevel;
                  const barColor = priorityColor(skill.priority);

                  return (
                    <div key={skill.name} className={`skill-card priority-${skill.priority}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.9375rem", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                            {skill.name}
                          </div>
                          <div className="label" style={{ color: "var(--text-tertiary)" }}>{skill.category}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span className="label" style={{ fontSize: "0.5625rem", color: barColor }}>{skill.priority.toUpperCase()}</span>
                          <span className="label" style={{ fontSize: "0.5625rem" }}>×{skill.demandFromJDs} DEMAND</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                        <span className={`level-badge level-badge-${currentLevel}`}>{currentLevel}</span>
                        <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.6rem" }}>→</span>
                        <span className={`level-badge level-badge-${skill.targetLevel}`}>{skill.targetLevel}</span>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {Math.round(effectiveProgress)}%
                        </span>
                      </div>
                      <SkillProgressBar percent={effectiveProgress} color={barColor} />

                      <div style={{ marginTop: 12, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        <strong style={{ color: "var(--text-primary)" }}>Next milestone:</strong> {skill.nextMilestone}
                      </div>
                      <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        ETA: {skill.estimatedWeeks} weeks · {completedCount}/{totalSteps} steps done
                      </div>

                      <button
                        className="btn"
                        style={{ marginTop: 12, width: "100%", padding: "8px 12px", fontSize: "0.6875rem" }}
                        onClick={() => setExpandedSkill(isExpanded ? null : skill.name)}
                      >
                        {isExpanded ? "HIDE DETAILS" : "VIEW EVIDENCE & PATH"}
                      </button>

                      {isExpanded && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                          {/* Evidence */}
                          <div style={{ marginBottom: 16 }}>
                            <div className="label" style={{ marginBottom: 8 }}>EVIDENCE FROM YOUR WORK</div>
                            {skill.evidence.length === 0 ? (
                              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontStyle: "italic" }}>No direct evidence yet — build something.</p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {skill.evidence.map((e, i) => (
                                  <div key={i} style={{ background: "var(--bg)", padding: 10, borderRadius: 2, border: "1px solid var(--border-light)" }}>
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--accent)", marginBottom: 2 }}>{e.source}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{e.description}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Learning path */}
                          <div style={{ marginBottom: 12 }}>
                            <div className="label" style={{ marginBottom: 8 }}>LEARNING PATH</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {skill.learningPath.map(step => {
                                const isDone = stat?.completedSteps?.includes(step.step);
                                return (
                                  <div
                                    key={step.step}
                                    onClick={() => { toggleStep(skill.name, step.step); setStatusesState(getStatuses()); }}
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      alignItems: "flex-start",
                                      padding: 10,
                                      background: isDone ? "rgba(0,168,107,0.05)" : "var(--bg)",
                                      border: `1px solid ${isDone ? "var(--success)" : "var(--border-light)"}`,
                                      borderRadius: 2,
                                      cursor: "pointer",
                                      transition: "all 150ms"
                                    }}
                                  >
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: isDone ? "var(--success)" : "var(--text-tertiary)", minWidth: 20 }}>
                                      {isDone ? "✓" : step.step}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: "0.8125rem", color: isDone ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: isDone ? "line-through" : "none", lineHeight: 1.5 }}>
                                        {step.action}
                                      </div>
                                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                                        {step.resource} · {step.weeks}W
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                              Click any step to mark complete.
                            </p>
                          </div>

                          {/* Manual level override */}
                          <div>
                            <div className="label" style={{ marginBottom: 8 }}>MANUAL LEVEL OVERRIDE</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {LEVEL_ORDER.map(lvl => (
                                <button
                                  key={lvl}
                                  className="btn"
                                  onClick={() => {
                                    setStatus(skill.name, { ...stat, manualLevel: lvl, completedSteps: stat?.completedSteps ?? [] });
                                    setStatusesState(getStatuses());
                                  }}
                                  style={currentLevel === lvl ? { borderColor: "var(--accent)", color: "var(--accent)", fontSize: "0.625rem", padding: "4px 8px" } : { fontSize: "0.625rem", padding: "4px 8px" }}
                                >
                                  {lvl.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
