"use client";

import { useState } from "react";

type ExpectedFile = { name: string; desc: string };

export function PersonaBrowser({
  coreFiles,
  resumes,
  expectedFiles,
}: {
  coreFiles: string[];
  resumes: string[];
  expectedFiles: ExpectedFile[];
}) {
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const openFileContent = async (name: string) => {
    if (openFile === name) { setOpenFile(null); return; }
    setOpenFile(name);
    setLoading(true);
    setError("");
    setContent("");
    try {
      const res = await fetch(`/api/persona?file=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Read failed: ${res.status}`);
      setContent(data.content || "");
    } catch (e: any) {
      setError(e.message || "Failed to read file.");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (name: string) => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="config-grid">
      {/* Left: core files */}
      <div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
          <div className="label" style={{ marginBottom: 16 }}>CORE PERSONA FILES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {expectedFiles.map(f => {
              const isReady = coreFiles.includes(f.name);
              const isOpen = openFile === f.name;
              return (
                <div key={f.name} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <button
                    onClick={() => isReady ? openFileContent(f.name) : null}
                    disabled={!isReady}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 0",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: isReady ? "pointer" : "default",
                      textAlign: "left",
                      color: "inherit",
                    }}
                  >
                    <span style={{ color: isReady ? "var(--success)" : "var(--text-tertiary)", fontSize: "0.75rem", marginTop: 2, flexShrink: 0 }}>
                      {isReady ? (isOpen ? "▼" : "▶") : "○"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: "0.8125rem", marginBottom: 2, wordBreak: "break-word" }}>{f.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{f.desc}</div>
                    </div>
                    <span className={`pill ${isReady ? "pill-offer" : "pill-sourced"}`} style={{ flexShrink: 0 }}>
                      {isReady ? "READY" : "PENDING"}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 0 16px 24px" }}>
                      {loading && <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>LOADING...</div>}
                      {error && <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--error)" }}>{error}</div>}
                      {!loading && !error && content && (
                        <>
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => navigator.clipboard.writeText(content)}>COPY</button>
                            <button className="btn" style={{ fontSize: "0.625rem", padding: "4px 10px" }} onClick={() => downloadFile(f.name)}>DOWNLOAD</button>
                          </div>
                          <pre style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border-light)",
                            borderRadius: "var(--radius)",
                            padding: 12,
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                            maxHeight: 480,
                            overflowY: "auto",
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}>{content}</pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, fontSize: "0.6875rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
            Note: Persona files are read-only in production. Edit them locally in the <code>persona/</code> directory of the repo, then redeploy.
          </div>
        </div>
      </div>

      {/* Right: resume archive */}
      <div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
          <div className="label" style={{ marginBottom: 16 }}>RESUME ARCHIVE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {resumes.length === 0 ? (
              <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>No resumes found</div>
            ) : (
              resumes.map(r => (
                <div key={r} className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", padding: "4px 0", wordBreak: "break-word" }}>
                  {r}
                </div>
              ))
            )}
          </div>
          <div className="label" style={{ marginTop: 12, color: "var(--text-tertiary)" }}>{resumes.length} VARIANTS</div>
        </div>
      </div>
    </div>
  );
}
