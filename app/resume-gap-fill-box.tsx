"use client";

import { useState } from "react";
import { getProfile, saveProfile } from "../lib/profile";
import { generateResumeGapQuestions, answerResumeGapQuestion, appendGapAnswerToProfile } from "../lib/profile-enrichment";
import { injectGapAnswerIntoResume } from "../lib/resume-gap-fill";
import { ResumeGapQuestion } from "../lib/schemas";
import { ResumeContent } from "../lib/resume-schema";
import type { Application } from "../lib/store";
import { showToast } from "../lib/toast";

type GapState = {
  q: ResumeGapQuestion;
  answer: string;
  submitting: boolean;
  resolved: boolean;
  confirmation: string | null; // what happened, shown after the answer is processed
};

/**
 * Job-time gap analysis (resume rebuild #5): compares this job's already-
 * extracted target priorities against the profile, asks a few specific
 * questions for what's missing, and — the moment you answer — both (c)
 * injects the new bullet into THIS resume and (d) writes it back to the
 * canonical profile via the same non-destructive merge/dedupe rule Features
 * 1-3 use, so it's reusable for other jobs later. No separate accept step:
 * answering the question IS the approval, per the job-scoped framing —
 * you're never asked to go edit your profile separately.
 */
export function ResumeGapFillBox({
  app,
  resumeContent,
  onResumeContentChange,
}: {
  app: Application;
  resumeContent: ResumeContent;
  onResumeContentChange: (next: ResumeContent) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [items, setItems] = useState<GapState[]>([]);

  const fetchGaps = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found."); return; }
    setLoading(true);
    setError("");
    try {
      const questions = await generateResumeGapQuestions(
        profile, app, resumeContent.targetPriorities ?? [], resumeContent.subFocus,
      );
      if (questions.length === 0) {
        setError("No gaps found — your profile already evidences what this role values.");
        setItems([]);
      } else {
        setItems(questions.map(q => ({ q, answer: "", submitting: false, resolved: false, confirmation: null })));
      }
      setStarted(true);
    } catch (e: any) {
      setError(e.message || "Gap analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const setAnswer = (id: string, answer: string) => {
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, answer } : it)));
  };

  const skipQuestion = (id: string) => {
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, resolved: true } : it)));
  };

  const submitAnswer = async (id: string) => {
    const profile = getProfile();
    const item = items.find(it => it.q.id === id);
    if (!profile || !item || !item.answer.trim()) return;
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: true } : it)));

    try {
      const newBulletText = await answerResumeGapQuestion(
        profile, item.q.targetLabel, item.q.priority, item.q.question, item.answer.trim(),
      );

      if (!newBulletText.trim()) {
        setItems(prev => prev.map(it => (it.q.id === id
          ? { ...it, submitting: false, resolved: true, confirmation: "No usable detail found in that answer — nothing added." }
          : it)));
        return;
      }

      // (c) inject into THIS resume, immediately.
      const { content: nextResume, applied: appliedToResume } = injectGapAnswerIntoResume(
        resumeContent, item.q.targetType, item.q.targetId, newBulletText,
      );
      if (appliedToResume) onResumeContentChange(nextResume);

      // (d) write the SAME fact back to the canonical profile, non-destructively.
      const { profile: nextProfile, applied: appliedToProfile, summary } = appendGapAnswerToProfile(
        profile, item.q.targetType, item.q.targetId, newBulletText,
      );
      if (appliedToProfile) {
        const ok = await saveProfile(nextProfile);
        if (!ok) showToast("Added to this resume, but saving to your profile failed.", "error");
      }

      const confirmation = appliedToResume
        ? (appliedToProfile ? `Added to this resume and saved to profile — ${summary}` : `Added to this resume. ${summary}`)
        : `Could not place this on the resume (no matching entry). ${summary}`;

      setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: false, resolved: true, confirmation } : it)));
    } catch (e: any) {
      showToast(e.message || "Couldn't process that answer.", "error");
      setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: false } : it)));
    }
  };

  const allResolved = items.length > 0 && items.every(it => it.resolved);
  const confirmedItems = items.filter(it => it.resolved && it.confirmation);

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--border)" }}>
      <div className="label" style={{ fontSize: "0.625rem", color: "var(--accent)", marginBottom: 8 }}>GAPS FOR THIS JOB</div>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 8, lineHeight: 1.5 }}>
        Compares what this JD values against your profile and asks about what's missing. Answers land in this resume immediately, and are saved back to your profile so future resumes can use them too — no separate profile edit needed.
      </div>

      {(!started || allResolved) && (
        <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={fetchGaps} disabled={loading}>
          {loading ? "ANALYZING..." : started ? "CHECK FOR MORE GAPS" : "FIND GAPS FOR THIS JOB"}
        </button>
      )}

      {error && (
        <div style={{ marginTop: 8, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{error}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: items.some(i => !i.resolved) ? 12 : 0 }}>
        {items.filter(it => !it.resolved).map(item => (
          <div key={item.q.id} style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
            <div className="label" style={{ fontSize: "0.5625rem", color: "var(--accent)", marginBottom: 4 }}>
              {item.q.priority} · {item.q.targetLabel}
            </div>
            {item.q.existingEvidence && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 6, fontStyle: "italic" }}>
                Already have: "{item.q.existingEvidence}"
              </div>
            )}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)", marginBottom: 8 }}>
              {item.q.question}
            </div>
            <textarea
              value={item.answer}
              onChange={e => setAnswer(item.q.id, e.target.value)}
              placeholder="Your answer..."
              rows={2}
              disabled={item.submitting}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAnswer(item.q.id); }
              }}
              style={{ width: "100%", padding: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", resize: "vertical", borderRadius: 4 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <button className="btn" style={{ fontSize: "0.625rem", padding: "3px 10px" }} onClick={() => skipQuestion(item.q.id)} disabled={item.submitting}>
                SKIP
              </button>
              <button className="btn btn-primary" style={{ fontSize: "0.625rem", padding: "3px 10px" }} onClick={() => submitAnswer(item.q.id)} disabled={item.submitting || !item.answer.trim()}>
                {item.submitting ? "SAVING..." : "SUBMIT"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmedItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          {confirmedItems.map(item => (
            <div key={item.q.id} style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--success)" }}>
              ✓ {item.confirmation}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
