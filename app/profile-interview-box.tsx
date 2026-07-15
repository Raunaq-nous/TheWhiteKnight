"use client";

import { useState } from "react";
import { getProfile, saveProfile } from "../lib/profile";
import { generateProfileQuestions, rewriteBulletFromAnswer, replaceBulletInProfile } from "../lib/profile-enrichment";
import { ProfileQuestion } from "../lib/schemas";
import { showToast } from "../lib/toast";

type QuestionState = {
  q: ProfileQuestion;
  answer: string;
  submitting: boolean;
  rewritten: string | null; // set once a rewrite preview is ready
  resolved: boolean;
};

/**
 * Feature 2: the AI reviews the profile for the weakest/most generic
 * bullets and asks 2-3 targeted follow-up questions at a time. Each answer
 * is turned into a rewritten bullet the user previews and accepts/rejects
 * before anything is saved — a conversational loop, a few at a time.
 */
export function ProfileInterviewBox() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [items, setItems] = useState<QuestionState[]>([]);
  const [askedTexts, setAskedTexts] = useState<string[]>([]);

  const fetchQuestions = async () => {
    const profile = getProfile();
    if (!profile) { setError("No profile found."); return; }
    setLoading(true);
    setError("");
    try {
      const questions = await generateProfileQuestions(profile, askedTexts);
      if (questions.length === 0) {
        setError(started
          ? "No more weak bullets found — your profile looks well-quantified."
          : "Your profile already looks well-quantified — no follow-up questions right now.");
        setItems([]);
      } else {
        setItems(questions.map(q => ({ q, answer: "", submitting: false, rewritten: null, resolved: false })));
        setAskedTexts(prev => [...prev, ...questions.map(x => x.question)]);
      }
      setStarted(true);
    } catch (e: any) {
      setError(e.message || "Couldn't generate questions.");
    } finally {
      setLoading(false);
    }
  };

  const setAnswer = (id: string, answer: string) => {
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, answer } : it)));
  };

  const submitAnswer = async (id: string) => {
    const profile = getProfile();
    if (!profile) return;
    const item = items.find(it => it.q.id === id);
    if (!item || !item.answer.trim()) return;
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: true } : it)));
    try {
      const rewrittenText = await rewriteBulletFromAnswer(profile, item.q.targetLabel, item.q.currentText, item.q.question, item.answer.trim());
      setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: false, rewritten: rewrittenText } : it)));
    } catch (e: any) {
      showToast(e.message || "Rewrite failed.", "error");
      setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: false } : it)));
    }
  };

  const acceptRewrite = async (id: string) => {
    const profile = getProfile();
    const item = items.find(it => it.q.id === id);
    if (!profile || !item || !item.rewritten) return;
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: true } : it)));
    const next = replaceBulletInProfile(profile, item.q.targetType, item.q.targetId, item.q.currentText, item.rewritten);
    const ok = await saveProfile(next);
    if (ok) showToast("Bullet updated.", "ok");
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, submitting: false, resolved: true } : it)));
  };

  const rejectRewrite = (id: string) => {
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, rewritten: null, resolved: false } : it)));
  };

  const skipQuestion = (id: string) => {
    setItems(prev => prev.map(it => (it.q.id === id ? { ...it, resolved: true } : it)));
  };

  const allResolved = items.length > 0 && items.every(it => it.resolved);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 16 }}>
      <div className="label" style={{ marginBottom: 8 }}>SHARPEN YOUR PROFILE</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 12, lineHeight: 1.5 }}>
        The AI scans your weakest, most generic bullets and asks a few targeted questions to pin down the missing numbers. Answer in plain text — nothing is saved until you accept the rewrite.
      </div>

      {(!started || (allResolved)) && (
        <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={fetchQuestions} disabled={loading}>
          {loading ? "THINKING..." : started ? "GET MORE QUESTIONS" : "GET QUESTIONS"}
        </button>
      )}

      {error && (
        <div style={{ marginTop: 8, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{error}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: items.some(i => !i.resolved) ? 12 : 0 }}>
        {items.filter(it => !it.resolved).map(item => (
          <div key={item.q.id} style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
            <div className="label" style={{ fontSize: "0.5625rem", color: "var(--accent)", marginBottom: 4 }}>{item.q.targetLabel}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 6, fontStyle: "italic" }}>
              Current: "{item.q.currentText}"
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--text-primary)", marginBottom: 8 }}>
              {item.q.question}
            </div>

            {item.rewritten === null ? (
              <>
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
                    {item.submitting ? "REWRITING..." : "SUBMIT"}
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>REWRITTEN BULLET</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--success)", marginBottom: 8, padding: 8, background: "var(--surface)", borderRadius: 4 }}>
                  {item.rewritten}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button className="btn" style={{ fontSize: "0.625rem", padding: "3px 10px" }} onClick={() => rejectRewrite(item.q.id)} disabled={item.submitting}>
                    REJECT
                  </button>
                  <button className="btn btn-primary" style={{ fontSize: "0.625rem", padding: "3px 10px" }} onClick={() => acceptRewrite(item.q.id)} disabled={item.submitting}>
                    {item.submitting ? "SAVING..." : "ACCEPT"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
