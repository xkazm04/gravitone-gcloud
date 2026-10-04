"use client";

// LEVEL THREE: THE PLATE. A star's eyepiece circle opens into the picture at
// its real shape, engraved with registration marks. Its motion is the door's
// one composed move (circle to plate, and back), so it is entrance and exit
// only; ← and → step within the constellation, Esc closes.

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CONS, type Star } from "./sky";
import s from "./door.module.css";

const GOLD = "var(--al-gold)";

/** The plate's box: the picture's own aspect, as large as the stage allows. */
export function plateRect(it: Star, vw: number, vh: number) {
  const ar = it.wide ? 1472 / 832 : 4 / 3;
  const small = vw < 760;
  const maxW = small ? vw * 0.9 : vw * 0.66;
  const maxH = small ? vh * 0.5 : vh * 0.62;
  const w = Math.min(maxW, maxH * ar);
  const h = w / ar;
  return { w, h, x: (vw - w) / 2, y: (vh - h) / 2 + (small ? -10 : 14) };
}

/** Double rule, graduated edges and four registration corners. */
function Frame({ w, h }: { w: number; h: number }) {
  const m = 22, W2 = w + m * 2, H2 = h + m * 2;
  const ticks: string[] = [];
  const nt = Math.round(w / 24);
  for (let i = 0; i <= nt; i++) {
    const x = m + (i * w) / nt, L = i % 5 ? 3 : 7;
    ticks.push(`M ${x.toFixed(1)} ${m - 12} v ${-L} M ${x.toFixed(1)} ${m + h + 12} v ${L}`);
  }
  const nv = Math.round(h / 24);
  for (let i = 0; i <= nv; i++) {
    const y = m + (i * h) / nv, L = i % 5 ? 3 : 7;
    ticks.push(`M ${m - 12} ${y.toFixed(1)} h ${-L} M ${m + w + 12} ${y.toFixed(1)} h ${L}`);
  }
  const corners: [number, number][] = [[m - 7, m - 7], [m + w + 7, m - 7], [m - 7, m + h + 7], [m + w + 7, m + h + 7]];
  return (
    <svg viewBox={`0 0 ${W2} ${H2}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x={m - 7} y={m - 7} width={w + 14} height={h + 14} fill="none" stroke={GOLD} strokeOpacity={0.75} strokeWidth={1} />
      <rect x={m - 12} y={m - 12} width={w + 24} height={h + 24} fill="none" stroke={GOLD} strokeOpacity={0.3} strokeWidth={0.7} />
      <path d={ticks.join(" ")} stroke={GOLD} strokeOpacity={0.5} strokeWidth={0.7} fill="none" />
      {corners.map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={9} fill="var(--al-night)" stroke={GOLD} strokeWidth={1} />
          <path d={`M ${cx - 14} ${cy} h 28 M ${cx} ${cy - 14} v 28`} stroke={GOLD} strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={2} fill="var(--al-ald)" />
        </g>
      ))}
    </svg>
  );
}

export interface PlateProps {
  item: Star;
  vw: number;
  vh: number;
  reduced: boolean;
  closing: boolean;
  /** Close without the flight back (the crumb to Sky). */
  instant: boolean;
  /** Where the star's eyepiece is on screen right now. */
  getOrigin: () => DOMRect | null;
  onClose: () => void;
  onStep: (dir: -1 | 1) => void;
  /** The close animation has finished; unmount. */
  onClosed: () => void;
}

const FLIGHT = "cubic-bezier(.2,.7,.1,1)";

export function Plate({ item, vw, vh, reduced, closing, instant, getOrigin, onClose, onStep, onClosed }: PlateProps) {
  const imgw = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);
  // The picture on screen lags `item` by one crossfade when stepping.
  const [face, setFace] = useState(item);
  const R = plateRect(face, vw, vh);
  const small = vw < 760;
  const con = CONS[face.ci];
  const n = con.stars.length;
  const prev = con.stars[(face.i - 1 + n) % n];
  const next = con.stars[(face.i + 1) % n];

  // Opening: the circle at the star's own place, then out to the plate.
  useLayoutEffect(() => {
    const el = imgw.current;
    const o = getOrigin();
    if (!el || reduced || !o) {
      setShown(true);
      return;
    }
    const r = plateRect(item, vw, vh), d = o.width;
    el.style.transition = "none";
    el.style.transform = `translate(${o.left + d / 2 - (r.x + r.w / 2)}px,${o.top + d / 2 - (r.y + r.h / 2)}px) scale(${d / r.h})`;
    el.style.clipPath = `circle(${r.h / 2}px at 50% 50%)`;
    void el.offsetWidth;
    const raf = requestAnimationFrame(() => {
      el.style.transition = `transform .85s ${FLIGHT}, clip-path .85s ${FLIGHT}`;
      el.style.transform = "none";
      el.style.clipPath = `circle(${Math.hypot(r.w, r.h) / 2 + 2}px at 50% 50%)`;
      setShown(true);
    });
    const t = setTimeout(() => { el.style.clipPath = "none"; }, 900);
    const f = setTimeout(() => closeBtn.current?.focus({ preventScroll: true }), 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); clearTimeout(f); };
    // mount only: the flight starts from where the star was when it opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stepping: fade the picture, swap it, fade back.
  useEffect(() => {
    if (item === face) return;
    const t = setTimeout(() => setFace(item), reduced ? 0 : 220);
    return () => clearTimeout(t);
  }, [item, face, reduced]);

  // Closing: back into the eyepiece, then unmount.
  useEffect(() => {
    if (!closing) return;
    const el = imgw.current, o = getOrigin();
    if (!el || reduced || instant || !o) {
      onClosed();
      return;
    }
    const r = plateRect(face, vw, vh), d = o.width;
    el.style.transition = "none";
    el.style.clipPath = `circle(${Math.hypot(r.w, r.h) / 2 + 2}px at 50% 50%)`;
    void el.offsetWidth;
    el.style.transition = `transform .7s ${FLIGHT}, clip-path .7s ${FLIGHT}`;
    el.style.transform = `translate(${o.left + d / 2 - (r.x + r.w / 2)}px,${o.top + d / 2 - (r.y + r.h / 2)}px) scale(${d / r.h})`;
    el.style.clipPath = `circle(${r.h / 2}px at 50% 50%)`;
    const t = setTimeout(onClosed, 720);
    return () => clearTimeout(t);
    // closing flips once; the rest is read at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  return (
    <div
      className={`${s.plate} ${s.open} ${shown && !closing ? s.shown : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${face.name}, plate`}
    >
      <div className={s.pback} onClick={onClose} />
      <div className={s.pbox} style={{ left: R.x, top: R.y, width: R.w, height: R.h }}>
        <div className={s.pframe}><Frame w={R.w} h={R.h} /></div>
        <div ref={imgw} className={s.pimgw}>
          <Image
            src={face.src}
            alt={`${face.name}, ${con.name}, real output`}
            fill
            sizes="(max-width: 760px) 90vw, 66vw"
            style={{ opacity: item === face ? 1 : 0 }}
            draggable={false}
          />
        </div>
        <div className={s.pmeta} style={{ top: -58 }}>
          <span className={`${s.sc} ${s.pslug}`}>
            {face.cat} · {con.name} · candidate {face.i + 1} of {n}
            {face.pick && <> · <i>picked</i></>}
          </span>
          <button ref={closeBtn} className={`${s.sc} ${s.pclose}`} onClick={onClose}>
            Constellation <kbd className={s.kbd}>Esc</kbd>
          </button>
        </div>
        <div className={s.pmeta} style={{ bottom: small ? -64 : -74 }}>
          <span className={s.pname}>{face.name}</span>
        </div>
        <button
          className={`${s.parrow} ${s.pprev}`}
          style={small ? { left: 0, bottom: -128, top: "auto" } : { left: -92 }}
          aria-label={`Previous: ${prev.name}`}
          onClick={() => onStep(-1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12.5 3.5 L6 10 L12.5 16.5" fill="none" stroke="currentColor" strokeWidth={1.4} />
            <circle cx={6} cy={10} r={1.4} fill="currentColor" />
          </svg>
          <span className={`${s.nb} ${s.sc}`}>{prev.name}</span>
        </button>
        <button
          className={`${s.parrow} ${s.pnext}`}
          style={small ? { right: 0, bottom: -128, top: "auto" } : { right: -92 }}
          aria-label={`Next: ${next.name}`}
          onClick={() => onStep(1)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.5 3.5 L14 10 L7.5 16.5" fill="none" stroke="currentColor" strokeWidth={1.4} />
            <circle cx={14} cy={10} r={1.4} fill="currentColor" />
          </svg>
          <span className={`${s.nb} ${s.sc}`}>{next.name}</span>
        </button>
      </div>
    </div>
  );
}
