"use client";

import { useState, useRef } from "react";
import { getProfile } from "../lib/profile";
import { getModelSettings } from "../lib/model-settings";
import { getIntegrationSettings } from "../lib/integration-settings";

type QA = { question: string; answer: string };

type Props = {
  jdRaw?: string;
  companyName?: string;
  roleTitle?: string;
  savedAnswers?: QA[];
  onSave?: (qa: QA[]) => void;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function visionExtractQuestions(base64: string, mimeType: string): Promise<string> {
  const res = await fetch("/api/extract-jd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64,
      mimeType,
      instruction: "Extract all the questions from this application form image. List each question on a new line, exactly as written. Output only the questions, no answers.",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Screenshot extraction failed");
  }
  const { text } = await res.json();
  return text;
}

async function fetchUrlQuestions(url: string, exaApiKey?: string): Promise<string> {
  const res = await fetch("/api/fetch-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, exaApiKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "URL fetch failed");
  }
  const { text } = await res.json();
  return text;
}

export function FormQASection({ jdRaw, companyName, roleTitle, savedAnswers, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [questionsText, setQuestionsText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [qa, setQA] = useState<QA[]>(savedAnswers ?? []);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const screenshotRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleScreenshots = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith("image/"));
    if (images.length === 0) { setError("Please upload image files."); return; }
    setError("");
    setIsExtracting(true);
    try {
      const chunks: string[] = [];
      for (let i = 0; i < images.length; i++) {
        setStatus(`Extracting questions from image ${i + 1} of ${images.length}...`);
        const base64 = await readFileAsBase64(images[i]);
        const text = await visionExtractQuestions(base64, images[i].type || "image/jpeg");
        chunks.push(text);
      }
      const combined = chunks.join("\n\n");
      setQuestionsText(prev => prev.trim() ? prev.trim() + "\n\n" + combined : combined);
      setStatus("");
    } catch (e: any) {
      setError(e.message ?? "Extraction failed");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) return;
    setError("");
    setIsFetching(true);
    try {
      const { exaApiKey } = getIntegrationSettings();
      const text = await fetchUrlQuestions(urlInput.trim(), exaApiKey);
      setQuestionsText(prev => prev.trim() ? prev.trim() + "\n\n" + text : text);
      setStatus("");
    } catch (e: any) {
      setError(e.message ?? "Could not fetch URL");
    } finally {
      setIsFetching(false);
    }
  };

  const handleGenerate = async () => {
    if (!questionsText.trim()) { setError("Please add questions first."); return; }
    const profile = getProfile();
    if (!profile) { setError("Profile not found. Please complete your profile in Settings before generating answers."); return; }
    setError("");
    setIsGenerating(true);
    setStatus("Generating answers using your persona...");
    try {
      const modelSettings = getModelSettings();
      const providerSettings = modelSettings?.provider
        ? { provider: modelSettings.provider, model: modelSettings.model, apiKey: modelSettings.apiKey }
        : undefined;

      const res = await fetch("/api/generate-form-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionsText,
          jdContext: jdRaw,
          companyName,
          roleTitle,
          profile,
          providerSettings,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Generation failed");
      }

      const { qa: generated } = await res.json();
      setQA(generated ?? []);
      onSave?.(generated ?? []);
      setStatus("");
    } catch (e: any) {
      setError(e.message ?? "Answer generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyAnswer = (idx: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const copyAll = () => {
    const text = qa.map((item, i) => `Q${i + 1}: ${item.question}\n\nA: ${item.answer}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditText(qa[idx].answer);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const updated = qa.map((item, i) => i === editingIdx ? { ...item, answer: editText } : item);
    setQA(updated);
    onSave?.(updated);
    setEditingIdx(null);
  };

  const busy = isExtracting || isFetching || isGenerating;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 16 }}>
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: 24, background: "none", border: "none", cursor: "pointer", color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="label">FORM QUESTION ANSWERER</span>
          {qa.length > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", padding: "2px 8px", background: "rgba(50,200,100,0.12)", border: "1px solid var(--success)", borderRadius: 2, color: "var(--success)" }}>
              {qa.length} ANSWERS SAVED
            </span>
          )}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            Paste a Google Form link, upload screenshots of the form, or type the questions below. AI will generate tailored answers using your persona and this JD.
          </p>

          {error && (
            <div style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", padding: "8px 12px", background: "rgba(255,50,50,0.08)", border: "1px solid var(--error)", borderRadius: "var(--radius)" }}>
              {error}
            </div>
          )}

          {/* URL row */}
          <div>
            <label className="label" style={{ display: "block", marginBottom: 6, fontSize: "0.6rem" }}>FORM URL (GOOGLE FORMS, TYPEFORM, ETC.)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFetchUrl()}
                placeholder="https://docs.google.com/forms/..."
                disabled={busy}
                style={{ flex: 1, padding: "8px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit", fontSize: "0.8125rem" }}
              />
              <button className="btn btn-primary" onClick={handleFetchUrl} disabled={!urlInput.trim() || busy} style={{ whiteSpace: "nowrap", padding: "8px 14px", fontSize: "0.75rem" }}>
                {isFetching ? "FETCHING..." : "FETCH"}
              </button>
            </div>
          </div>

          {/* Screenshot row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="label" style={{ fontSize: "0.6rem" }}>OR UPLOAD SCREENSHOTS:</span>
            <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => cameraRef.current?.click()} disabled={busy}>+ PHOTO</button>
            <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => screenshotRef.current?.click()} disabled={busy}>+ FILE(S)</button>
            <input ref={screenshotRef} type="file" accept="image/*" multiple onChange={e => { handleScreenshots(Array.from(e.target.files ?? [])); e.target.value = ""; }} style={{ display: "none" }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e => { handleScreenshots(Array.from(e.target.files ?? [])); e.target.value = ""; }} style={{ display: "none" }} />
            {status && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--accent)" }}>{status}</span>}
          </div>

          {/* Questions textarea */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="label" style={{ fontSize: "0.6rem" }}>QUESTIONS (PASTE OR EDIT)</label>
              {questionsText && <button className="btn" style={{ fontSize: "0.5rem", padding: "2px 8px", borderColor: "var(--error)", color: "var(--error)" }} onClick={() => setQuestionsText("")} disabled={busy}>CLEAR</button>}
            </div>
            <textarea
              value={questionsText}
              onChange={e => setQuestionsText(e.target.value)}
              rows={8}
              disabled={busy}
              placeholder={"1. Why do you want to work at this company?\n2. Describe a challenging situation you navigated.\n3. What is your greatest professional achievement?\n\nOr paste raw form text — AI will extract the questions automatically."}
              style={{ width: "100%", padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit", fontSize: "0.8125rem", resize: "vertical", display: "block" }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!questionsText.trim() || busy}
            style={{ width: "100%", padding: 12, justifyContent: "center" }}
          >
            {isGenerating ? "GENERATING ANSWERS..." : "GENERATE ANSWERS WITH AI"}
          </button>

          {/* Generated answers */}
          {qa.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="label" style={{ color: "var(--success)" }}>GENERATED ANSWERS ({qa.length})</div>
                <button className="btn" style={{ fontSize: "0.5rem", padding: "3px 10px" }} onClick={copyAll}>COPY ALL</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {qa.map((item, idx) => (
                  <div key={idx} style={{ borderLeft: "3px solid var(--border)", paddingLeft: 14 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Q{idx + 1}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: 500, marginBottom: 10 }}>
                      {item.question}
                    </div>

                    {editingIdx === idx ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={5}
                          style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--accent)", color: "var(--text-primary)", fontFamily: "inherit", fontSize: "0.8125rem", resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-primary" style={{ fontSize: "0.625rem", padding: "4px 12px" }} onClick={saveEdit}>SAVE</button>
                          <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 12px" }} onClick={() => setEditingIdx(null)}>CANCEL</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                          {item.answer}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn"
                            style={{ fontSize: "0.5rem", padding: "3px 10px", borderColor: copiedIdx === idx ? "var(--success)" : undefined, color: copiedIdx === idx ? "var(--success)" : undefined }}
                            onClick={() => copyAnswer(idx, item.answer)}
                          >
                            {copiedIdx === idx ? "COPIED!" : "COPY"}
                          </button>
                          <button className="btn" style={{ fontSize: "0.5rem", padding: "3px 10px" }} onClick={() => startEdit(idx)}>EDIT</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
