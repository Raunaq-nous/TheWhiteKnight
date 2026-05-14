"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header, Footer } from "../../components";
import {
  getProfile, saveProfile, getSeedProfile, Profile,
  ExperienceEntry, EducationEntry, ProjectEntry, Publication, Certification
} from "../../../lib/profile";

const TABS = ["PERSONAL", "EXPERIENCE", "SKILLS", "PROJECTS", "EDUCATION", "CERTIFICATIONS", "PUBLICATIONS", "VOICE"] as const;
type Tab = typeof TABS[number];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label" style={{ display: "block", marginBottom: 6, fontSize: "0.625rem" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "var(--bg-primary)",
  border: "1px solid var(--border)", color: "var(--text-primary)",
  fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: 2,
};

const taStyle: React.CSSProperties = { ...inputStyle, resize: "vertical" };

function nanoid() { return Math.random().toString(36).slice(2, 9); }

export default function ProfileEditPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("PERSONAL");
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const p = getProfile() ?? getSeedProfile();
    setProfile(p);
  }, []);

  // Auto-save 1.5s after any profile field change (skip the initial load)
  useEffect(() => {
    if (!profile) return;
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveProfile(profile);
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [profile]);

  if (!profile) return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <div style={{ padding: 64, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>LOADING...</div>
      <Footer />
    </div>
  );

  const set = (key: keyof Profile, val: any) => setProfile(prev => prev ? { ...prev, [key]: val } : prev);

  const handleSave = () => {
    if (!profile) return;
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSaveAndExit = () => {
    if (!profile) return;
    saveProfile(profile);
    router.push("/profile/");
  };

  // --- Experience helpers ---
  const addExp = () => {
    const entry: ExperienceEntry = { id: nanoid(), company: "", role: "", tenure: "", location: "", current: false, bullets: "" };
    set("experience", [...profile.experience, entry]);
  };
  const updateExp = (id: string, key: keyof ExperienceEntry, val: any) => {
    set("experience", profile.experience.map(e => e.id === id ? { ...e, [key]: val } : e));
  };
  const removeExp = (id: string) => set("experience", profile.experience.filter(e => e.id !== id));
  const moveExp = (id: string, dir: -1 | 1) => {
    const arr = [...profile.experience];
    const idx = arr.findIndex(e => e.id === id);
    if (idx + dir < 0 || idx + dir >= arr.length) return;
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    set("experience", arr);
  };

  // --- Education helpers ---
  const addEdu = () => set("education", [...profile.education, { id: nanoid(), institution: "", degree: "", field: "", years: "", gpa: "", achievements: "" }]);
  const updateEdu = (id: string, key: keyof EducationEntry, val: any) => set("education", profile.education.map(e => e.id === id ? { ...e, [key]: val } : e));
  const removeEdu = (id: string) => set("education", profile.education.filter(e => e.id !== id));

  // --- Project helpers ---
  const addProj = () => set("projects", [...profile.projects, { id: nanoid(), name: "", description: "", stack: "", outcomes: "", repoUrl: "" }]);
  const updateProj = (id: string, key: keyof ProjectEntry, val: any) => set("projects", profile.projects.map(p => p.id === id ? { ...p, [key]: val } : p));
  const removeProj = (id: string) => set("projects", profile.projects.filter(p => p.id !== id));
  const moveProj = (id: string, dir: -1 | 1) => {
    const arr = [...profile.projects];
    const idx = arr.findIndex(p => p.id === id);
    if (idx + dir < 0 || idx + dir >= arr.length) return;
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    set("projects", arr);
  };

  // --- Certification helpers ---
  const addCert = () => set("certifications", [...profile.certifications, { id: nanoid(), name: "", issuer: "", date: "", relevance: "" }]);
  const updateCert = (id: string, key: keyof Certification, val: any) => set("certifications", profile.certifications.map(c => c.id === id ? { ...c, [key]: val } : c));
  const removeCert = (id: string) => set("certifications", profile.certifications.filter(c => c.id !== id));

  // --- Publication helpers ---
  const addPub = () => set("publications", [...profile.publications, { id: nanoid(), title: "", publication: "", year: "", url: "" }]);
  const updatePub = (id: string, key: keyof Publication, val: any) => set("publications", profile.publications.map(p => p.id === id ? { ...p, [key]: val } : p));
  const removePub = (id: string) => set("publications", profile.publications.filter(p => p.id !== id));

  // --- Skills helpers ---
  const updateSkillCategory = (cat: string, val: string) => set("skills", { ...profile.skills, [cat]: val });
  const renameCategory = (oldKey: string, newKey: string) => {
    const s = { ...profile.skills };
    s[newKey] = s[oldKey];
    delete s[oldKey];
    set("skills", s);
  };
  const addSkillCategory = () => set("skills", { ...profile.skills, "NEW CATEGORY": "" });
  const removeSkillCategory = (cat: string) => {
    const s = { ...profile.skills };
    delete s[cat];
    set("skills", s);
  };

  const btnStyle: React.CSSProperties = { padding: "6px 12px", fontSize: "0.625rem" };
  const dangerBtnStyle: React.CSSProperties = { ...btnStyle, borderColor: "var(--error)", color: "var(--error)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 64, flex: 1 }}>

        {/* Page header */}
        <div className="section-header" style={{ marginBottom: 0 }}>
          <div>
            <span className="section-title">EDIT PROFILE</span>
            <span className="label" style={{ marginLeft: 12, color: "var(--text-tertiary)" }}>{profile.name}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(saved || autoSaved) && <span style={{ color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{autoSaved ? "AUTO-SAVED" : "SAVED"}</span>}
            <button className="btn" onClick={() => router.push("/profile/")}>CANCEL</button>
            <button className="btn" onClick={handleSave}>SAVE DRAFT</button>
            <button className="btn btn-primary" onClick={handleSaveAndExit}>SAVE & VIEW</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 24, marginTop: 16, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
                letterSpacing: "0.05em", background: "transparent", border: "none",
                borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === t ? "var(--accent)" : "var(--text-tertiary)",
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── PERSONAL ── */}
        {tab === "PERSONAL" && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="FULL NAME">
                <input style={inputStyle} value={profile.name} onChange={e => set("name", e.target.value)} placeholder="Your full name" />
              </Field>
              <Field label="YEARS OF EXPERIENCE">
                <input style={inputStyle} value={profile.yearsOfExperience} onChange={e => set("yearsOfExperience", e.target.value)} placeholder="e.g. 7+" />
              </Field>
            </div>
            <Field label="HEADLINE (shown on resume and cover letters)">
              <textarea style={taStyle} rows={3} value={profile.headline} onChange={e => set("headline", e.target.value)} placeholder="One-liner that anchors your narrative" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="PRIMARY EMAIL">
                <input style={inputStyle} type="email" value={profile.email} onChange={e => set("email", e.target.value)} />
              </Field>
              <Field label="SECONDARY EMAIL">
                <input style={inputStyle} type="email" value={profile.secondaryEmail ?? ""} onChange={e => set("secondaryEmail", e.target.value)} />
              </Field>
              <Field label="PHONE">
                <input style={inputStyle} value={profile.phone} onChange={e => set("phone", e.target.value)} />
              </Field>
              <Field label="CURRENT LOCATION">
                <input style={inputStyle} value={profile.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Gurgaon, India" />
              </Field>
            </div>
            <Field label="OPEN TO LOCATIONS (comma-separated)">
              <input style={inputStyle} value={profile.locationsOpenTo} onChange={e => set("locationsOpenTo", e.target.value)} placeholder="Mumbai, Dubai, Remote" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Field label="LINKEDIN">
                <input style={inputStyle} value={profile.linkedin ?? ""} onChange={e => set("linkedin", e.target.value)} placeholder="linkedin.com/in/..." />
              </Field>
              <Field label="GITHUB">
                <input style={inputStyle} value={profile.github ?? ""} onChange={e => set("github", e.target.value)} placeholder="github.com/..." />
              </Field>
              <Field label="PORTFOLIO">
                <input style={inputStyle} value={profile.portfolio ?? ""} onChange={e => set("portfolio", e.target.value)} placeholder="yoursite.com" />
              </Field>
            </div>
          </div>
        )}

        {/* ── EXPERIENCE ── */}
        {tab === "EXPERIENCE" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary" style={btnStyle} onClick={addExp}>+ ADD ROLE</button>
            </div>
            {profile.experience.map((exp, idx) => (
              <div key={exp.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase" }}>
                    {exp.company || `ROLE ${idx + 1}`}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" style={btnStyle} onClick={() => moveExp(exp.id, -1)} disabled={idx === 0}>↑</button>
                    <button className="btn" style={btnStyle} onClick={() => moveExp(exp.id, 1)} disabled={idx === profile.experience.length - 1}>↓</button>
                    <button className="btn" style={dangerBtnStyle} onClick={() => removeExp(exp.id)}>REMOVE</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Field label="COMPANY">
                    <input style={inputStyle} value={exp.company} onChange={e => updateExp(exp.id, "company", e.target.value)} placeholder="Company name" />
                  </Field>
                  <Field label="ROLE TITLE">
                    <input style={inputStyle} value={exp.role} onChange={e => updateExp(exp.id, "role", e.target.value)} placeholder="Your title" />
                  </Field>
                  <Field label="LOCATION">
                    <input style={inputStyle} value={exp.location} onChange={e => updateExp(exp.id, "location", e.target.value)} placeholder="City" />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Field label="TENURE (e.g. Jun 2022 – Present)">
                    <input style={inputStyle} value={exp.tenure} onChange={e => updateExp(exp.id, "tenure", e.target.value)} placeholder="Mar 2022 – Jun 2025" />
                  </Field>
                  <Field label="CURRENT ROLE">
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: "0.75rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={exp.current} onChange={e => updateExp(exp.id, "current", e.target.checked)} />
                      Currently here
                    </label>
                  </Field>
                </div>
                <Field label="BULLETS (one per line — these are your raw material for resume generation)">
                  <textarea style={taStyle} rows={6} value={exp.bullets}
                    onChange={e => updateExp(exp.id, "bullets", e.target.value)}
                    placeholder={"Led concept selection study for South American O&G company...\nBuilt multi-agent AI toolkit: RAG engine, workplan generator, financial modeling...\nDelivered board-level recommendation for multi-billion-dollar capital program..."} />
                </Field>
              </div>
            ))}
            {profile.experience.length === 0 && (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
                NO EXPERIENCE ENTRIES YET — CLICK "+ ADD ROLE" TO START
              </div>
            )}
          </div>
        )}

        {/* ── SKILLS ── */}
        {tab === "SKILLS" && (
          <div style={{ maxWidth: 800 }}>
            <p style={{ color: "var(--text-tertiary)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)", marginBottom: 20 }}>
              Each category holds a comma-separated list of skills. These feed directly into AI-generated resumes and cover letters.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary" style={btnStyle} onClick={addSkillCategory}>+ ADD CATEGORY</button>
            </div>
            {Object.entries(profile.skills).map(([cat, skills]) => (
              <div key={cat} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                  <Field label="CATEGORY NAME">
                    <input style={{ ...inputStyle, width: 240 }} value={cat}
                      onBlur={e => { if (e.target.value !== cat) renameCategory(cat, e.target.value); }}
                      onChange={() => {}} // controlled via onBlur
                      key={cat} defaultValue={cat} />
                  </Field>
                  <button className="btn" style={{ ...dangerBtnStyle, marginTop: 20 }} onClick={() => removeSkillCategory(cat)}>REMOVE</button>
                </div>
                <Field label="SKILLS (comma-separated)">
                  <textarea style={taStyle} rows={3} value={skills}
                    onChange={e => updateSkillCategory(cat, e.target.value)}
                    placeholder="Python, TypeScript, LangChain, RAG..." />
                </Field>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {skills.split(",").map(s => s.trim()).filter(Boolean).map(skill => (
                    <span key={skill} style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)", borderRadius: 2, padding: "2px 8px", fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PROJECTS ── */}
        {tab === "PROJECTS" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>
                Describe each project by capability and outcome — not by internal name. These feed into resume bullets and cover letter proof points.
              </p>
              <button className="btn btn-primary" style={btnStyle} onClick={addProj}>+ ADD PROJECT</button>
            </div>
            {profile.projects.map((proj, idx) => (
              <div key={proj.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase" }}>
                    {proj.name || `PROJECT ${idx + 1}`}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" style={btnStyle} onClick={() => moveProj(proj.id, -1)} disabled={idx === 0}>↑</button>
                    <button className="btn" style={btnStyle} onClick={() => moveProj(proj.id, 1)} disabled={idx === profile.projects.length - 1}>↓</button>
                    <button className="btn" style={dangerBtnStyle} onClick={() => removeProj(proj.id)}>REMOVE</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Field label="PROJECT NAME (internal reference)">
                    <input style={inputStyle} value={proj.name} onChange={e => updateProj(proj.id, "name", e.target.value)} placeholder="AI Financial Modeling Engine" />
                  </Field>
                  <Field label="REPO URL (optional)">
                    <input style={inputStyle} value={proj.repoUrl ?? ""} onChange={e => updateProj(proj.id, "repoUrl", e.target.value)} placeholder="github.com/you/repo" />
                  </Field>
                </div>
                <Field label="DESCRIPTION (capability framing — how you'd describe it in a cover letter)">
                  <textarea style={taStyle} rows={3} value={proj.description} onChange={e => updateProj(proj.id, "description", e.target.value)}
                    placeholder="RAG-based document intelligence engine for natural language retrieval across large contract libraries..." />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="TECH STACK (comma-separated)">
                    <input style={inputStyle} value={proj.stack} onChange={e => updateProj(proj.id, "stack", e.target.value)} placeholder="Python, LangChain, Streamlit" />
                  </Field>
                  <Field label="OUTCOMES / IMPACT">
                    <input style={inputStyle} value={proj.outcomes} onChange={e => updateProj(proj.id, "outcomes", e.target.value)} placeholder="Deployed in live consulting engagements" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── EDUCATION ── */}
        {tab === "EDUCATION" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary" style={btnStyle} onClick={addEdu}>+ ADD EDUCATION</button>
            </div>
            {profile.education.map(edu => (
              <div key={edu.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase" }}>
                    {edu.institution || "INSTITUTION"}
                  </div>
                  <button className="btn" style={dangerBtnStyle} onClick={() => removeEdu(edu.id)}>REMOVE</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Field label="INSTITUTION">
                    <input style={inputStyle} value={edu.institution} onChange={e => updateEdu(edu.id, "institution", e.target.value)} />
                  </Field>
                  <Field label="DEGREE">
                    <input style={inputStyle} value={edu.degree} onChange={e => updateEdu(edu.id, "degree", e.target.value)} placeholder="B.Tech" />
                  </Field>
                  <Field label="FIELD">
                    <input style={inputStyle} value={edu.field} onChange={e => updateEdu(edu.id, "field", e.target.value)} placeholder="Mechanical Engineering" />
                  </Field>
                  <Field label="GPA">
                    <input style={inputStyle} value={edu.gpa ?? ""} onChange={e => updateEdu(edu.id, "gpa", e.target.value)} placeholder="8.0 / 10.0" />
                  </Field>
                </div>
                <Field label="YEARS">
                  <input style={{ ...inputStyle, maxWidth: 200 }} value={edu.years} onChange={e => updateEdu(edu.id, "years", e.target.value)} placeholder="2012 – 2016" />
                </Field>
                <Field label="ACHIEVEMENTS / NOTABLE WORK (one per line)">
                  <textarea style={taStyle} rows={4} value={edu.achievements ?? ""}
                    onChange={e => updateEdu(edu.id, "achievements", e.target.value)}
                    placeholder={"ADCS Subsystem Head, Parikshit Satellite Team (ISRO-guided)\nPresented at IEEE Aerospace Conference, Big Sky, Montana"} />
                </Field>
              </div>
            ))}
          </div>
        )}

        {/* ── CERTIFICATIONS ── */}
        {tab === "CERTIFICATIONS" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary" style={btnStyle} onClick={addCert}>+ ADD CERTIFICATION</button>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr 1fr 1fr auto", gap: 0, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                {["NAME", "ISSUER", "DATE", "RELEVANCE", ""].map(h => <span key={h} className="label" style={{ fontSize: "0.625rem" }}>{h}</span>)}
              </div>
              {profile.certifications.map(cert => (
                <div key={cert.id} style={{ display: "grid", gridTemplateColumns: "3fr 2fr 1fr 1fr auto", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--border-light)", alignItems: "center" }}>
                  <input style={{ ...inputStyle, padding: "4px 8px", fontSize: "0.75rem" }} value={cert.name} onChange={e => updateCert(cert.id, "name", e.target.value)} placeholder="Certification name" />
                  <input style={{ ...inputStyle, padding: "4px 8px", fontSize: "0.75rem" }} value={cert.issuer} onChange={e => updateCert(cert.id, "issuer", e.target.value)} placeholder="Issuer" />
                  <input style={{ ...inputStyle, padding: "4px 8px", fontSize: "0.75rem" }} value={cert.date} onChange={e => updateCert(cert.id, "date", e.target.value)} placeholder="2024" />
                  <input style={{ ...inputStyle, padding: "4px 8px", fontSize: "0.75rem" }} value={cert.relevance ?? ""} onChange={e => updateCert(cert.id, "relevance", e.target.value)} placeholder="Role types" />
                  <button className="btn" style={{ ...dangerBtnStyle, padding: "4px 8px" }} onClick={() => removeCert(cert.id)}>×</button>
                </div>
              ))}
              {profile.certifications.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                  NO CERTIFICATIONS YET
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PUBLICATIONS ── */}
        {tab === "PUBLICATIONS" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary" style={btnStyle} onClick={addPub}>+ ADD PUBLICATION</button>
            </div>
            {profile.publications.map(pub => (
              <div key={pub.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <Field label="PAPER TITLE">
                      <input style={inputStyle} value={pub.title} onChange={e => updatePub(pub.id, "title", e.target.value)} placeholder="Full paper title" />
                    </Field>
                  </div>
                  <button className="btn" style={{ ...dangerBtnStyle, marginTop: 20 }} onClick={() => removePub(pub.id)}>REMOVE</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12 }}>
                  <Field label="JOURNAL / CONFERENCE">
                    <input style={inputStyle} value={pub.publication} onChange={e => updatePub(pub.id, "publication", e.target.value)} placeholder="IEEE" />
                  </Field>
                  <Field label="YEAR">
                    <input style={inputStyle} value={pub.year} onChange={e => updatePub(pub.id, "year", e.target.value)} placeholder="2016" />
                  </Field>
                  <Field label="URL (optional)">
                    <input style={inputStyle} value={pub.url ?? ""} onChange={e => updatePub(pub.id, "url", e.target.value)} placeholder="https://ieeexplore.ieee.org/..." />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── VOICE ── */}
        {tab === "VOICE" && (
          <div style={{ maxWidth: 800 }}>
            <p style={{ color: "var(--text-tertiary)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)", marginBottom: 20, lineHeight: 1.6 }}>
              This is read by the AI when generating your cover letters, resume summaries, and outreach. Be specific about your writing style, things to avoid, and tone calibration per audience.
            </p>
            <Field label="VOICE & TONE NOTES (free-form — the AI reads this verbatim)">
              <textarea style={taStyle} rows={20} value={profile.voiceNotes}
                onChange={e => set("voiceNotes", e.target.value)}
                placeholder={"WRITING STYLE: Direct, specific, non-corporate.\n\nOPENING PATTERNS:\n- \"[X] years of [domain] work across [companies] have been spent doing exactly what this role asks for...\"\n\nNEVER USE: em dashes, 'excited to apply', 'passionate about', 'synergy'\n\nFIRST PRINCIPLES: Woven naturally as 'approaches every engagement from first principles...'"} />
            </Field>
          </div>
        )}

        {/* Bottom save bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          {(saved || autoSaved) && <span style={{ color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", alignSelf: "center" }}>{autoSaved ? "AUTO-SAVED" : "SAVED"}</span>}
          <button className="btn" onClick={() => router.push("/profile/")}>CANCEL</button>
          <button className="btn" onClick={handleSave}>SAVE DRAFT</button>
          <button className="btn btn-primary" onClick={handleSaveAndExit}>SAVE & VIEW PROFILE</button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
