"use client";

// A human brain built entirely from code. Thousands of tiny code fragments
// are the material: from a distance they resolve into a brain, up close
// (or under the cursor) they read as syntax. One continuous `phase` prop
// moves every fragment between four states:
//   0 CODE         a warped stream of code lines bending through space
//   1 NETWORK      fragments re-route onto organic neural pathways
//   2 BRAIN        the pathways resolve into the brain itself
//   3 INTELLIGENCE the brain at full luminance, regions firing
// Props can change every frame (scroll-driven); they are read from a ref
// inside the animation loop, so a prop change never re-initialises the
// particle field.

import { useEffect, useRef } from "react";

export type BrainRegion = { key: string; label: string; sub: string; u: number; v: number; r: number };

export const CAREER_REGIONS: BrainRegion[] = [
  { key: "intent", label: "TARGETING", sub: "intent", u: -0.62, v: -0.2, r: 0.3 },
  { key: "motor", label: "OUTREACH", sub: "motor", u: -0.1, v: -0.48, r: 0.27 },
  { key: "attention", label: "SCORING", sub: "attention", u: 0.42, v: -0.36, r: 0.28 },
  { key: "vision", label: "MARKET", sub: "vision", u: 0.8, v: -0.02, r: 0.24 },
  { key: "language", label: "RESUME", sub: "language", u: -0.42, v: 0.12, r: 0.24 },
  { key: "memory", label: "PROFILE", sub: "memory", u: 0.12, v: 0.27, r: 0.26 },
];

type Props = {
  phase?: number;
  focusX?: number;
  focusY?: number;
  scale?: number;
  density?: number;
  labels?: "none" | "hover" | "all";
  reach?: number;
  regions?: BrainRegion[];
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
};

const SHORT = ["01", "10", "{}", "()", "=>", ";", "fn", "λ", "∑", "<>", "[]", "0x", "&&", "||", "++", "::", "if", "do", "→", "·", "/*", "*/", "0", "1", "%", "#", "$", "@"];
const FRAGMENTS = [
  "function()", "const signal", "neural_input", "connect()", "if (intent)", "return data", "010101", "synapse",
  "signal.process()", "brain.state", "memory++", "input → output", "async function", "while()", "node.connect()",
  "response", "intent", "cognition", "decode()", "learn()", "predict()", "score(jd)", "match.fit", "resume.tailor()",
  "apply.stage()", "await approval", "profile.load()", "if (fit > 7)", "outreach.draft()", "career++", "parse(jd)",
  "role.match", "skills[]", "offer", "interview", "network.reach()", "signal", "yield next", "evidence[]", "rank()",
  "compile()", "context", "self.learn", "emit(intent)", "0b1101", "path.trace()", "fit: 0.92", "graph.walk()",
];

// Single-character marks: the "pixels" of the brain. They keep folds crisp at
// a distance; tokens and fragments mixed in make it read as code up close.
const MARKS = ["0", "1", "·", ":", ";", "/", "+", "=", "{", "}", "(", ")", "<", ">", "*", "_", "|", "#", "%", "1", "0", "·"];

const TRAVELLERS = ["→", "01", "sig", "»", "◦", "intent", "fit", "∙", "data"];

// Deterministic PRNG so the brain has the same anatomy across renders.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  return noise2(x, y) * 0.55 + noise2(x * 2.1, y * 2.1) * 0.3 + noise2(x * 4.3, y * 4.3) * 0.15;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Lateral view of a human brain, facing left, in brain-space units
// (u: -1 frontal pole .. +1 occipital pole, v: down is positive).
function inCerebrum(u: number, v: number): boolean {
  const crown = Math.pow(Math.abs(u / 0.98), 2.3) + Math.pow(Math.abs((v + 0.06) / 0.62), 2.1) <= 1;
  const floor = v <= 0.16 - Math.max(0, -u - 0.42) * 0.42; // frontal underside rises to the pole
  const temporal = ((u + 0.03) / 0.66) ** 2 + ((v - 0.2) / 0.29) ** 2 <= 1;
  if (!((crown && floor) || temporal)) return false;
  const cb = ((u - 0.6) / 0.3) ** 2 + ((v - 0.41) / 0.18) ** 2;
  if (cb < 1.22) return false; // transverse crease above the cerebellum
  if (segDist(u, v, -0.5, 0.1, 0.34, -0.03) < 0.022) return false; // lateral (Sylvian) fissure
  if (segDist(u, v, 0.04, -0.67, -0.12, 0.04) < 0.013) return false; // central sulcus
  return true;
}
function inCerebellum(u: number, v: number): boolean {
  return ((u - 0.6) / 0.3) ** 2 + ((v - 0.41) / 0.18) ** 2 <= 1;
}
function inStem(u: number, v: number): boolean {
  return v > 0.3 && segDist(u, v, 0.3, 0.34, 0.37, 0.92) < 0.066;
}
function insideBrain(u: number, v: number): boolean {
  return inCerebrum(u, v) || inCerebellum(u, v) || inStem(u, v);
}

function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

type Particle = {
  text: string;
  color: number;
  size: number;
  alpha: number;
  seed: number;
  delay: number;
  bu: number; bv: number; bz: number;
  nu: number; nv: number;
  sr: number; st: number;
  edge: number;
  region: number;
  scatterX: number; scatterY: number;
  x: number; y: number;
  ox: number; oy: number;
  drift: number;
};

type Path = { pts: [number, number][]; dir: 1 | -1 };
type Traveller = { path: number; t: number; speed: number; text: string; color: number };
type Pulse = { u: number; v: number; start: number; dur: number; radius: number; warm: number };
type Ripple = { x: number; y: number; start: number };

const COLOR_VARS = ["--cb-ink", "--cb-ice", "--cb-cyan", "--cb-teal", "--cb-warm", "--cb-coral"];

function pickColor(r: number) {
  if (r < 0.68) return 0;
  if (r < 0.84) return 1;
  if (r < 0.91) return 2;
  if (r < 0.96) return 3;
  if (r < 0.995) return 4;
  return 5;
}

function buildPaths(rand: () => number): Path[] {
  const paths: Path[] = [];
  const grow = (u: number, v: number, ang: number, steps: number, dir: 1 | -1, depth: number) => {
    const pts: [number, number][] = [[u, v]];
    let a = ang;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.34 + Math.sin(i * 0.3 + depth) * 0.04;
      u += Math.cos(a) * 0.035;
      v += Math.sin(a) * 0.035 * 0.85;
      pts.push([u, v]);
      if (depth < 2 && i > 6 && rand() < 0.055) grow(u, v, a + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.5), Math.floor(steps * (0.35 + rand() * 0.35)), dir, depth + 1);
    }
    paths.push({ pts, dir });
  };
  // External pathways leave from the brain's boundary: inputs on the left
  // flow inward, outputs on the right flow outward.
  const roots = 12;
  for (let i = 0; i < roots; i++) {
    const ang = (i / roots) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    let r = 0.2;
    while (insideBrain(Math.cos(ang) * r, Math.sin(ang) * r * 0.8) && r < 1.4) r += 0.01;
    const u = Math.cos(ang) * r, v = Math.sin(ang) * r * 0.8;
    grow(u, v, ang, 34 + Math.floor(rand() * 34), Math.cos(ang) < 0 ? -1 : 1, 0);
  }
  return paths;
}

// Inside the brain, each region is a neuron: a soma with dendrites that
// wander and branch. Organic, never geometric.
function buildConnectome(regions: BrainRegion[], rand: () => number): [number, number][][] {
  const arcs: [number, number][][] = [];
  const grow = (u: number, v: number, ang: number, steps: number, depth: number) => {
    const pts: [number, number][] = [[u, v]];
    let a = ang;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.7;
      u += Math.cos(a) * 0.022;
      v += Math.sin(a) * 0.022;
      if (!insideBrain(u, v)) break;
      pts.push([u, v]);
      if (depth < 2 && i > 3 && rand() < 0.12) grow(u, v, a + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6), Math.floor(steps * 0.6), depth + 1);
    }
    if (pts.length > 2) arcs.push(pts);
  };
  for (const rg of regions) {
    const dendrites = 4 + Math.floor(rand() * 3);
    for (let d = 0; d < dendrites; d++) grow(rg.u, rg.v, (d / dendrites) * Math.PI * 2 + rand() * 0.6, 14 + Math.floor(rand() * 12), 0);
  }
  return arcs;
}

function pointOn(pts: [number, number][], t: number): [number, number] {
  const f = Math.max(0, Math.min(0.9999, t)) * (pts.length - 1);
  const i = Math.floor(f), k = f - i;
  const a = pts[i], b = pts[i + 1] ?? pts[i];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

export default function CodeBrain({
  phase = 2, focusX = 0.62, focusY = 0.5, scale = 0.42, density = 1, labels = "none", reach = 0.6,
  regions = CAREER_REGIONS, className, style, ariaLabel = "A human brain assembled from thousands of fragments of code",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ phase, focusX, focusY, scale, labels, reach, regions });
  propsRef.current = { phase, focusX, focusY, scale, labels, reach, regions };
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => { kickRef.current(); }, [phase, focusX, focusY, scale, labels, reach]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1;
    let particles: Particle[] = [];
    let trail: { path: number; t: number; text: string; off: number }[] = [];
    let paths: Path[] = [];
    let travellers: Traveller[] = [];
    const pulses: Pulse[] = [];
    const ripples: Ripple[] = [];
    let colors = ["#ECE8E0", "#A9C9D6", "#A6DADF", "#5E8E8A", "#D8C6A2", "#E39C86"];
    let inkAlpha = 1;
    let monoFamily = "JetBrains Mono, monospace";
    let serifFamily = "Instrument Serif, serif";
    const start = performance.now();
    let raf = 0;
    let running = false;
    let visible = true;
    const pointer = { x: -9999, y: -9999, active: false, lastRipple: 0, lx: 0, ly: 0 };
    const cur = { phase: propsRef.current.phase, focusX: propsRef.current.focusX, focusY: propsRef.current.focusY, scale: propsRef.current.scale, reach: propsRef.current.reach, yaw: 0 };
    let nextPulse = 900;
    let hovered = -1;

    const readTheme = () => {
      const cs = getComputedStyle(document.documentElement);
      colors = COLOR_VARS.map((v, i) => cs.getPropertyValue(v).trim() || colors[i]);
      inkAlpha = parseFloat(cs.getPropertyValue("--cb-alpha")) || 1;
      monoFamily = cs.getPropertyValue("--font-mono").trim() || monoFamily;
      serifFamily = cs.getPropertyValue("--font-serif").trim() || serifFamily;
    };

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      const rand = mulberry32(7);
      paths = buildPaths(rand);
      const arcs = buildConnectome(propsRef.current.regions, rand);
      const netCurves = [...paths.map(p => p.pts), ...arcs, ...arcs];

      const mobile = W < 700;
      // Budget follows the brain's on-screen size (not the canvas), so a small
      // ambient brain is as dense as the hero one, just smaller.
      const S0 = Math.max(0.3, propsRef.current.scale) * Math.min(W, H * 1.45);
      const count = Math.round(Math.max(1100, Math.min(mobile ? 2400 : 4600, (3.1 * S0 * S0) / 150)) * density);
      const rows = mobile ? 26 : 44;
      const rnd = mulberry32(42);
      particles = [];
      type Kind = "outline" | "gyri" | "folia" | "stem" | "fill";
      const add = (u: number, v: number, kind: Kind) => {
        if (particles.length >= count) return;
        let outside = 0;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          if (!insideBrain(u + Math.cos(a) * 0.06, v + Math.sin(a) * 0.06)) outside++;
        }
        const edge = kind === "outline" ? 1 : outside / 8;
        const zMax = Math.sqrt(Math.max(0, 1 - u * u - ((v + 0.04) / 0.72) ** 2));
        const bz = zMax * (kind === "fill" ? rnd() : 0.86 + rnd() * 0.14) * 0.6;
        const zone = fbm(u * 1.6 + 11, v * 1.6 - 4);
        let region = -1, best = 9;
        propsRef.current.regions.forEach((rg, idx) => {
          const d = Math.hypot(u - rg.u, v - rg.v);
          if (d < rg.r && d < best) { best = d; region = idx; }
        });
        const curve = netCurves[Math.floor(rnd() * netCurves.length)];
        const [nu0, nv0] = pointOn(curve, rnd());
        const r0 = rnd();
        const markShare = kind === "folia" || kind === "stem" ? 0.82 : kind === "outline" ? 0.62 : kind === "fill" ? 0.2 : 0.84;
        const tokenShare = markShare + (kind === "fill" ? 0.3 : kind === "gyri" ? 0.14 : 0.2);
        const tier = r0 < markShare ? 0 : r0 < tokenShare ? 1 : 2;
        const text = tier === 0 ? MARKS[Math.floor(rnd() * MARKS.length)] : tier === 1 ? SHORT[Math.floor(rnd() * SHORT.length)] : FRAGMENTS[Math.floor(rnd() * FRAGMENTS.length)];
        const alpha =
          kind === "outline" ? 0.7 + rnd() * 0.3 :
          kind === "gyri" ? (0.55 + zone * 0.7) * (0.8 + rnd() * 0.2) :
          kind === "folia" ? 0.6 + rnd() * 0.35 :
          kind === "stem" ? 0.3 + rnd() * 0.3 :
          0.1 + rnd() * 0.14;
        particles.push({
          text,
          color: kind === "outline" && rnd() < 0.5 ? 0 : pickColor(rnd()),
          size: (tier === 0 ? 0.78 : tier === 1 ? 0.74 : 0.56) * (kind === "folia" ? 0.82 : 0.88 + rnd() * 0.3),
          alpha: Math.min(1, alpha),
          seed: rnd(),
          delay: 200 + rnd() * 2200,
          bu: u + (rnd() - 0.5) * 0.006, bv: v + (rnd() - 0.5) * 0.006, bz,
          nu: nu0 + (rnd() - 0.5) * 0.03, nv: nv0 + (rnd() - 0.5) * 0.03,
          sr: Math.floor(rnd() * rows) / rows + (rnd() - 0.5) * 0.008, st: rnd(),
          edge,
          region,
          scatterX: rnd() * W, scatterY: rnd() * H,
          x: rnd() * W, y: rnd() * H,
          ox: 0, oy: 0,
          drift: edge > 0.25 && rnd() < 0.5 ? 0.6 + rnd() * 1.6 : rnd() * 0.2,
        });
      };

      // 1. Outline: ray-cast the silhouette so the brain reads from across the room.
      const outlineN = Math.round(count * 0.11);
      for (let i = 0; i < outlineN; i++) {
        const ang = (i / outlineN) * Math.PI * 2;
        const cx = 0.02, cy = 0.08;
        let r = 1.3;
        while (r > 0.05 && !insideBrain(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)) r -= 0.004;
        add(cx + Math.cos(ang) * (r - 0.008), cy + Math.sin(ang) * (r - 0.008), "outline");
      }

      // 2. Cerebellum folia: fine, near-parallel bands.
      const foliaN = Math.round(count * 0.11);
      for (let i = 0; i < foliaN; i++) {
        const k = Math.floor(rnd() * 11);
        const u = 0.3 + rnd() * 0.6;
        const v = 0.25 + k * 0.032 + Math.sin(u * 11 + k) * 0.012;
        if (inCerebellum(u, v)) add(u, v, "folia");
      }

      // 3. Brainstem: a few longitudinal streams.
      for (let i = 0; i < count * 0.03; i++) {
        const t = rnd();
        const lane = (Math.floor(rnd() * 4) - 1.5) * 0.026;
        add(0.3 + t * 0.07 + lane, 0.36 + t * 0.56, "stem");
      }

      // 4. Cortex: evenly spaced streamlines through a swirling field, so
      //    ridges of code (gyri) are separated by dark grooves (sulci).
      const cell = 0.052;
      const occupied = new Map<string, number>();
      const key = (u: number, v: number) => `${Math.floor(u / cell)},${Math.floor(v / cell)}`;
      const field = (u: number, v: number) => 7.5 * fbm(u * 2.6 + 7, v * 2.6 + 2) + 0.6 * Math.atan2(v + 0.05, u);
      // Trace the complete fold set first, then sample it evenly to the
      // budget, so a small canvas still gets the whole cortex (just sparser)
      // instead of a few fully-drawn folds and nothing else.
      const gyriPts: [number, number][] = [];
      let lineId = 0;
      for (let tries = 0; tries < 9000; tries++) {
        const su = rnd() * 2 - 1, sv = rnd() * 1.2 - 0.7;
        if (!inCerebrum(su, sv) || occupied.has(key(su, sv))) continue;
        lineId++;
        for (const dir of [1, -1]) {
          let u = su, v = sv, last = "";
          for (let step = 0; step < 36; step++) {
            const a = field(u, v);
            u += Math.cos(a) * 0.0065 * dir;
            v += Math.sin(a) * 0.0065 * dir;
            if (!inCerebrum(u, v)) break;
            const kk = key(u, v);
            const owner = occupied.get(kk);
            if (owner !== undefined && owner !== lineId) break;
            if (kk !== last) { occupied.set(kk, lineId); last = kk; }
            gyriPts.push([u, v]);
          }
        }
      }
      const gyriBudget = Math.max(0, count - particles.length - Math.round(count * 0.09));
      const stride = Math.max(1, gyriPts.length / Math.max(1, gyriBudget));
      for (let f = rnd() * stride; f < gyriPts.length && particles.length < count; f += stride) {
        const [u, v] = gyriPts[Math.floor(f)];
        add(u, v, "gyri");
      }

      // 5. A faint interior haze fills the remaining budget.
      let guard = 0;
      while (particles.length < count && guard++ < count * 40) {
        const u = rnd() * 2 - 1, v = rnd() * 1.7 - 0.72;
        if (insideBrain(u, v)) add(u, v, "fill");
      }

      trail = [];
      const trailCount = Math.round(count * 0.14);
      for (let i = 0; i < trailCount; i++) {
        trail.push({ path: Math.floor(rnd() * paths.length), t: rnd(), text: rnd() < 0.6 ? SHORT[Math.floor(rnd() * SHORT.length)] : FRAGMENTS[Math.floor(rnd() * FRAGMENTS.length)], off: (rnd() - 0.5) * 0.025 });
      }
      travellers = [];
      const travCount = mobile ? 26 : 60;
      for (let i = 0; i < travCount; i++) {
        travellers.push({ path: Math.floor(rnd() * paths.length), t: rnd(), speed: 0.00006 + rnd() * 0.00012, text: TRAVELLERS[Math.floor(rnd() * TRAVELLERS.length)], color: rnd() < 0.7 ? 2 : rnd() < 0.5 ? 1 : 4 });
      }
    };

    const brainToScreen = (u: number, v: number, z: number) => {
      const S = cur.scale * Math.min(W, H * 1.45);
      const cos = Math.cos(cur.yaw), sin = Math.sin(cur.yaw);
      const ru = u * cos + z * sin;
      return [cur.focusX * W + ru * S, cur.focusY * H + v * S, S] as const;
    };

    const streamToScreen = (r: number, t: number, now: number) => {
      // Rows of code converge on a vanishing point and stream toward the
      // viewer, bending as if space itself were being distorted.
      const tt = (t + now * 0.000032) % 1;
      const row = (r - 0.5) * 2;
      const spread = Math.pow(tt, 1.45);
      const vx = 0.22 * W, vy = 0.52 * H;
      const x = vx + Math.pow(tt, 1.2) * W * 0.98 + Math.sin(row * 2.2 + tt * 2) * W * 0.03 * spread;
      const y = vy + row * spread * H * 0.78 + Math.sin(tt * 3.1 + row * 1.7) * H * 0.07 * spread;
      const persp = 0.4 + tt * 1.6;
      const fade = smooth(tt / 0.1) * (1 - smooth((tt - 0.86) / 0.14));
      return [x, y, persp, fade] as const;
    };

    let lastFrame = performance.now();
    const frame = (nowAbs: number) => {
      const now = reduced ? 5000 : nowAbs - start;
      const dtf = Math.min(4, Math.max(0.25, (nowAbs - lastFrame) / 16.67));
      lastFrame = nowAbs;
      const ease = (base: number) => (reduced ? 1 : 1 - Math.pow(1 - base, dtf));
      const p = propsRef.current;
      const k = ease(0.045);
      cur.phase += (p.phase - cur.phase) * k;
      cur.focusX += (p.focusX - cur.focusX) * k;
      cur.focusY += (p.focusY - cur.focusY) * k;
      cur.scale += (p.scale - cur.scale) * k;
      cur.reach += (p.reach - cur.reach) * k;
      const mouseYaw = pointer.active ? ((pointer.x / W) - 0.5) * 0.22 : 0;
      cur.yaw += ((reduced ? 0 : Math.sin(now * 0.00013) * 0.2) + mouseYaw - cur.yaw) * ease(0.04);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = `400 10px ${monoFamily}`;

      const ph = Math.max(0, Math.min(3, cur.phase));
      const seg = Math.min(2, Math.floor(ph));
      const segT = ph - seg;
      const intelligence = smooth(ph - 2);
      const brainness = smooth(ph - 1.1);
      const BASE = Math.max(6.2, Math.min(9.6, Math.min(W, H) / 105));

      // Region pulses: an area "processes" information and warms up.
      if (!reduced && now > nextPulse) {
        const rg = p.regions[Math.floor(Math.random() * p.regions.length)];
        pulses.push({ u: rg.u + (Math.random() - 0.5) * 0.2, v: rg.v + (Math.random() - 0.5) * 0.2, start: now, dur: 1900 + Math.random() * 900, radius: 0.22 + Math.random() * 0.2, warm: Math.random() < 0.12 ? 5 : 4 });
        nextPulse = now + (2600 - intelligence * 1500) * (0.6 + Math.random() * 0.8);
      }
      for (let i = pulses.length - 1; i >= 0; i--) if (now - pulses[i].start > pulses[i].dur) pulses.splice(i, 1);
      for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].start > 1500) ripples.splice(i, 1);

      // Hovered region (screen-space).
      hovered = -1;
      if (p.labels !== "none" && pointer.active) {
        let best = Infinity;
        p.regions.forEach((rg, idx) => {
          const [sx, sy, S] = brainToScreen(rg.u, rg.v, 0.4);
          const d = Math.hypot(pointer.x - sx, pointer.y - sy);
          if (d < rg.r * S && d < best) { best = d; hovered = idx; }
        });
      }

      const R = Math.max(90, Math.min(160, Math.min(W, H) * 0.16));
      const assembleDur = 1700;

      // External pathway trails (faint dotted code along the network).
      const trailVis = Math.max(cur.reach * (0.35 + brainness * 0.3), 1 - Math.abs(ph - 1) * 1.2) * (1 - smooth(1 - ph) * 0.9);
      if (trailVis > 0.02) {
        ctx.fillStyle = colors[1];
        for (const tr of trail) {
          const path = paths[tr.path];
          const tt = (tr.t + (reduced ? 0 : now * 0.000015 * path.dir)) % 1;
          const [u, v] = pointOn(path.pts, (tt + 1) % 1);
          const reachCut = Math.min(1, cur.reach * 1.2 + 0.2);
          const along = (tt + 1) % 1;
          if (along > reachCut) continue;
          const [x, y] = brainToScreen(u, v + tr.off, 0);
          const a = trailVis * 0.32 * (1 - along / reachCut) * inkAlpha;
          if (a < 0.01) continue;
          ctx.globalAlpha = a;
          const s = (BASE * 0.72) / 10;
          ctx.setTransform(dpr * s, 0, 0, dpr * s, x * dpr, y * dpr);
          ctx.fillText(tr.text, 0, 0);
        }
      }

      // The brain field.
      for (let i = 0; i < particles.length; i++) {
        const q = particles[i];
        const stag = smooth((segT - q.seed * 0.35) / 0.65);

        let ax: number, ay: number, aS = 1, aFade = 1;
        let bx: number, by: number, bS = 1, bFade = 1;
        const P = (state: number): [number, number, number, number] => {
          if (state === 0) {
            const [x, y, s, f] = streamToScreen(q.sr, q.st, now);
            return [x, y, s, f];
          }
          if (state === 1) {
            const [x, y] = brainToScreen(q.nu, q.nv, 0);
            return [x, y, 0.9, 0.85];
          }
          const drift = reduced ? 0 : q.drift * (state === 3 ? 1.4 : 1);
          const du = drift ? Math.sin(now * 0.0004 + q.seed * 40) * 0.02 * drift : 0;
          const dv = drift ? Math.cos(now * 0.00033 + q.seed * 31) * 0.02 * drift : 0;
          const [x, y] = brainToScreen(q.bu + du, q.bv + dv, q.bz);
          return [x, y, 1, 1];
        };
        [ax, ay, aS, aFade] = P(seg);
        [bx, by, bS, bFade] = P(seg + 1);
        let tx = ax + (bx - ax) * stag;
        let ty = ay + (by - ay) * stag;
        const sizeK = aS + (bS - aS) * stag;
        const fade = aFade + (bFade - aFade) * stag;

        // Compile-in on first paint.
        const asm = reduced ? 1 : smooth((now - q.delay) / assembleDur);
        if (asm < 1) {
          tx = q.scatterX + (tx - q.scatterX) * asm;
          ty = q.scatterY + (ty - q.scatterY) * asm;
        }

        const follow = ease(0.07 + q.seed * 0.08);
        q.x += (tx - q.x) * follow;
        q.y += (ty - q.y) * follow;

        let alpha = q.alpha * fade * asm;
        let size = BASE * q.size * sizeK;
        let col = q.color;

        // Depth: the surface facing the viewer is brighter.
        if (seg >= 1) alpha *= 0.55 + 0.45 * (q.bz / 0.6) * brainness + (1 - brainness) * 0.45;
        alpha *= 1.15 + intelligence * 0.3;

        // Pulses.
        for (const pu of pulses) {
          const d = Math.hypot(q.bu - pu.u, q.bv - pu.v);
          if (d > pu.radius) continue;
          const life = (now - pu.start) / pu.dur;
          const env = Math.sin(Math.PI * Math.min(1, life)) * (1 - d / pu.radius);
          alpha += env * 0.75 * brainness;
          if (env > 0.25) col = pu.warm;
        }

        // Hovered region annotation highlight.
        if (hovered >= 0 && q.region === hovered) { alpha += 0.45; if (col === 0) col = 4; size *= 1.08; }

        // Cursor: nearby code becomes brighter, larger and legible.
        let ox = 0, oy = 0;
        if (pointer.active) {
          const dx = q.x - pointer.x, dy = q.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < R) {
            const kk = 1 - d / R;
            alpha += kk * kk * 0.9;
            size *= 1 + kk * kk * 0.95;
            ox = (dx / (d || 1)) * kk * 16;
            oy = (dy / (d || 1)) * kk * 16;
          }
        }
        for (const rp of ripples) {
          const age = now - rp.start;
          const r = age * 0.42;
          const d = Math.hypot(q.x - rp.x, q.y - rp.y);
          const band = 1 - Math.min(1, Math.abs(d - r) / 26);
          if (band > 0) alpha += band * 0.4 * (1 - age / 1500);
        }
        q.ox += (ox - q.ox) * ease(0.2);
        q.oy += (oy - q.oy) * ease(0.2);

        alpha = Math.min(1, alpha) * (col === 0 ? inkAlpha : 1);
        if (alpha < 0.012) continue;
        const x = q.x + q.ox, y = q.y + q.oy;
        if (x < -80 || x > W + 80 || y < -40 || y > H + 40) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colors[col];
        const s = size / 10;
        ctx.setTransform(dpr * s, 0, 0, dpr * s, x * dpr, y * dpr);
        ctx.fillText(q.text, 0, 0);
      }

      // Signals travelling along the pathways (in on the left, out on the right).
      const travVis = smooth(ph - 0.6) * (0.55 + cur.reach * 0.45);
      if (travVis > 0.02) {
        for (const tv of travellers) {
          if (!reduced) tv.t += tv.speed * 16 * dtf * paths[tv.path].dir;
          if (tv.t > 1) tv.t -= 1;
          if (tv.t < 0) tv.t += 1;
          const along = paths[tv.path].dir === 1 ? tv.t : 1 - tv.t;
          const reachCut = Math.min(1, cur.reach * 1.2 + 0.2);
          if (along > reachCut) continue;
          const [u, v] = pointOn(paths[tv.path].pts, along);
          const [x, y] = brainToScreen(u, v, 0);
          ctx.globalAlpha = travVis * (0.5 + 0.5 * Math.sin(along * Math.PI)) * 0.95;
          ctx.fillStyle = colors[tv.color];
          const s = (BASE * 1.05) / 10;
          ctx.setTransform(dpr * s, 0, 0, dpr * s, x * dpr, y * dpr);
          ctx.fillText(tv.text, 0, 0);
        }
      }

      // Region annotations: a dot, a leader line, a label. Annotations, not cards.
      if (p.labels !== "none" && brainness > 0.4) {
        p.regions.forEach((rg, idx) => {
          const show = p.labels === "all" || idx === hovered;
          if (!show) return;
          const on = idx === hovered;
          const [sx, sy, S] = brainToScreen(rg.u, rg.v, 0.42);
          const side = rg.u < 0.2 ? -1 : 1;
          const lx = Math.max(150, Math.min(W - 150, sx + side * S * 0.28));
          const ly = Math.max(28, Math.min(H - 36, sy - S * (rg.v < 0 ? 0.22 : -0.2)));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalAlpha = (on ? 0.95 : 0.5) * brainness;
          ctx.strokeStyle = colors[on ? 4 : 0];
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.arc(sx, sy, on ? 3 : 2, 0, Math.PI * 2);
          ctx.moveTo(sx, sy);
          ctx.lineTo(lx, ly);
          ctx.lineTo(lx + side * 18, ly);
          ctx.stroke();
          ctx.fillStyle = colors[on ? 4 : 0];
          ctx.textAlign = side < 0 ? "right" : "left";
          ctx.font = `400 10px ${monoFamily}`;
          ctx.fillText(`${String(idx + 1).padStart(2, "0")}  ${rg.label}`, lx + side * 24, ly - 1);
          ctx.globalAlpha *= 0.75;
          ctx.font = `italic 400 14px ${serifFamily}`;
          ctx.fillText(rg.sub, lx + side * 24, ly + 15);
          ctx.textAlign = "center";
          ctx.font = `400 10px ${monoFamily}`;
        });
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      frame(t);
      if (running) raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (reduced) { requestAnimationFrame(frame); return; }
      if (running || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => { running = false; cancelAnimationFrame(raf); };
    kickRef.current = () => { if (reduced) requestAnimationFrame(frame); };

    readTheme();
    build();
    startLoop();

    const ro = new ResizeObserver(() => { build(); if (reduced) requestAnimationFrame(frame); });
    ro.observe(canvas);
    const io = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) startLoop(); else stopLoop();
    });
    io.observe(canvas);
    const mo = new MutationObserver(() => { readTheme(); if (reduced) requestAnimationFrame(frame); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onVis = () => { if (document.hidden) stopLoop(); else startLoop(); };
    document.addEventListener("visibilitychange", onVis);
    document.fonts?.ready.then(() => { readTheme(); if (reduced) requestAnimationFrame(frame); }).catch(() => {});

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
      const now = performance.now() - start;
      const speed = Math.hypot(pointer.x - pointer.lx, pointer.y - pointer.ly);
      if (pointer.active && speed > 18 && now - pointer.lastRipple > 220) {
        ripples.push({ x: pointer.x, y: pointer.y, start: now });
        pointer.lastRipple = now;
      }
      pointer.lx = pointer.x;
      pointer.ly = pointer.y;
      if (reduced) requestAnimationFrame(frame);
    };
    const onLeave = () => { pointer.active = false; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      stopLoop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density]);

  return <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", height: "100%", ...style }} role="img" aria-label={ariaLabel} />;
}
