"use client";

// The signed-out experience: a scroll story told by one code-built brain.
// The canvas stays fixed behind the page; each section declares the state
// the brain should be in (code -> network -> brain -> intelligence), and
// scrolling interpolates between them. Sign-in stays in the hero.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CodeBrain from "../code-brain";
import { Logo, ThemeToggle } from "../components";

type BrainState = { phase: number; focusX: number; focusY: number; scale: number; reach: number; labels: "none" | "hover" | "all" };

type SectionDef = {
  id: string;
  desktop: BrainState;
  mobile: BrainState;
  // Optional within-section progression (0..1 scroll progress -> phase).
  progress?: (p: number) => Partial<BrainState>;
};

const SECTIONS: SectionDef[] = [
  { id: "hero", desktop: { phase: 2.15, focusX: 0.68, focusY: 0.5, scale: 0.4, reach: 0.65, labels: "none" }, mobile: { phase: 2, focusX: 0.5, focusY: 0.3, scale: 0.42, reach: 0.4, labels: "none" } },
  { id: "code", desktop: { phase: 0, focusX: 0.6, focusY: 0.5, scale: 0.4, reach: 0, labels: "none" }, mobile: { phase: 0, focusX: 0.5, focusY: 0.5, scale: 0.4, reach: 0, labels: "none" } },
  { id: "brain", desktop: { phase: 2.4, focusX: 0.58, focusY: 0.52, scale: 0.38, reach: 0.25, labels: "all" }, mobile: { phase: 2.4, focusX: 0.5, focusY: 0.58, scale: 0.4, reach: 0.2, labels: "hover" } },
  { id: "process", desktop: { phase: 2.2, focusX: 0.5, focusY: 0.6, scale: 0.2, reach: 1, labels: "none" }, mobile: { phase: 2.2, focusX: 0.5, focusY: 0.55, scale: 0.26, reach: 1, labels: "none" } },
  {
    id: "learns",
    desktop: { phase: 0.2, focusX: 0.62, focusY: 0.5, scale: 0.36, reach: 0.4, labels: "none" },
    mobile: { phase: 0.2, focusX: 0.5, focusY: 0.6, scale: 0.38, reach: 0.3, labels: "none" },
    progress: p => ({ phase: 0.2 + Math.min(1, Math.max(0, (p - 0.1) / 0.75)) * 1.95 }),
  },
  { id: "market", desktop: { phase: 3, focusX: 0.5, focusY: 0.5, scale: 0.17, reach: 1, labels: "none" }, mobile: { phase: 3, focusX: 0.5, focusY: 0.5, scale: 0.22, reach: 1, labels: "none" } },
  { id: "final", desktop: { phase: 3, focusX: 0.5, focusY: 0.44, scale: 0.36, reach: 0.35, labels: "none" }, mobile: { phase: 3, focusX: 0.5, focusY: 0.4, scale: 0.4, reach: 0.3, labels: "none" } },
];

const LEARN_STAGES = ["Fragments", "Connections", "Structure", "Intelligence"];

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".reveal"));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { threshold: 0, rootMargin: "0px 0px -6% 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [brain, setBrain] = useState<BrainState>(SECTIONS[0].desktop);
  const [learnStage, setLearnStage] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);

  useReveal();

  const computeState = useCallback(() => {
    const mobile = window.innerWidth < 820;
    const vh = window.innerHeight;
    const mid = vh * 0.5;
    let state: BrainState = mobile ? SECTIONS[0].mobile : SECTIONS[0].desktop;
    for (let i = 0; i < SECTIONS.length; i++) {
      const el = sectionRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) {
        const def = SECTIONS[i];
        const base = mobile ? def.mobile : def.desktop;
        const p = (mid - r.top) / Math.max(1, r.height);
        state = { ...base, ...(def.progress ? def.progress(p) : {}) };
        if (def.id === "learns") setLearnStage(Math.min(3, Math.max(0, Math.floor(((p - 0.1) / 0.75) * 4))));
        break;
      }
    }
    setBrain(prev => (
      prev.phase === state.phase && prev.focusX === state.focusX && prev.focusY === state.focusY &&
      prev.scale === state.scale && prev.reach === state.reach && prev.labels === state.labels ? prev : state
    ));
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(computeState); };
    computeState();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [computeState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toSignIn = () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 700);
  };

  const ref = (i: number) => (el: HTMLElement | null) => { sectionRefs.current[i] = el; };

  return (
    <div className="landing">
      <div className="landing-canvas" aria-hidden="false">
        <CodeBrain {...brain} />
      </div>
      <div className="landing-veil" />

      <header className="container interactive" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 22, paddingBottom: 22, maxWidth: "none" }}>
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <ThemeToggle />
          <button className="menu-trigger" onClick={toSignIn}>Sign in</button>
        </div>
      </header>

      <main className="landing-content">
        {/* 01 — HERO */}
        <section ref={ref(0)} className="landing-section" style={{ justifyContent: "space-between", paddingTop: 140, paddingBottom: 56 }} aria-labelledby="hero-title">
          <div className="container" style={{ maxWidth: "none" }}>
            <div className="eyebrow reveal">Career operating system / 01</div>
            <h1 id="hero-title" className="display reveal reveal-d1" style={{ marginTop: 28, maxWidth: "10ch" }}>
              Your career, <span className="em">compiled.</span>
            </h1>
          </div>

          <div className="container hero-foot" style={{ maxWidth: "none" }}>
            <form onSubmit={handleSubmit} className="reveal reveal-d2" style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-label="Sign in">
              <div className="label" style={{ color: "var(--text-secondary)" }}>Sign in</div>
              {error && (
                <div role="alert" style={{ borderLeft: "1px solid var(--error)", padding: "4px 0 4px 12px", fontSize: "0.8125rem", color: "var(--error)", fontFamily: "var(--font-mono)" }}>
                  {error}
                </div>
              )}
              <label style={{ display: "block" }}>
                <span className="label" style={{ display: "block" }}>Email</span>
                <input ref={emailRef} className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </label>
              <label style={{ display: "block" }}>
                <span className="label" style={{ display: "block" }}>Password</span>
                <input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
              </label>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 6 }}>
                <button type="submit" disabled={loading} className="btn btn-primary btn-arrow">
                  {loading ? "Signing in" : "Enter CareerOS"}
                </button>
                <Link href="/register" className="label" style={{ textDecoration: "none", color: "var(--text-secondary)" }}>
                  Invite code? <span style={{ color: "var(--text-primary)" }}>Create account</span>
                </Link>
              </div>
            </form>
            <p className="lede reveal reveal-d3">
              CareerOS reads every posting, scores the fit against your real experience, and stages tailored applications.
              Nothing is sent without your approval.
            </p>
          </div>
        </section>

        {/* 02 — CODE */}
        <section ref={ref(1)} className="landing-section" aria-labelledby="code-title">
          <div className="container" style={{ maxWidth: "none" }}>
            <div className="eyebrow reveal">Signal / 02</div>
            <h2 id="code-title" className="display-md reveal reveal-d1" style={{ marginTop: 24, maxWidth: "11ch" }}>
              Every job is written in <span className="em">code.</span>
            </h2>
            <p className="lede reveal reveal-d2" style={{ marginTop: 40 }}>
              Postings become signals.<br />Signals become a score.<br />A score becomes a decision.
            </p>
          </div>
        </section>

        {/* 03 — THE BRAIN */}
        <section ref={ref(2)} className="landing-section" style={{ justifyContent: "flex-start" }} aria-labelledby="brain-title">
          <div className="container" style={{ maxWidth: "none" }}>
            <div className="eyebrow reveal">Profile / 03</div>
            <h2 id="brain-title" className="display-md reveal reveal-d1" style={{ marginTop: 24, maxWidth: "9ch" }}>
              A career made of <span className="em">evidence.</span>
            </h2>
            <p className="lede reveal reveal-d2" style={{ marginTop: 32, maxWidth: "30ch" }}>
              Every line the system writes traces back to something you actually did. Move across the regions to see how it thinks.
            </p>
          </div>
        </section>

        {/* 04 — THE PROCESS */}
        <section ref={ref(3)} className="landing-section" aria-labelledby="process-title">
          <div className="container" style={{ maxWidth: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32, flexWrap: "wrap" }}>
              <div>
                <div className="eyebrow reveal">The process / 04</div>
                <h2 id="process-title" className="display-md reveal reveal-d1" style={{ marginTop: 24 }}>
                  From signal to <span className="em">action.</span>
                </h2>
              </div>
              <ol className="reveal reveal-d2" style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "10px 14px", alignItems: "center", maxWidth: 560 }}>
                {["Signal", "Parse", "Score", "Profile", "Tailor", "Approve", "Act"].map((s, i, a) => (
                  <li key={s} className="flow-label" style={{ color: s === "Approve" ? "var(--champagne)" : undefined }}>
                    {s}{i < a.length - 1 && <i aria-hidden="true">→</i>}
                  </li>
                ))}
              </ol>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: "min(34vh, 320px)", gap: 24 }}>
              <div className="reveal">
                <div className="label" style={{ marginBottom: 14 }}>Inputs</div>
                {["Job postings", "Career portals", "Referrals", "Your intent"].map(s => (
                  <div key={s} className="flow-label" style={{ padding: "7px 0", borderTop: "1px solid var(--border-light)", maxWidth: 220 }}><i>←</i>{s}</div>
                ))}
              </div>
              <div className="reveal reveal-d1" style={{ justifySelf: "end", textAlign: "right" }}>
                <div className="label" style={{ marginBottom: 14 }}>Outputs</div>
                {["Tailored resume", "Cover letter", "Outreach", "Follow-ups", "Interview prep"].map(s => (
                  <div key={s} className="flow-label" style={{ padding: "7px 0", borderTop: "1px solid var(--border-light)", justifyContent: "flex-end", minWidth: 220 }}>{s}<i>→</i></div>
                ))}
              </div>
            </div>
            <p className="label reveal" style={{ marginTop: 40, textAlign: "center", color: "var(--champagne)" }}>
              Human approval gate · nothing leaves the system without you
            </p>
          </div>
        </section>

        {/* 05 — ADAPTIVE */}
        <section ref={ref(4)} className="landing-section tall" aria-labelledby="learns-title">
          <div className="landing-sticky">
            <div className="container" style={{ maxWidth: "none" }}>
              <div className="eyebrow reveal">Adaptive / 05</div>
              <h2 id="learns-title" className="display-md reveal reveal-d1" style={{ marginTop: 24 }}>
                The system <span className="em">learns.</span>
              </h2>
              <p className="lede reveal reveal-d2" style={{ marginTop: 32 }}>
                Every application changes the system.<br />Every outcome teaches it something new.
              </p>
              <ol style={{ listStyle: "none", marginTop: 48, display: "flex", flexDirection: "column", gap: 10 }} aria-label="Learning stages">
                {LEARN_STAGES.map((s, i) => (
                  <li key={s} className="flow-label" style={{ color: i === learnStage ? "var(--text-primary)" : "var(--text-tertiary)", transition: "color 600ms" }}>
                    <i style={{ color: i === learnStage ? "var(--champagne)" : undefined }}>{String(i + 1).padStart(2, "0")}</i>{s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 06 — MIND MEETS MARKET */}
        <section ref={ref(5)} className="landing-section" style={{ alignItems: "stretch" }} aria-labelledby="market-title">
          <div className="container" style={{ maxWidth: "none", position: "relative", minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div className="eyebrow reveal">Human × market / 06</div>
              <h2 id="market-title" className="display-md reveal reveal-d1" style={{ marginTop: 24, maxWidth: "6ch" }}>
                Mind meets <span className="em">market.</span>
              </h2>
            </div>
            <div className="reveal reveal-d2" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              {["Greenhouse", "Lever", "Ashby", "SmartRecruiters", "Naukri", "Hiring managers", "Referrals"].map(s => (
                <span key={s} className="label">{s}</span>
              ))}
            </div>
          </div>
        </section>

        {/* 07 — FINAL */}
        <section ref={ref(6)} className="landing-section" style={{ justifyContent: "flex-end", paddingBottom: 64 }} aria-labelledby="final-title">
          <div className="container" style={{ maxWidth: "none", textAlign: "center" }}>
            <h2 id="final-title" className="display-md reveal" style={{ margin: "0 auto" }}>
              The future isn&apos;t automated.
            </h2>
            <p className="display-md reveal reveal-d1" style={{ marginTop: 8 }}>
              It&apos;s <span className="em">yours.</span>
            </p>
            <div className="reveal reveal-d2" style={{ marginTop: 48 }}>
              <button className="btn btn-primary btn-arrow" onClick={toSignIn} style={{ padding: "13px 26px" }}>Enter CareerOS</button>
            </div>
          </div>
          <div className="container" style={{ maxWidth: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 96, flexWrap: "wrap" }}>
            <span className="label">CareerOS</span>
            <span style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", letterSpacing: "-0.02em" }}>
              signal. score. <span className="em" style={{ color: "var(--text-primary)" }}>send.</span>
            </span>
            <span className="label">Local-first · your data stays yours</span>
          </div>
        </section>
      </main>
    </div>
  );
}
