"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveProfile, getSeedProfile, Profile, RoleType, ROLE_TYPES } from "../../lib/profile";

const RAUNAQ_EMAIL = "raunaq1509@gmail.com";

const STEPS = ["Role", "Identity", "Targets", "Narrative", "Compensation", "CV & Skills"];

type RoleConfig = {
  skillCategories: { cat: string; placeholder: string }[];
  superpowerPlaceholder: string;
  exitStoryPlaceholder: string;
  targetRolePlaceholder: string;
  headlinePlaceholder: string;
};

const ROLE_CONFIGS: Record<RoleType, RoleConfig> = {
  "strategy-consulting": {
    skillCategories: [
      { cat: "Strategy", placeholder: "GTM, market entry, M&A, due diligence, OKRs" },
      { cat: "Frameworks", placeholder: "Porter's 5 Forces, MECE, hypothesis-driven analysis" },
      { cat: "Tools", placeholder: "Excel modeling, PowerPoint, SQL, Tableau" },
      { cat: "Industries", placeholder: "Fintech, SaaS, energy, consumer" },
    ],
    superpowerPlaceholder: "- Structure ambiguous problems from first principles\n- Build executive-ready decks under time pressure\n- Translate technical concepts for boardrooms",
    exitStoryPlaceholder: "Moving from project-based consulting to building inside a single company where I can own outcomes, not just recommendations.",
    targetRolePlaceholder: "Engagement Manager at MBB, Senior Strategy roles at top tech, Chief of Staff at scale-ups",
    headlinePlaceholder: "Strategy consultant with 7+ years across X, Y, Z",
  },
  "ai-tech": {
    skillCategories: [
      { cat: "AI / ML", placeholder: "LLMs, RAG, multi-agent, fine-tuning, evals" },
      { cat: "Programming", placeholder: "Python, TypeScript, Rust, Go" },
      { cat: "Frameworks", placeholder: "PyTorch, LangChain, vLLM, Anthropic SDK" },
      { cat: "Domain", placeholder: "Frontier models, applied research, agentic workflows" },
    ],
    superpowerPlaceholder: "- Ship agentic AI systems end-to-end\n- Bridge research and production engineering\n- Evaluate and de-risk model behavior",
    exitStoryPlaceholder: "Looking to work on frontier AI problems with direct production impact, ideally at a lab or AI-native company.",
    targetRolePlaceholder: "Forward Deployed Engineer, Applied AI, ML Engineer at Anthropic / OpenAI / scale-ups",
    headlinePlaceholder: "AI engineer building agentic systems in production",
  },
  "product": {
    skillCategories: [
      { cat: "Product", placeholder: "Discovery, roadmapping, OKRs, user research, A/B" },
      { cat: "Analytics", placeholder: "SQL, Amplitude, Mixpanel, growth metrics" },
      { cat: "Design", placeholder: "Figma, prototyping, UX principles" },
      { cat: "Domain", placeholder: "B2B SaaS, marketplaces, fintech, AI products" },
    ],
    superpowerPlaceholder: "- Convert ambiguous user pain into shippable specs\n- Run rigorous experimentation programs\n- Align engineering, design, and GTM",
    exitStoryPlaceholder: "Looking for a higher-stakes product surface where I can own a P&L line and ship with strong eng partners.",
    targetRolePlaceholder: "Senior PM, Group PM, Head of Product at growth-stage companies",
    headlinePlaceholder: "Product manager shipping AI-native B2B products",
  },
  "engineering": {
    skillCategories: [
      { cat: "Languages", placeholder: "TypeScript, Python, Go, Rust, Swift" },
      { cat: "Frameworks", placeholder: "Next.js, React, Node, Django, FastAPI" },
      { cat: "Infrastructure", placeholder: "AWS, Vercel, Postgres, Redis, K8s, CI/CD" },
      { cat: "Domain", placeholder: "Distributed systems, payments, infra, mobile" },
    ],
    superpowerPlaceholder: "- Take fuzzy specs to shipped, instrumented code\n- Design systems that scale without rewrites\n- Mentor and unblock other engineers",
    exitStoryPlaceholder: "Looking for higher technical leverage and cleaner ownership of a domain area.",
    targetRolePlaceholder: "Senior / Staff Engineer, Tech Lead, Founding Engineer at AI infra / dev tools companies",
    headlinePlaceholder: "Senior software engineer with deep experience in distributed systems",
  },
  "design": {
    skillCategories: [
      { cat: "Design", placeholder: "Brand, UI, UX, motion, interaction, prototyping" },
      { cat: "Tools", placeholder: "Figma, Adobe CS, Sketch, Framer, Webflow" },
      { cat: "Specialization", placeholder: "Brand systems, design systems, illustration, type" },
      { cat: "Industry", placeholder: "Consumer, SaaS, agency, fintech, fashion" },
    ],
    superpowerPlaceholder: "- Define visual systems from a brand brief\n- Bridge product design and brand expression\n- Ship craft-driven work fast",
    exitStoryPlaceholder: "Ready to own brand and product design at a smaller, more craft-driven company.",
    targetRolePlaceholder: "Senior Brand Designer, Design Lead, Head of Design at consumer brands or AI startups",
    headlinePlaceholder: "Senior brand and product designer with 7+ years in consumer SaaS",
  },
  "marketing": {
    skillCategories: [
      { cat: "Channels", placeholder: "Paid social, SEO, content, email, partnerships, lifecycle" },
      { cat: "Tools", placeholder: "HubSpot, Marketo, Mixpanel, Webflow, Customer.io" },
      { cat: "Specialization", placeholder: "Demand gen, brand, growth, product marketing" },
      { cat: "Industry", placeholder: "B2B SaaS, fintech, marketplaces, DTC" },
    ],
    superpowerPlaceholder: "- Build full-funnel programs from scratch\n- Find and scale a single high-leverage channel\n- Translate product into category-defining narratives",
    exitStoryPlaceholder: "Looking to own marketing as a function at a category-defining company.",
    targetRolePlaceholder: "Head of Marketing, Sr Growth, Sr PMM at AI-native B2B / fintech / SaaS",
    headlinePlaceholder: "Growth marketing leader with track record of scaling B2B SaaS",
  },
  "sales": {
    skillCategories: [
      { cat: "Markets", placeholder: "SMB, mid-market, enterprise, ABM" },
      { cat: "Tools", placeholder: "Salesforce, HubSpot, Outreach, Gong, LinkedIn Nav" },
      { cat: "Methodology", placeholder: "MEDDIC, Sandler, Challenger, value selling" },
      { cat: "Industry", placeholder: "B2B SaaS, fintech, infra, AI tools" },
    ],
    superpowerPlaceholder: "- Build and run end-to-end enterprise cycles\n- Open net-new logos in greenfield territories\n- Translate technical products into business value",
    exitStoryPlaceholder: "Looking to be in the room early at an AI-native company with a real product-market fit signal.",
    targetRolePlaceholder: "Sr AE, Strategic AE, Head of Sales, GTM Lead at AI infra / dev tools",
    headlinePlaceholder: "Enterprise AE with 7+ years closing B2B SaaS deals",
  },
  "finance": {
    skillCategories: [
      { cat: "Specialization", placeholder: "FP&A, IB, PE, VC, corporate dev, treasury" },
      { cat: "Tools", placeholder: "Excel, SQL, Tableau, Bloomberg, Capital IQ" },
      { cat: "Asset Class / Sector", placeholder: "Tech, healthcare, infra, real estate, credit" },
      { cat: "Domain", placeholder: "M&A, LBO, growth equity, public markets" },
    ],
    superpowerPlaceholder: "- Build clean models under time pressure\n- Source and underwrite deals end-to-end\n- Translate financials into operating decisions",
    exitStoryPlaceholder: "Moving from advisory / banking into operator-side finance at a growth-stage company.",
    targetRolePlaceholder: "VP Finance, Head of Strategic Finance, Corp Dev Lead at growth-stage tech",
    headlinePlaceholder: "Finance professional with 7+ years across IB and growth equity",
  },
  "operations": {
    skillCategories: [
      { cat: "Operations", placeholder: "Supply chain, expansion, vendor mgmt, process design" },
      { cat: "Tools", placeholder: "SQL, Looker, NetSuite, Notion, Asana" },
      { cat: "Specialization", placeholder: "Biz ops, RevOps, supply chain, customer ops" },
      { cat: "Industry", placeholder: "Marketplaces, e-commerce, logistics, SaaS" },
    ],
    superpowerPlaceholder: "- Scale fragile workflows into repeatable systems\n- Turn ambiguous metrics into actionable dashboards\n- Bridge product and ops",
    exitStoryPlaceholder: "Looking for a higher-leverage ops role where I can own a function end-to-end.",
    targetRolePlaceholder: "Head of Ops, BizOps Lead, COO at growth-stage marketplaces / SaaS",
    headlinePlaceholder: "Operator with 7+ years scaling marketplace operations",
  },
  "data": {
    skillCategories: [
      { cat: "Languages", placeholder: "Python, R, SQL, Scala" },
      { cat: "Tools", placeholder: "dbt, Snowflake, BigQuery, Looker, Tableau, Airflow" },
      { cat: "Specialization", placeholder: "Data science, analytics engineering, ML, BI" },
      { cat: "Domain", placeholder: "Product analytics, growth, fraud, recommendations" },
    ],
    superpowerPlaceholder: "- Turn raw data into clear product decisions\n- Build self-serve analytics that actually get used\n- Ship ML features into production",
    exitStoryPlaceholder: "Looking for a more central data role where my work directly drives roadmap.",
    targetRolePlaceholder: "Sr Data Scientist, Analytics Lead, Head of Data at growth-stage tech",
    headlinePlaceholder: "Data scientist with 7+ years driving product decisions through analytics",
  },
  "research": {
    skillCategories: [
      { cat: "Methods", placeholder: "Quantitative, qualitative, ethnography, experimental" },
      { cat: "Tools", placeholder: "Python, R, statistical software, qualitative software" },
      { cat: "Specialization", placeholder: "User research, market research, applied research" },
      { cat: "Domain", placeholder: "Behavioral, AI safety, HCI, market dynamics" },
    ],
    superpowerPlaceholder: "- Frame research questions that change product strategy\n- Run rigorous studies under tight timelines\n- Translate findings into stakeholder action",
    exitStoryPlaceholder: "Looking for a research role with closer ties to product and a faster feedback loop.",
    targetRolePlaceholder: "Sr Researcher, Research Lead, Head of Research at AI labs / consumer tech",
    headlinePlaceholder: "Research lead with 7+ years across applied AI and product research",
  },
  "creative": {
    skillCategories: [
      { cat: "Mediums", placeholder: "Long-form, video, podcast, social, editorial" },
      { cat: "Tools", placeholder: "Premiere, After Effects, Figma, CMS platforms" },
      { cat: "Specialization", placeholder: "Brand storytelling, content strategy, creative direction" },
      { cat: "Industry", placeholder: "Tech, fashion, media, consumer brands" },
    ],
    superpowerPlaceholder: "- Define a brand voice and stick to it across surfaces\n- Build content systems that scale without losing craft\n- Translate strategy into stories",
    exitStoryPlaceholder: "Looking for a brand or content lead role with full creative ownership.",
    targetRolePlaceholder: "Head of Brand, Creative Director, Editorial Lead at consumer / AI brands",
    headlinePlaceholder: "Creative director with 7+ years building brand voice and content",
  },
  "other": {
    skillCategories: [
      { cat: "Core Skills", placeholder: "Your 4-6 strongest skills" },
      { cat: "Tools", placeholder: "Tools and software you use daily" },
      { cat: "Specialization", placeholder: "What you uniquely combine" },
      { cat: "Domain", placeholder: "Industries or contexts where you've operated" },
    ],
    superpowerPlaceholder: "- 3-5 things you do better than 95% of people\n- One per line",
    exitStoryPlaceholder: "Why are you exploring? What kind of role / company / team are you looking for?",
    targetRolePlaceholder: "Describe the kinds of roles you want",
    headlinePlaceholder: "One line — your strongest professional angle",
  },
};

const blankProfile = (): Profile => ({
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
  roleType: undefined,
  experience: [],
  education: [],
  skills: {},
  projects: [],
  publications: [],
  certifications: [],
  voiceNotes: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(blankProfile());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [cvText, setCvText] = useState("");
  const [resumeFiles, setResumeFiles] = useState<string[]>([]);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const resumeInputRef = useRef<HTMLInputElement>(null);

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

  const handleResumeFiles = async (files: File[]) => {
    setUploadError("");
    if (files.length === 0) return;
    setUploadingResume(true);

    try {
      let combined = cvText.trim();
      const newNames: string[] = [];

      for (const f of files) {
        newNames.push(f.name);
        if (f.type === "text/plain" || f.name.endsWith(".txt") || f.name.endsWith(".md")) {
          const t = await f.text();
          combined = combined ? combined + "\n\n--- " + f.name + " ---\n\n" + t : t;
        } else if (f.type.startsWith("image/")) {
          const base64 = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = e => res(((e.target?.result as string) ?? "").split(",")[1] ?? "");
            r.onerror = () => rej(new Error("read failed"));
            r.readAsDataURL(f);
          });
          const resp = await fetch("/api/extract-resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64, mimeType: f.type }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || "extraction failed");
          combined = combined ? combined + "\n\n--- " + f.name + " ---\n\n" + data.text : data.text;
        } else {
          throw new Error(`Unsupported file: ${f.name}. Use .txt, .md, or images (PNG, JPG). PDFs need to be screenshotted first.`);
        }
      }
      setCvText(combined);
      setResumeFiles(prev => [...prev, ...newNames]);
    } catch (e: any) {
      setUploadError(e.message || "Upload failed");
    } finally {
      setUploadingResume(false);
    }
  };

  const handleFinish = () => {
    const now = new Date().toISOString();
    const final: Profile = {
      ...profile,
      voiceNotes: cvText
        ? `CV raw text:\n${cvText.slice(0, 8000)}`
        : profile.voiceNotes,
      createdAt: now,
      updatedAt: now,
    };
    saveProfile(final);
    router.push("/");
  };

  const canNext = () => {
    if (step === 0) return !!profile.roleType;
    if (step === 1) return profile.name.trim() && profile.email.trim();
    if (step === 2) return profile.locationsOpenTo.trim();
    return true;
  };

  const cfg = profile.roleType ? ROLE_CONFIGS[profile.roleType] : ROLE_CONFIGS["other"];

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

        {isRaunaq && (
          <div style={{ background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.3)", borderRadius: "var(--radius)", padding: 20, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-primary)", marginBottom: 4 }}>Welcome back, Raunaq.</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)" }}>Load your saved profile, or start fresh below.</div>
            </div>
            <button className="btn btn-primary" onClick={handleLoadSeed} style={{ whiteSpace: "nowrap", padding: "8px 16px" }}>
              LOAD MY PROFILE
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent)" : "var(--border)" }} />
          ))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-tertiary)", marginBottom: 24, textTransform: "uppercase" }}>
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 32 }}>

          {/* Step 0: Role */}
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 4 }}>What kind of role are you in?</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                We'll tailor the rest of the questions to your background. You can change this later.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ROLE_TYPES.map(r => {
                  const sel = profile.roleType === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => up("roleType", r.id)}
                      style={{
                        textAlign: "left",
                        background: sel ? "rgba(255,165,0,0.06)" : "var(--bg-primary)",
                        border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "var(--radius)",
                        padding: "12px 14px",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${sel ? "var(--accent)" : "var(--border)"}`, background: sel ? "var(--accent)" : "transparent", flexShrink: 0 }} />
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", fontWeight: 500 }}>{r.label}</div>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginTop: 4, marginLeft: 22 }}>{r.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 1: Identity */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Who are you?</div>
              {[
                { label: "Full Name *", field: "name" as const, placeholder: "Your name" },
                { label: "Email *", field: "email" as const, placeholder: "you@example.com" },
                { label: "Phone", field: "phone" as const, placeholder: "+91-9999999999" },
                { label: "Current Location", field: "location" as const, placeholder: "City, Country" },
                { label: "LinkedIn URL", field: "linkedin" as const, placeholder: "linkedin.com/in/yourname" },
                { label: "Portfolio / Website URL", field: "portfolio" as const, placeholder: "yoursite.com" },
                { label: "GitHub URL (optional)", field: "github" as const, placeholder: "github.com/yourname" },
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

          {/* Step 2: Targets */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>What roles are you targeting?</div>
              <div>
                <label style={labelStyle}>Locations Open To *</label>
                <input type="text" value={profile.locationsOpenTo} onChange={e => up("locationsOpenTo", e.target.value)} placeholder="e.g. London, Berlin, Remote" style={inputStyle} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Comma-separated cities or regions.</div>
              </div>
              <div>
                <label style={labelStyle}>Target Role Types</label>
                <textarea
                  rows={4}
                  value={profile.voiceNotes}
                  onChange={e => up("voiceNotes", e.target.value)}
                  placeholder={cfg.targetRolePlaceholder}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Free text. The AI uses this to score fit.</div>
              </div>
            </div>
          )}

          {/* Step 3: Narrative */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Your professional narrative</div>
              <div>
                <label style={labelStyle}>Professional Headline</label>
                <input type="text" value={profile.headline} onChange={e => up("headline", e.target.value)} placeholder={cfg.headlinePlaceholder} style={inputStyle} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>One line. Lead with your strongest angle. No em dashes.</div>
              </div>
              <div>
                <label style={labelStyle}>Your Superpowers (3-5 bullets)</label>
                <textarea
                  rows={5}
                  value={typeof profile.skills["Superpowers"] === "string" ? profile.skills["Superpowers"] : ""}
                  onChange={e => up("skills", { ...profile.skills, "Superpowers": e.target.value })}
                  placeholder={cfg.superpowerPlaceholder}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Exit Story (why exploring new roles)</label>
                <textarea
                  rows={3}
                  value={typeof profile.skills["ExitStory"] === "string" ? profile.skills["ExitStory"] : ""}
                  onChange={e => up("skills", { ...profile.skills, "ExitStory": e.target.value })}
                  placeholder={cfg.exitStoryPlaceholder}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>Used in cover letters and HM outreach. Keep it positive and forward-looking.</div>
              </div>
            </div>
          )}

          {/* Step 4: Compensation */}
          {step === 4 && (
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

          {/* Step 5: CV & Skills */}
          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: 8 }}>Your CV, portfolio, and skills</div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Upload Resume / Portfolio</label>
                  <button
                    type="button"
                    onClick={() => resumeInputRef.current?.click()}
                    disabled={uploadingResume}
                    className="btn"
                    style={{ fontSize: "0.625rem", padding: "4px 10px" }}
                  >
                    {uploadingResume ? "EXTRACTING..." : "ADD FILES"}
                  </button>
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept=".txt,.md,image/*"
                    multiple
                    onChange={e => { handleResumeFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
                    style={{ display: "none" }}
                  />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginBottom: 8 }}>
                  Upload .txt, .md, or images (resume/portfolio screenshots, photos of physical CV). Multiple files OK. AI extracts text automatically.
                </div>
                {resumeFiles.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {resumeFiles.map((n, i) => (
                      <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--accent)", background: "rgba(255,165,0,0.08)", padding: "3px 8px", borderRadius: 3 }}>{n}</span>
                    ))}
                  </div>
                )}
                {uploadError && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--error)", marginBottom: 8 }}>{uploadError}</div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Resume Text {cvText && <span style={{ color: "var(--success)", textTransform: "none" }}>· {cvText.length} chars</span>}</label>
                <textarea
                  rows={10}
                  value={cvText}
                  onChange={e => setCvText(e.target.value)}
                  placeholder="Paste your full CV here, or upload above to auto-extract."
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-tertiary)", marginTop: 4 }}>You can refine in Profile → Edit later.</div>
              </div>

              <div>
                <label style={labelStyle}>Key Skills (comma-separated per category)</label>
                {cfg.skillCategories.map(({ cat, placeholder }) => (
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
