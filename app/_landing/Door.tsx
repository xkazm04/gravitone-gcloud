"use client";

// THE DOOR — the studio as a star atlas (Almanac, contest landing-nextgen-brand-r2).
//
// Every candidate is a star and most stay faint; a person picks a few, and the
// dotted gold line through the picks is the film: the cut. The 19 real pictures
// this repo's pipeline generated are the chart's only light, each in a circular
// eyepiece; the four real groups are constellations with a stylised figure each.
// The one control is the sign-in button (./parts).
//
// THREE LEVELS: Sky, then a constellation (the camera flies in, the others dim),
// then a plate (./Plate). Esc, the back pill, the crumbs and the arrow keys work
// at every level. Hovering a star puts its name at the centre in the large display voice.
//
// HOW IT IS BUILT. The chart is a fixed 1600x1000 stage (1000x2250 on phones),
// letterboxed inside a full-bleed sky, so it never stretches. The camera is two
// transformed layers (figures behind, stars in front) driven by one tween; text
// lives in a separate screen-space layer whose positions are re-projected every
// frame, so a label's computed size is its rendered size (the 14px floor holds
// through a zoom instead of being resampled below it). State that changes what
// React draws (level, hover, the arrival beat) is React state; the per-frame
// camera is refs and direct style writes, because a 60fps tween is not a render.
//
// MOTION IS ENTRANCE-ONLY. The arrival (stars ignite, figures draw, the picks
// flare, the cut is drawn through them) runs once and can be skipped by any
// press; flights run on demand; the only loop is the reticle's turn, and it
// exists only while a star is hovered. Nothing runs when the tab is hidden or
// after you have looked. Reduced motion gets the calm version: no drawing, no
// flight, a crossfade.

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Mark, Wordmark } from "@/components/kit/brand";

import { createSky, type Cam, type Sky } from "./bgSky";
import { EnterButton } from "./parts";
import { Plate } from "./Plate";
import {
  ALL, BOX, CAMBOX, CONS, CUT_ORDER, FIGURES, LAYS, PICKS, bezier, catmull, faintStars, graticule, posOf, sizeOf,
  type Constellation, type Layout, type LayoutKey, type Star,
} from "./sky";
import s from "./door.module.css";

const REDUCED_Q = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED_Q);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** The viewport as a string snapshot (a stable primitive), settled 80ms after a resize. */
const subscribeViewport = (cb: () => void) => {
  let t: ReturnType<typeof setTimeout>;
  const onResize = () => { clearTimeout(t); t = setTimeout(cb, 80); };
  window.addEventListener("resize", onResize);
  return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
};
const EASE = bezier(0.2, 0.7, 0.1, 1);
const TOTAL = `${ALL.length} stars · ${CONS.length} constellations`;
const STEPS = ["Research", "Script", "Frames", "Score", "Cut"];
const ON_STEP = "Frames";
const SKY_LABEL =
  `Star chart: ${ALL.length} real generated pictures in ${CONS.length} constellations, ${PICKS} of them picked and joined by a dotted line. ` +
  "The constellation figures are stylised; the pictures are product output.";

interface Nav { level: 0 | 1 | 2; ci: number; item: Star | null }
interface PlateState { item: Star; closing: boolean; instant: boolean }
interface Hover { star: Star; on: boolean }
interface Geo { k: LayoutKey; L: Layout; vw: number; vh: number; s0: number }

const css = (o: Record<string, string | number>) => o as React.CSSProperties;
const info = (it: Star, con: Constellation) =>
  `${it.cat} · ${con.name} · candidate ${it.i + 1} of ${con.stars.length}`;

/** One screen-space label: where it sits in chart units, what it says. */
interface LabelSpec {
  key: string;
  x: number;
  y: number;
  dy?: number;
  tf?: string;
  node: React.ReactNode;
}

/** Star-name labels, one per star, under its eyepiece. Filled at render. */
/** A constellation tint drawn as text: mixed toward white so it reads >= 7:1 on the night ground (never faded). */
const textTint = (tint: string) => `color-mix(in srgb, ${tint} 70%, var(--al-white))`;

/** -1 or 1 when another eyepiece of the constellation sits beside this one on the same baseline (its side), else 0. */
function mateSide(g: Geo, it: (typeof ALL)[number]): number {
  const p = posOf(g.L, it), sz = sizeOf(g.k, it);
  const mate = ALL.find((o) => o !== it && o.ci === it.ci && Math.abs(posOf(g.L, o).y - p.y) < sz * 0.5 && Math.abs(posOf(g.L, o).x - p.x) < sz * 2.2);
  return mate ? Math.sign(posOf(g.L, mate).x - p.x) : 0;
}

function labelsForStars(g: Geo): LabelSpec[] {
  return ALL.map((it) => {
    const p = posOf(g.L, it), sz = sizeOf(g.k, it);
    // Two eyepieces side by side share one baseline; centred names would run into
    // each other at 14px, so the pair's names read outward from the gap between them
    // (the slab's own alignment class does the shifting, .lb is zero-width).
    return { key: `s:${it.cat}`, x: p.x + mateSide(g, it) * (sz / 2), y: p.y + (sz / 2) * 1.15, dy: 10, tf: "", node: null };
  });
}
/** Constellation names, as buttons. Filled at render. */
function labelsForCons(g: Geo): LabelSpec[] {
  return CONS.map((c) => {
    const t = g.L.t[c.id];
    return { key: `c:${c.id}`, x: t.lab[0], y: t.lab[1], tf: t.lab[2] === "mid" ? "translateX(-50%)" : t.lab[2] === "end" ? "translateX(-100%)" : "", node: null };
  });
}

export default function Door({ slot }: { slot?: React.ReactNode }) {
  // ── state ────────────────────────────────────────────────────────────────
  const viewport = useSyncExternalStore(subscribeViewport, () => `${window.innerWidth}x${window.innerHeight}`, () => "");
  const size = useMemo(() => {
    if (!viewport) return null;
    const [vw, vh] = viewport.split("x").map(Number);
    return { vw, vh };
  }, [viewport]);
  const [lit, setLit] = useState(-1); // arrival beats 0..4; -1 before mount
  const [settled, setSettled] = useState(false);
  const [instant, setInstant] = useState(false);
  const [nav, setNavState] = useState<Nav>({ level: 0, ci: -1, item: null });
  const [plate, setPlate] = useState<PlateState | null>(null);
  const [goneStar, setGoneStar] = useState<Star | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [hiCi, setHiCi] = useState<number | null>(null);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_Q).matches, () => false);

  const navRef = useRef(nav);
  const plateRef = useRef(plate);
  const setNav = useCallback((n: Nav) => { navRef.current = n; setNavState(n); }, []);
  const setPlateBoth = useCallback((p: PlateState | null) => { plateRef.current = p; setPlate(p); }, []);

  // ── refs: the imperative half ────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const camA = useRef<HTMLDivElement>(null);
  const camB = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const starEls = useRef<(HTMLButtonElement | null)[]>([]);
  const clabEls = useRef<(HTMLButtonElement | null)[]>([]);
  const labEls = useRef<(HTMLDivElement | null)[]>([]);
  const cam = useRef<Cam>({ cx: 0, cy: 0, S: 1, ax: 0, ay: 0 });
  const tween = useRef(0);
  const sky = useRef<Sky | null>(null);
  const igniteRef = useRef(0);
  const bgRaf = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settledRef = useRef(false);
  const kbd = useRef(false);
  const reducedRef = useRef(false);
  useLayoutEffect(() => { reducedRef.current = reduced; }, [reduced]);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const labSpecs = useRef<LabelSpec[]>([]);

  // ── geometry: what the viewport makes of the stage ───────────────────────
  const geo: Geo | null = useMemo(() => {
    if (!size) return null;
    const k: LayoutKey = size.vw / size.vh < 0.8 ? "P" : "L";
    const L = LAYS[k];
    return { k, L, vw: size.vw, vh: size.vh, s0: Math.min(size.vw / L.W, size.vh / L.H) };
  }, [size]);
  const geoRef = useRef<Geo | null>(null);
  useLayoutEffect(() => { geoRef.current = geo; }, [geo]);

  // ── the chart: everything drawn once per layout ──────────────────────────
  const chart = useMemo(() => {
    if (!geo) return null;
    const { k, L } = geo, { W, H } = L;
    const grat = graticule(k, L);
    const faint = faintStars(L);
    const byId = (id: Constellation["id"]) => CONS.find((c) => c.id === id)!;
    const picks = CUT_ORDER.map((id) => byId(id).stars.find((t) => t.pick)!);
    const pts = picks.map((p) => posOf(L, p));
    const cutD = catmull(pts);
    const neat: string[] = [];
    for (let x = 30; x <= W - 30; x += 20) {
      const big = (x - 30) % 100 === 0;
      neat.push(`M ${x} 22 V ${big ? 38 : 30} M ${x} ${H - 22} V ${H - (big ? 38 : 30)}`);
    }
    for (let y = 30; y <= H - 30; y += 20) {
      const big = (y - 30) % 100 === 0;
      neat.push(`M 22 ${y} H ${big ? 38 : 30} M ${W - 22} ${y} H ${W - (big ? 38 : 30)}`);
    }
    const labels: LabelSpec[] = [];
    grat.labels.forEach((g, i) =>
      labels.push({ key: `g:${i}`, x: g.x, y: g.y, tf: "translateY(-100%)", node: <span className={s.gratx} aria-hidden="true">{g.text}</span> }),
    );
    if (k === "L") {
      labels.push({
        key: "x:cut", x: (pts[0].x + pts[1].x) / 2 - 150, y: (pts[0].y + pts[1].y) / 2 + 64, tf: "rotate(45.8deg) translateY(-100%)",
        node: <span className={s.cutlbl} aria-hidden="true">THE CUT · {PICKS} PICKS</span>,
      });
    }
    labels.push(...labelsForStars(geo), ...labelsForCons(geo));
    return { grat, faint, picks, cutD, neat: neat.join(" "), labels };
  }, [geo]);

  // ── camera ───────────────────────────────────────────────────────────────
  const camTarget = useCallback((level: 0 | 1 | 2, ci: number): Cam => {
    const g = geoRef.current!;
    const { L, k, vw, vh, s0 } = g;
    if (level === 0) return { cx: L.W / 2, cy: L.H / 2, S: s0, ax: vw / 2, ay: vh / 2 };
    const c = CONS[ci], t = L.t[c.id], b = CAMBOX[c.id] ?? BOX[c.id];
    let x0 = t.x + b[0] * t.sx, x1 = t.x + b[2] * t.sx, y0 = t.y + b[1] * t.sy, y1 = t.y + b[3] * t.sy;
    for (const st of c.stars) {
      const p = posOf(L, st), r = sizeOf(k, st) * 0.66 + 30;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r + 46);
    }
    const small = vw < 760;
    const top = small ? 112 : Math.max(110, vh * 0.13);
    const bot = small ? vh - 210 : vh - Math.max(150, vh * 0.2);
    const lft = small ? 16 : Math.max(40, vw * 0.06);
    const rgt = small ? vw - 16 : vw - Math.max(40, vw * 0.06);
    const S = Math.min(Math.min((rgt - lft) / (x1 - x0), (bot - top) / (y1 - y0)), s0 * 3.2);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, S, ax: (lft + rgt) / 2, ay: (top + bot) / 2 };
  }, []);

  const drawBg = useCallback(() => {
    if (bgRaf.current) return;
    bgRaf.current = requestAnimationFrame(() => {
      bgRaf.current = 0;
      sky.current?.draw(cam.current, reducedRef.current ? 1 : igniteRef.current);
    });
  }, []);

  const applyCam = useCallback(() => {
    const c = cam.current;
    const tr = `translate(${(c.ax - c.cx * c.S).toFixed(2)}px,${(c.ay - c.cy * c.S).toFixed(2)}px) scale(${c.S.toFixed(5)})`;
    const kk = (1 / c.S).toFixed(4);
    for (const el of [camA.current, camB.current]) {
      if (!el) continue;
      el.style.transform = tr;
      el.style.setProperty("--k", kk);
    }
    const specs = labSpecs.current;
    for (let i = 0; i < specs.length; i++) {
      const el = labEls.current[i], L = specs[i];
      if (el) el.style.transform = `translate(${(c.ax + (L.x - c.cx) * c.S).toFixed(1)}px,${(c.ay + (L.y - c.cy) * c.S + (L.dy ?? 0)).toFixed(1)}px) ${L.tf ?? ""}`;
    }
    drawBg();
  }, [drawBg]);

  const moveCam = useCallback((to: Cam, dur: number, done?: () => void) => {
    cancelAnimationFrame(tween.current);
    if (reducedRef.current || !dur) {
      if (reducedRef.current && dur) {
        // the calm version: a crossfade in place of the flight
        const els = [camA.current, camB.current];
        els.forEach((e) => { if (e) { e.style.transition = "opacity .22s"; e.style.opacity = "0"; } });
        setTimeout(() => {
          cam.current = to; applyCam();
          els.forEach((e) => { if (e) e.style.opacity = "1"; });
          done?.();
        }, 230);
        return;
      }
      cam.current = to; applyCam(); done?.();
      return;
    }
    const from = { ...cam.current }, t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / dur), e = EASE(u);
      cam.current = {
        cx: from.cx + (to.cx - from.cx) * e,
        cy: from.cy + (to.cy - from.cy) * e,
        S: Math.exp(Math.log(from.S) + (Math.log(to.S) - Math.log(from.S)) * e),
        ax: from.ax + (to.ax - from.ax) * e,
        ay: from.ay + (to.ay - from.ay) * e,
      };
      applyCam();
      if (u < 1) tween.current = requestAnimationFrame(step);
      else done?.();
    };
    tween.current = requestAnimationFrame(step);
  }, [applyCam]);

  // a new geometry: rebuild the field, park the camera at the current level
  useLayoutEffect(() => {
    if (!geo || !chart || !canvas.current || !rootRef.current) return;
    labSpecs.current = chart.labels;
    sky.current = createSky(canvas.current, rootRef.current, { W: geo.L.W, H: geo.L.H, s0: geo.s0, vw: geo.vw, vh: geo.vh });
    cancelAnimationFrame(tween.current);
    const n = navRef.current;
    cam.current = camTarget(n.level ? 1 : 0, Math.max(0, n.ci));
    applyCam();
  }, [geo, chart, camTarget, applyCam]);

  // ── the arrival ──────────────────────────────────────────────────────────
  const at = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
  const skipIntro = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    timers.current.forEach(clearTimeout);
    setInstant(true);
    setLit(4);
    setSettled(true);
    igniteRef.current = 1;
    drawBg();
    // one paint with every transition off, so the beats land at once
    requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
  }, [drawBg]);

  const started = useRef(false);
  useEffect(() => {
    if (!geo || started.current) return;
    started.current = true;
    if (reducedRef.current) {
      igniteRef.current = 1;
      at(30, () => { setLit(4); drawBg(); });
      at(400, () => { settledRef.current = true; setSettled(true); });
      return;
    }
    const ts = performance.now();
    const ig = (now: number) => {
      igniteRef.current = Math.min(1, (now - ts) / 1500);
      drawBg();
      if (igniteRef.current < 1 && !settledRef.current) requestAnimationFrame(ig);
      else igniteRef.current = 1;
    };
    requestAnimationFrame(ig);
    at(40, () => setLit(0));
    at(420, () => setLit(1));
    at(520, () => setLit(2));
    at(2050, () => setLit(3));
    at(2350, () => setLit(4));
    at(3500, () => { settledRef.current = true; setSettled(true); });
  }, [geo, at, drawBg]);

  useEffect(() => {
    const timerList = timers.current;
    return () => { timerList.forEach(clearTimeout); cancelAnimationFrame(tween.current); cancelAnimationFrame(bgRaf.current); };
  }, []);

  // ── levels ───────────────────────────────────────────────────────────────
  const focusStar = (st: Star | undefined) => starEls.current[st ? ALL.indexOf(st) : -1]?.focus({ preventScroll: true });

  const closePlate = useCallback((instantly = false) => {
    const n = navRef.current, p = plateRef.current;
    if (n.level !== 2 || !p) return;
    const it = p.item;
    setNav({ level: 1, ci: n.ci, item: null });
    setPlateBoth({ item: it, closing: true, instant: instantly });
    if (instantly || reducedRef.current) setGoneStar(null);
    else setTimeout(() => setGoneStar(null), 560);
    if (!instantly) requestAnimationFrame(() => focusStar(it));
  }, [setNav, setPlateBoth]);

  const goCon = useCallback((ci: number, done?: () => void) => {
    if (navRef.current.level === 2) closePlate(false);
    setNav({ level: 1, ci, item: null });
    setHover(null);
    moveCam(camTarget(1, ci), 950, done);
    if (!done && kbd.current) setTimeout(() => {
      const a = document.activeElement;
      if (navRef.current.level === 1 && (a === document.body || a?.classList.contains(s.clab))) focusStar(CONS[ci].stars[0]);
    }, 500);
  }, [closePlate, moveCam, camTarget, setNav]);

  const goSky = useCallback(() => {
    const prev = navRef.current.ci;
    setNav({ level: 0, ci: -1, item: null });
    setHover(null);
    moveCam(camTarget(0, -1), 950);
    if (prev >= 0) setTimeout(() => clabEls.current[prev]?.focus({ preventScroll: true }), 60);
  }, [moveCam, camTarget, setNav]);

  const openPlate = useCallback((it: Star) => {
    setNav({ level: 2, ci: it.ci, item: it });
    setHover(null);
    setGoneStar(it);
    setPlateBoth({ item: it, closing: false, instant: false });
  }, [setNav, setPlateBoth]);

  const stepPlate = useCallback((dir: -1 | 1) => {
    const n = navRef.current;
    if (n.level !== 2 || !n.item) return;
    const list = CONS[n.item.ci].stars;
    const next = list[(n.item.i + dir + list.length) % list.length];
    setNav({ level: 2, ci: next.ci, item: next });
    setGoneStar(next);
    setPlateBoth({ item: next, closing: false, instant: false });
  }, [setNav, setPlateBoth]);

  const openItem = useCallback((it: Star) => {
    const n = navRef.current;
    if (n.level === 1 && n.ci === it.ci) { openPlate(it); return; }
    if (n.level === 2) { setNav({ level: 2, ci: it.ci, item: it }); setGoneStar(it); setPlateBoth({ item: it, closing: false, instant: false }); return; }
    goCon(it.ci, () => openPlate(it));
  }, [goCon, openPlate, setNav, setPlateBoth]);

  const up = useCallback(() => {
    const n = navRef.current;
    if (n.level === 2) closePlate();
    else if (n.level === 1) goSky();
  }, [closePlate, goSky]);

  const hoverStar = useCallback((it: Star, on: boolean) => {
    clearTimeout(hoverTimer.current);
    if (on) setHover({ star: it, on: true });
    else hoverTimer.current = setTimeout(() => setHover((h) => (h ? { ...h, on: false } : h)), 60);
  }, []);

  // ── keyboard + first-press skip ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      kbd.current = true;
      if (!settledRef.current && e.key !== "Tab") skipIntro();
      const n = navRef.current;
      if (e.key === "Escape") { e.preventDefault(); up(); return; }
      if (n.level === 2) {
        if (e.key === "ArrowLeft") { stepPlate(-1); e.preventDefault(); }
        else if (e.key === "ArrowRight") { stepPlate(1); e.preventDefault(); }
        else if (e.key === "Tab") {
          const f = [...document.querySelectorAll<HTMLElement>(`.${s.top} button, .${s.top} a, .${s.plate} button`)].filter((x) => x.offsetParent !== null);
          const j = f.indexOf(document.activeElement as HTMLElement);
          if (f.length && e.shiftKey && j <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
          else if (f.length && !e.shiftKey && j === f.length - 1) { f[0].focus(); e.preventDefault(); }
        }
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        const vs = ALL.filter((st) => n.level === 0 || st.ci === n.ci).map((st) => starEls.current[ALL.indexOf(st)]!);
        const at0 = vs.indexOf(document.activeElement as HTMLButtonElement);
        const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        vs[at0 < 0 ? 0 : (at0 + dir + vs.length) % vs.length]?.focus();
        e.preventDefault();
      }
    };
    const onPointer = () => { kbd.current = false; skipIntro(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer, true); };
  }, [skipIntro, up, stepPlate]);

  // ── render ───────────────────────────────────────────────────────────────
  const { level, ci: navCi } = nav;
  const stage = geo && chart ? { ...geo, ...chart } : null;
  const rootClass = [
    s.door,
    lit >= 0 && s.lit0, lit >= 1 && s.lit1, lit >= 2 && s.lit2, lit >= 3 && s.lit3, lit >= 4 && s.lit4,
    settled && s.settled, instant && s.instant,
    level >= 1 && s.l1, level === 2 && s.l2,
    hover?.on && s.hovering,
  ].filter(Boolean).join(" ");

  const hovInfo = hover?.star ? info(hover.star, CONS[hover.star.ci]) : "";
  const curCon = navCi >= 0 ? CONS[navCi] : null;

  return (
    <div ref={rootRef} className={rootClass} data-world="almanac" style={css({ "--s0": geo ? geo.s0.toFixed(4) : 1 })}>
      {/* THE PAGE'S ONE HEADING, and the <title> in app/layout.tsx verbatim. It
          sits outside the chart's region so it can never be pruned with it. */}
      <h1 className="sr-only">Gravitone: a content studio</h1>

      <header className={s.top}>
        <div className={s.left}>
          <button
            className={s.brand}
            aria-label="Gravitone, back to the sky"
            onClick={() => { skipIntro(); if (navRef.current.level === 2) closePlate(true); if (navRef.current.level) goSky(); }}
          >
            <Mark className={s.mk} />
            <Wordmark className={s.wm} />
          </button>
          <nav className={s.nav} aria-label="Location">
            <button className={`${s.back} ${s.sc}`} aria-label="Up one level" onClick={up}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" strokeWidth={1.3} />
              </svg>
              <span>{level === 2 && curCon ? curCon.name : "Sky"}</span> <kbd className={s.kbd}>Esc</kbd>
            </button>
            <ol className={`${s.crumbs} ${s.sc}`}>
              {level === 0 ? (
                <>
                  <li><span aria-current="location">Sky</span></li>
                  <li className={`${s.sep} ${s.xs}`} aria-hidden="true">·</li>
                  <li className={s.xs}>{TOTAL}</li>
                </>
              ) : (
                <>
                  <li className={s.xs}><button onClick={() => { if (level === 2) closePlate(true); goSky(); }}>Sky</button></li>
                  <li className={`${s.sep} ${s.xs}`} aria-hidden="true">›</li>
                  {level === 1 ? (
                    <li><span aria-current="location" style={{ color: textTint(curCon!.tint) }}>{curCon!.name}</span></li>
                  ) : (
                    <>
                      <li><button style={{ color: textTint(curCon!.tint) }} onClick={() => closePlate()}>{curCon!.name}</button></li>
                      <li className={s.sep} aria-hidden="true">›</li>
                      <li><span aria-current="location">{nav.item?.name}</span></li>
                    </>
                  )}
                </>
              )}
            </ol>
          </nav>
        </div>
        <div className={s.ctaw}><EnterButton /></div>
      </header>

      <div className={s.sky} role="group" aria-label={SKY_LABEL}>
        <canvas ref={canvas} className={s.bg} aria-hidden="true" />

        {stage && (
          <>
            <div ref={camA} className={s.cam} style={{ width: stage.L.W, height: stage.L.H }} aria-hidden="true">
              <svg className={s.chart} width={stage.L.W} height={stage.L.H} viewBox={`0 0 ${stage.L.W} ${stage.L.H}`}>
                <defs>
                  <mask id="door-cutmask" maskUnits="userSpaceOnUse" x={-500} y={-500} width={stage.L.W + 1000} height={stage.L.H + 1000}>
                    <path className={s.cutmask} d={stage.cutD} pathLength={1} />
                  </mask>
                  <radialGradient id="door-halo">
                    <stop offset="0" style={{ stopColor: "var(--al-ald)", stopOpacity: 0.12 }} />
                    <stop offset="1" style={{ stopColor: "var(--al-ald)", stopOpacity: 0 }} />
                  </radialGradient>
                </defs>
                <g>
                  {stage.grat.circles.map((c, i) => <circle key={i} className={`${s.grat} ${c.major ? s.major : ""}`} cx={c.cx} cy={c.cy} r={c.r.toFixed(1)} />)}
                  {stage.grat.hours.map((h, i) => <path key={i} className={`${s.grat} ${h.major ? s.major : ""}`} d={h.d} />)}
                </g>
                <g className={s.neatg}>
                  <rect className={s.neat} x={22} y={22} width={stage.L.W - 44} height={stage.L.H - 44} />
                  <rect className={s.neat} x={30} y={30} width={stage.L.W - 60} height={stage.L.H - 60} strokeOpacity={0.12} />
                  <path className={s.neat} d={stage.neat} strokeOpacity={0.2} />
                </g>
                {stage.faint.map((f, i) => {
                  const on = level === 0 || navCi === i;
                  return (
                    <g key={f.id} className={s.faintg} style={{ opacity: on ? 1 : 0.15 }}>
                      {f.dots.map((d, j) => <circle key={j} cx={d.cx.toFixed(1)} cy={d.cy.toFixed(1)} r={d.r.toFixed(2)} style={{ fill: CONS[i].tint }} fillOpacity={d.o.toFixed(2)} />)}
                    </g>
                  );
                })}
                {CONS.map((c, i) => {
                  const t = stage.L.t[c.id], b = BOX[c.id], fg = FIGURES[c.id];
                  const on = level === 0 || navCi === i;
                  const hi = hiCi === i || (hover?.on && hover.star.ci === i) || (level >= 1 && navCi === i);
                  return (
                    <g key={c.id} className={s.figwrap} style={{ opacity: on ? 1 : 0.12 }}>
                      <g
                        className={`${s.fig} ${hi ? s.hi : ""}`}
                        style={css({ "--tint": c.tint })}
                        transform={`translate(${t.x} ${t.y}) scale(${t.sx} ${t.sy})`}
                        onMouseEnter={() => setHiCi(i)}
                        onMouseLeave={() => setHiCi(null)}
                        onClick={() => { skipIntro(); if (!(navRef.current.level >= 1 && navRef.current.ci === i)) goCon(i); }}
                      >
                        <ellipse className={s.hit} cx={(b[0] + b[2]) / 2} cy={(b[1] + b[3]) / 2} rx={(b[2] - b[0]) / 2} ry={(b[3] - b[1]) / 2} />
                        {fg.strokes.map((p, j) => (
                          <path key={j} className={`${s.ln} ${p.cls ? s[p.cls] : ""}`} d={p.d} pathLength={1} vectorEffect="non-scaling-stroke" />
                        ))}
                        {fg.dot && <circle className={s.dot} cx={fg.dot[0]} cy={fg.dot[1]} r={fg.dot[2]} />}
                      </g>
                    </g>
                  );
                })}
                {stage.picks.map((it) => {
                  const p = posOf(stage.L, it), R = sizeOf(stage.k, it) / 2;
                  return (
                    <g key={it.cat}>
                      <circle cx={p.x} cy={p.y} r={R * 2.1} fill="url(#door-halo)" className={s.ring} style={{ stroke: "none" }} />
                      {[R + 22, R + 30, R + 44].map((rr, ii) => (
                        <circle key={rr} className={s.ring} cx={p.x} cy={p.y} r={rr} strokeDasharray={ii === 2 ? "1 5" : undefined} />
                      ))}
                    </g>
                  );
                })}
                <path className={s.cut} d={stage.cutD} mask="url(#door-cutmask)" />
              </svg>
            </div>

            {/* centre stage: the hovered star's name, and at rest the tally */}
            <div
              className={s.marquee}
              aria-hidden="true"
              style={css({
                left: stage.vw / 2 - (stage.L.W / 2 - stage.L.marq[0]) * stage.s0,
                top: stage.vh / 2 - (stage.L.H / 2 - stage.L.marq[1]) * stage.s0,
                width: Math.min(stage.vw * 0.94, stage.L.W * stage.s0 * (stage.k === "L" ? 0.46 : 0.96)),
                "--ns": `${Math.max(34, stage.L.W * stage.s0 * stage.L.ns)}px`,
              })}
            >
              <div className={`${s.tally} ${s.sc}`}>{ALL.length} candidates · {CONS.length} constellations · {PICKS} picked</div>
              <div className={s.mName}>
                <div className={s.nm}>{hover?.star.name}</div>
                <div className={`${s.ct} ${s.sc}`}>
                  {hovInfo}
                  {hover?.star.pick && <> · <i>picked</i></>}
                </div>
              </div>
            </div>

            <div ref={camB} className={`${s.cam} ${s.camB}`} style={{ width: stage.L.W, height: stage.L.H }}>
              {hover && (() => {
                const p = posOf(stage.L, hover.star), sz = sizeOf(stage.k, hover.star) * (level === 1 ? 1.15 : 1) * 1.1 + 40;
                return (
                  <div className={`${s.reticle} ${hover.on ? s.on : ""}`} style={{ left: p.x - sz / 2, top: p.y - sz / 2, width: sz, height: sz }}>
                    <svg viewBox="-60 -60 120 120" aria-hidden="true">
                      <circle r={56} fill="none" stroke="var(--al-gold)" strokeWidth={0.8} strokeDasharray="2 4" />
                      {Array.from({ length: 12 }, (_, q) => {
                        const a = q * 30, ra = (a * Math.PI) / 180;
                        return <path key={a} d={`M ${(56 * Math.cos(ra)).toFixed(1)} ${(56 * Math.sin(ra)).toFixed(1)} L ${(61 * Math.cos(ra)).toFixed(1)} ${(61 * Math.sin(ra)).toFixed(1)}`} stroke="var(--al-gold)" strokeWidth={a % 90 ? 0.6 : 1.2} />;
                      })}
                    </svg>
                  </div>
                );
              })()}
              {ALL.map((it, idx) => {
                const p = posOf(stage.L, it), sz = sizeOf(stage.k, it), con = CONS[it.ci];
                const on = level === 0 || navCi === it.ci;
                const order = idx;
                return (
                  <button
                    key={it.cat}
                    ref={(el) => { starEls.current[idx] = el; }}
                    className={`${s.star} ${!on ? s.dim : ""} ${goneStar === it ? s.gone : ""}`}
                    style={css({
                      left: p.x - sz / 2, top: p.y - sz / 2, width: sz, height: sz,
                      "--d": `${(0.75 + order * 0.06 + (it.pick ? 0 : 0.1)).toFixed(2)}s`,
                      "--g": level >= 1 && on ? 1.15 : 1,
                    })}
                    tabIndex={on ? 0 : -1}
                    aria-label={`${it.name}, ${it.cat}, ${con.name}, candidate ${it.i + 1} of ${con.stars.length}${it.pick ? ", picked" : ""}`}
                    onMouseEnter={() => hoverStar(it, true)}
                    onMouseLeave={() => hoverStar(it, false)}
                    onFocus={() => hoverStar(it, true)}
                    onBlur={() => hoverStar(it, false)}
                    onClick={() => { skipIntro(); openItem(it); }}
                  >
                    <Image className={s.pic} src={it.src} alt="" fill sizes="384px" draggable={false} />
                    {it.pick && (<><span className={s.halo} /><span className={s.flare} /><span className={`${s.flare} ${s.v}`} /></>)}
                  </button>
                );
              })}
            </div>

            <div className={s.labs}>
              {stage.labels.map((L, i) => {
                let node = L.node;
                if (L.key.startsWith("s:")) {
                  const it = ALL.find((x) => `s:${x.cat}` === L.key)!;
                  node = (
                    <div className={`${s.slab} ${mateSide(stage, it) > 0 ? s.rt : mateSide(stage, it) < 0 ? s.lf : ""} ${level === 1 && navCi === it.ci ? s.on : ""}`}>
                      <b>{it.name}</b> <span className={it.pick ? s.pk : undefined}>{it.cat}</span>
                    </div>
                  );
                } else if (L.key.startsWith("c:")) {
                  const idx = CONS.findIndex((x) => `c:${x.id}` === L.key);
                  const c = CONS[idx], place = stage.L.t[c.id].lab[2];
                  node = (
                    <button
                      ref={(el) => { clabEls.current[idx] = el; }}
                      className={`${s.clab} ${place ? s[place] : ""}`}
                      style={css({ "--tint": c.tint })}
                      tabIndex={level === 0 ? 0 : -1}
                      aria-label={`${c.name}, ${c.stars.length} candidates, 1 picked. Open constellation.`}
                      onClick={() => { skipIntro(); goCon(idx); }}
                      onMouseEnter={() => setHiCi(idx)}
                      onMouseLeave={() => setHiCi(null)}
                      onFocus={() => setHiCi(idx)}
                      onBlur={() => setHiCi(null)}
                    >
                      <b>{c.name}</b>
                      <span>{c.stars.length}{stage.k === "P" ? " · 1 picked" : " candidates · 1 picked"}</span>
                    </button>
                  );
                }
                return <div key={L.key} ref={(el) => { labEls.current[i] = el; }} className={s.lb}>{node}</div>;
              })}
            </div>
          </>
        )}
      </div>
      <div className={s.vign} />
      <div className={s.grain} />

      <section className={s.l1t} aria-live="polite" style={css({ "--tint": curCon?.tint ?? "var(--al-white)" })}>
        <h2>{level === 1 && hover?.on ? hover.star.name : curCon?.name}</h2>
        <p className={`${s.l1p} ${s.sc}`}>
          {level === 1 && hover?.on ? (
            <>{hovInfo}{hover.star.pick && <> · <i>picked</i></>}</>
          ) : curCon ? (
            <>{curCon.stars.length} candidates · <i>1 picked</i> · {curCon.figure} figure, stylised</>
          ) : null}
        </p>
      </section>

      <footer className={s.foot}>
        <ol className={`${s.meridian} ${s.sc}`} aria-label="Studio steps">
          {STEPS.map((st) => (
            <li key={st} className={st === ON_STEP ? s.on : undefined} aria-current={st === ON_STEP ? "step" : undefined}>
              <i /><span>{st}</span>
            </li>
          ))}
        </ol>
        {slot && <div className={s.slot}>{slot}</div>}
      </footer>

      <button className={`${s.skip} ${s.sc}`} onClick={skipIntro} tabIndex={settled ? -1 : 0}>Skip</button>

      {plate && geo && (
        <Plate
          item={plate.item}
          vw={geo.vw}
          vh={geo.vh}
          reduced={reduced}
          closing={plate.closing}
          instant={plate.instant}
          getOrigin={() => starEls.current[ALL.indexOf(plateRef.current?.item ?? plate.item)]?.getBoundingClientRect() ?? null}
          onClose={() => closePlate()}
          onStep={stepPlate}
          onClosed={() => setPlateBoth(null)}
        />
      )}
      <div className={s.veil} />
    </div>
  );
}
