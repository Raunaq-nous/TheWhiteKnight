"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveProfile, getSeedProfile, Profile } from "../../lib/profile";

const RAUNAQ_EMAIL = "raunaq1509@gmail.com";

const STEPS = ["Identity", "Targets", "Narrative", "Compensation", "CV & Skills"];

const BLANK_PROFILE: Profile = {
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  locationsOpenTo: "",
  linkedin: "",
  github: "",
  portfolio: "",
  yearsOfExperience: "",
  experience: [],
  education: [],
  skills: {
    "AI & ML": "",
    "Strategy & Consulting": "",
    "Technical": "",
    "Domain": "",
  },
  projects: [],
  publications: [],
  certifications: [],
  voiceNotes: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(BLANK_PROFILE);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [cvText, setCvText] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.email) {
        setUserEmail(d.user.email);
        setProfile(p => ({ ...p, email: d.user.email }));
      }
    }).catch(() => {});
  }, []);

  const isRaunaq = userEmail === RAUNAQ_EMAIL;

  const handleLoadSeed = () => {
    saveProfile(getSeedProfile());
    router.push("/");
  };

  const up = (field: keyof Profile, value: any) => setProfile(p => ({ ...p, [field]: value }));

  const handleFinish = () => {
    const now = new Date().toISOString();
    const final: Profile = {
      ...profile,
      voiceNotes: cvText
        ? `CV raw text:\n${cvText.slice(0, 3000)}`
        : profile.voiceNotes,
      createdAt: now,
      updatedAt: now,
    };
    saveProfile(final);
    router.push("/");
  };

  const canNext = () => {
    if (step === 0) return profile.name.trim() && profile.email.trim();
    if (step === 1) return profile.locationsOpenTo.trim();
    return true;
  };

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: "var(--bg-primary)",
    border: "1px solid var(--border)", color: "var(--text-primary)",
    fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderRadius: "var(--radius)",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)",
    textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em", marginBottom: 4 }}>
            CAREEROS
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
            Set up your profile
          </div>
        </div>

        {/* Auto-load for Raunaq */}
        {isRaunaq && (
          <div style={{ background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.3)", borderRadius: "var(--radius)", padding: 20, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-primary)", marginBottom: 4 }}>Welcome back, Raunaq.</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)" }}>Your profile is already saved. Load it instantly.</div>
            </div>
            <button className="btn btn-primary" onClick={handleLoadSeed} style={{ whiteSpace: "nowrap", padding: "8px 16px" }}>
              LOAD MY PROFILE
            </button>
          </div>
        )}

        {/* Step progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent)" : "var(--border)" }} />
          ))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-tertiary)", marginBottom: 24, textTransform: "uppercase" }}>
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32 }}>

          {/* Step 0: Identity */}
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Who are you?</div>
              {[
                { label: "Full Name *", field: "name" as const, placeholder: "Raunaq Rakesh" },
                { label: "Email *", field: "email" as const, placeholder: "you@example.com" },
                { label: "Phone", field: "phone" as const, placeholder: "+91-9999999999" },
                { label: "Current Location", field: "location" as const, placeholder: "Gurgaon, India" },
                { label: "LinkedIn URL", field: "linkedin" as const, placeholder: "linkedin.com/in/yourname" },
                { label: "GitHub URL", field: "github" as const, placeholder: "github.com/yourname" },
                { label: "Years of Experience", field: "yearsOfExperience" as const, placeholder: "7" },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type="text"
                    value={(profile[field] as string) || ""}
                    onChange={e => up(field, e.target.value)}
                    placeholder={placeholder}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Targets */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>What roles are you targeting?</div>
              <div>
                <label style={labelStyle}>Locations Open To *</label>
                <input type="text" value={profile.locationsOpenTo} onChange={e => up("locationsOpenTo", e.target.value)} placeholder="Mumbai, Dubai, Remote" style={inputStyle} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Comma-separated cities or regions</div>
              </div>
              <div>
                <label style={labelStyle}>Target Role Types</label>
                <textarea
                  rows={4}
                  value={profile.voiceNotes}
                  onChange={e => up("voiceNotes", e.target.value)}
                  placeholder="e.g. AI Product Manager at frontier labs, Chief of Staff at scale-ups, Strategy roles at MBB..."
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Free text — describe the kinds of roles you want. The AI uses this to score fit.</div>
              </div>
            </div>
          )}

          {/* Step 2: Narrative */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Your professional narrative</div>
              <div>
                <label style={labelStyle}>Professional Headline</label>
                <input type="text" value={profile.headline} onChange={e => up("headline", e.target.value)} placeholder="Strategy consultant and AI builder — 7+ years across..." style={inputStyle} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>One line. Lead with your strongest angle. No em dashes.</div>
              </div>
              <div>
                <label style={labelStyle}>Your Superpowers (3-5 bullets)</label>
                <textarea
                  rows={5}
                  value={typeof profile.skills["Superpowers"] === "string" ? profile.skills["Superpowers"] : ""}
                  onChange={e => up("skills", { ...profile.skills, "Superpowers": e.target.value })}
                  placeholder="- Build and ship agentic AI systems into real client engagements&#10;- First-principles thinker who structures ambiguous problems from scratch&#10;- Bridge between technical AI teams and executive stakeholders"
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Exit Story (why leaving current role)</label>
                <textarea
                  rows={3}
                  value={typeof profile.skills["ExitStory"] === "string" ? profile.skills["ExitStory"] : ""}
                  onChange={e => up("skills", { ...profile.skills, "ExitStory": e.target.value })}
                  placeholder="e.g. Transitioning from founder mode to a scaled operator role where I can apply AI-native methods at a company with distribution..."
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Used in cover letters and HM outreach. Keep it positive and forward-looking.</div>
              </div>
            </div>
          )}

          {/* Step 3: Compensation */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Compensation and work preferences</div>
              <div>
                <label style={labelStyle}>Target Compensation</label>
                <input type="text" value={typeof profile.skills["CompTarget"] === "string" ? profile.skills["CompTarget"] : ""} onChange={e => up("skills", { ...profile.skills, "CompTarget": e.target.value })} placeholder="e.g. INR 80L+ / USD 120K+ / AED 40K+ monthly" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Compensation Floor (minimum to consider)</label>
                <input type="text" value={typeof profile.skills["CompFloor"] === "string" ? profile.skills["CompFloor"] : ""} onChange={e => up("skills", { ...profile.skills, "CompFloor": e.target.value })} placeholder="e.g. INR 60L / USD 90K" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Remote Preference</label>
                <select
                  value={typeof profile.skills["Remote"] === "string" ? profile.skills["Remote"] : ""}
                  onChange={e => up("skills", { ...profile.skills, "Remote": e.target.value })}
                  style={{ ...inputStyle }}
                >
                  <option value="">Select...</option>
                  <option value="remote-only">Remote only</option>
                  <option value="remote-first">Remote-first preferred</option>
                  <option value="hybrid">Hybrid OK</option>
                  <option value="onsite">Onsite OK</option>
                  <option value="flexible">Flexible / depends on role</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 4: CV & Skills */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Your CV and skills</div>
              <div>
                <label style={labelStyle}>Paste your CV / Resume text</label>
                <textarea
                  rows={10}
                  value={cvText}
                  onChange={e => setCvText(e.target.value)}
                  placeholder="Paste your full CV here. The AI will use this to score JD fit and generate tailored resumes..."
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Plain text works best. You can refine in Profile → Edit later.</div>
              </div>
              <div>
                <label style={labelStyle}>Key Skills (comma-separated per category)</label>
                {[
                  { cat: "AI & ML", placeholder: "LLMs, RAG, multi-agent systems, prompt engineering, fine-tuning" },
                  { cat: "Strategy & Consulting", placeholder: "MBB frameworks, due diligence, GTM strategy, stakeholder management" },
                  { cat: "Technical", placeholder: "Python, TypeScript, Next.js, Postgres, Vercel, Git" },
                  { cat: "Domain", placeholder: "Fintech, SaaS, AI-native products, growth-stage startups" },
                ].map(({ cat, placeholder }) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>{cat}</label>
                    <input
                      type="text"
                      value={typeof profile.skills[cat] === "string" ? profile.skills[cat] : ""}
                      onChange={e => up("skills", { ...profile.skills, [cat]: e.target.value })}
                      placeholder={placeholder}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 12 }}>
          {step > 0 ? (
            <button className="btn" onClick={() => setStep(s => s - 1)} style={{ padding: "10px 20px" }}>BACK</button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()} style={{ padding: "10px 24px" }}>
              NEXT
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} style={{ padding: "10px 24px" }}>
              FINISH — ENTER CAREEROS
            </button>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-tertiary)" }}>
          You can edit everything in Profile → Edit later
        </div>
      </div>
    </div>
  );
}
