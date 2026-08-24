"use client";

// THE WALL — the cut as index cards pinned to one vast production wall.
//
// The assembly ledger reads DOWN a table and answers "what is not done". This
// answers a different question — "what does the WHOLE cut look like right now" —
// and it answers it by making the CAMERA the navigation. Every scene is a
// column pinned to one surface; you pan and zoom over it. Nothing scrolls,
// because a wall does not scroll: zoomed out it is a status mosaic read in a
// single glance, zoomed in it is a working surface with real plates.
//
// Layout is pure arithmetic — no measuring, no observers on cells — which is
// what keeps it honest at 112 columns: from tx/ty/scale alone we know exactly
// which column indices can be on screen, and below `CHEAP` scale the cells stop
// being pictures and become tone blocks. Semantic zoom, not just smaller cards.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2, Maximize2, Minus, Plus, Trash2 } from "lucide-react";

import type { AltsColumn, AltsCtl } from "./alts";
import { FrameCanvas, KindChip } from "../parts";

/* ── Wall geometry. Every position on the wall derives from these. ────────── */
const W = 260;
const G = 24;
const STRIDE = W + G;
const HH = 56;
const CH = (260 * 9) / 16 + 28; // thumb + meta strip
const CGAP = 12;
const OVERSCAN = 2;
const MIN_S = 0.04;
const MAX_S = 1.4;
const CHEAP = 0.3; // below this the wall renders tone, not pictures
const PAD = 48;
const MM_W = 180;

/** Alternatives differ only in their plate — the overlays are identical across
 *  a scene, so drawing them here would only add ink. */
const PLATE_ONLY = { plate: true, elements: false, texts: false };

const colH = (c: AltsColumn) => HH + (c.alts.length + 1) * (CH + CGAP);
const rowY = (r: number) => HH + r * (CH + CGAP);
const clampS = (v: number) => Math.min(MAX_S, Math.max(MIN_S, v));

interface Cam {
  tx: number;
  ty: number;
  s: number;
}

/* ── The camera ───────────────────────────────────────────────────────────── */

function useCamera(count: number, world: { w: number; h: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam>({ tx: 0, ty: 0, s: 0.5 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!vp.w || !vp.h) return;
    const s = clampS(Math.min((vp.w - PAD * 2) / world.w, (vp.h - PAD * 2) / world.h));
    setCam({ s, tx: (vp.w - world.w * s) / 2, ty: (vp.h - world.h * s) / 2 });
  }, [vp.w, vp.h, world.w, world.h]);

  // Re-fit on mount, on resize, and when the column count changes (the stress
  // toggle) — but NOT when a scene merely grows an alternative, which changes
  // the world height and would otherwise yank the camera out from under a user
  // who just clicked generate.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    fitRef.current();
  }, [count, vp.w, vp.h]);

  const zoomAt = useCallback((mx: number, my: number, factor: number) => {
    setCam((c) => {
      const s = clampS(c.s * factor);
      const k = s / c.s;
      return { s, tx: mx - (mx - c.tx) * k, ty: my - (my - c.ty) * k };
    });
  }, []);

  // Non-passive, or the browser scrolls the page out from under the wall.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const zoomCenter = useCallback((f: number) => zoomAt(vp.w / 2, vp.h / 2, f), [zoomAt, vp.w, vp.h]);

  /** True once the current pointer gesture has travelled far enough to be a pan
   *  — read by every cell, so a drag that ends over a card is not a click. */
  const dragged = useRef(false);

  const startPan = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    dragged.current = false;
    const ox = e.clientX;
    const oy = e.clientY;
    let last = { x: ox, y: oy };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      if (Math.abs(ev.clientX - ox) > 4 || Math.abs(ev.clientY - oy) > 4) dragged.current = true;
      setCam((c) => ({ ...c, tx: c.tx + dx, ty: c.ty + dy }));
    };
    const up = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up as EventListener);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up as EventListener);
  }, []);

  /** Put a world point at the centre of the viewport. */
  const lookAt = useCallback(
    (wx: number, wy: number) => setCam((c) => ({ ...c, tx: vp.w / 2 - wx * c.s, ty: vp.h / 2 - wy * c.s })),
    [vp.w, vp.h],
  );

  return { box, vp, cam, fit, zoomCenter, startPan, dragged, lookAt };
}

/* ── The wall ─────────────────────────────────────────────────────────────── */

export default function VariantWall({ alts }: { alts: AltsCtl }) {
  const cols = alts.columns;
  const world = useMemo(
    () => ({
      w: Math.max(W, cols.length * STRIDE - G),
      h: Math.max(HH + CH + CGAP, ...cols.map(colH)),
    }),
    [cols],
  );
  const { box, vp, cam, fit, zoomCenter, startPan, dragged, lookAt } = useCamera(cols.length, world);

  const first = Math.max(0, Math.floor(-cam.tx / cam.s / STRIDE) - OVERSCAN);
  const last = Math.min(cols.length - 1, Math.ceil((vp.w - cam.tx) / cam.s / STRIDE) + OVERSCAN);
  const cheap = cam.s < CHEAP;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "0") fit();
    else if (e.key === "+" || e.key === "=") zoomCenter(1.25);
    else if (e.key === "-" || e.key === "_") zoomCenter(0.8);
    else return;
    e.preventDefault();
  };

  const kept = cols.reduce((n, c) => n + c.alts.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-jetbrains text-[12px] text-white/50">
          {kept} kept alternative{kept === 1 ? "" : "s"}
          {alts.altCost > 0 && <span className="text-white/30"> · ${alts.altCost.toFixed(3)} beyond the cut</span>}
          <span className="text-white/30"> · drag to pan, wheel to zoom</span>
        </p>
        <label className="font-jetbrains flex items-center gap-2 text-[10px] tracking-[0.12em] text-white/35 uppercase">
          <input
            type="checkbox"
            checked={alts.stress}
            onChange={(e) => alts.setStress(e.target.checked)}
            className="accent-cyan-400"
          />
          stress ×7
        </label>
      </div>

      {alts.error && (
        <p className="font-hanken rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
          {alts.error}
        </p>
      )}

      <div
        ref={box}
        onPointerDown={startPan}
        onKeyDown={onKey}
        tabIndex={0}
        style={{ touchAction: "none" }}
        className="relative h-[72vh] cursor-grab overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] outline-none active:cursor-grabbing"
      >
        <div
          style={{
            transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
            transformOrigin: "0 0",
            willChange: "transform",
            width: world.w,
            height: world.h,
          }}
          className="absolute top-0 left-0"
        >
          {cols.slice(first, last + 1).map((col, n) => {
            const i = first + n;
            return cheap ? (
              <CheapColumn key={col.frame.id} col={col} x={i * STRIDE} busy={alts.busy.has(col.frame.id)} />
            ) : (
              <WallColumn
                key={col.frame.id}
                col={col}
                x={i * STRIDE}
                busy={alts.busy.has(col.frame.id)}
                dragged={dragged}
                alts={alts}
              />
            );
          })}
        </div>

        {/* Toolbar — the camera's own controls, and the only HUD on the wall. */}
        <div className="absolute top-3 right-3 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/80 px-2 py-1.5 backdrop-blur">
          <span className="font-jetbrains px-1 text-[10px] text-white/30">
            zoom {Math.round(cam.s * 100)}% · {cols.length} scenes
          </span>
          <CamButton label="zoom out" onClick={() => zoomCenter(0.8)}>
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </CamButton>
          <CamButton label="zoom in" onClick={() => zoomCenter(1.25)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </CamButton>
          <CamButton label="fit the wall" onClick={fit}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </CamButton>
        </div>

        <Minimap cols={cols} world={world} cam={cam} vp={vp} onJump={lookAt} />

        {!alts.loaded && (
          <p className="font-jetbrains absolute inset-x-0 top-1/2 text-center text-[11px] tracking-[0.18em] text-white/30 uppercase">
            loading the wall
          </p>
        )}
      </div>
    </div>
  );
}

function CamButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className="rounded-lg border border-white/10 p-1 text-white/60 transition hover:border-cyan-400/35 hover:text-cyan-100"
    >
      {children}
    </button>
  );
}

/* ── A column, at working zoom ────────────────────────────────────────────── */

function WallColumn({
  col,
  x,
  busy,
  dragged,
  alts,
}: {
  col: AltsColumn;
  x: number;
  busy: boolean;
  dragged: React.RefObject<boolean>;
  alts: AltsCtl;
}) {
  const id = col.frame.id;
  const guard = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dragged.current) fn();
  };

  return (
    <div style={{ left: x, top: 0, width: W, height: colH(col) }} className="absolute">
      <div style={{ height: HH }} className="flex flex-col justify-center gap-1 px-1">
        <div className="flex items-center gap-2">
          <span className="font-jetbrains text-[10px] tracking-[0.12em] text-white/35 uppercase">{col.frame.at}</span>
          <KindChip kind={col.frame.kind} />
          {col.synthetic && (
            <span className="font-jetbrains text-[10px] tracking-[0.12em] text-white/25 uppercase">synth</span>
          )}
        </div>
        <p className="font-hanken truncate text-[12px] text-white/70">{col.frame.title}</p>
      </div>

      {col.alts.map((alt, r) => {
        const active = alt.id === col.activeId;
        return (
          <div
            key={alt.id}
            style={{ top: rowY(r), height: CH, width: W }}
            onClick={guard(() => alts.select(id, alt.id))}
            className={`group absolute left-0 cursor-pointer overflow-hidden rounded-xl border bg-white/[0.02] transition ${
              active ? "border-cyan-400/50 ring-1 ring-cyan-400/40" : "border-white/8 hover:border-white/20"
            }`}
          >
            <FrameCanvas frame={{ ...col.frame, plate: alt.plate }} show={PLATE_ONLY} className="rounded-none border-0" />
            <div className="flex h-7 items-center justify-between px-2">
              <span
                className={`font-jetbrains text-[10px] tracking-[0.12em] uppercase ${
                  active ? "text-cyan-100" : "text-white/35"
                }`}
              >
                {active ? "in the cut" : (alt.plate.model ?? "kept")}
              </span>
              <button
                onClick={guard(() => alts.remove(id, alt.id))}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Discard this alternative"
                className="rounded p-0.5 text-white/0 transition group-hover:text-white/40 hover:!text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        );
      })}

      <button
        style={{ top: rowY(col.alts.length), height: CH, width: W }}
        onClick={guard(() => void alts.generate(id))}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={busy}
        className="font-jetbrains absolute left-0 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-[11px] tracking-[0.12em] text-white/35 uppercase transition hover:border-cyan-400/35 hover:text-cyan-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
        {busy ? "generating" : "alternative"}
      </button>
    </div>
  );
}

/* ── A column, below CHEAP — tone only, no images, no canvas ──────────────── */

function CheapColumn({ col, x, busy }: { col: AltsColumn; x: number; busy: boolean }) {
  return (
    <div style={{ left: x, top: 0, width: W, height: colH(col) }} className="absolute">
      <div style={{ top: HH - 22, height: 14, width: W }} className="absolute rounded-sm bg-white/12" />
      {col.alts.map((alt, r) => (
        <div
          key={alt.id}
          style={{ top: rowY(r), height: CH, width: W }}
          className={`absolute rounded-lg ${alt.id === col.activeId ? "bg-cyan-400/30" : "bg-white/[0.06]"}`}
        />
      ))}
      <div
        style={{ top: rowY(col.alts.length), height: CH, width: W }}
        className={`absolute rounded-lg border border-dashed border-white/10 ${busy ? "animate-pulse bg-amber-300/30" : ""}`}
      />
    </div>
  );
}

/* ── Minimap ──────────────────────────────────────────────────────────────── */

function Minimap({
  cols,
  world,
  cam,
  vp,
  onJump,
}: {
  cols: AltsColumn[];
  world: { w: number; h: number };
  cam: Cam;
  vp: { w: number; h: number };
  onJump: (wx: number, wy: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const m = Math.min(MM_W / world.w, 108 / world.h);

  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const at = (cx: number, cy: number) => {
      const r = ref.current?.getBoundingClientRect();
      if (r) onJump((cx - r.left) / m, (cy - r.top) / m);
    };
    at(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => at(ev.clientX, ev.clientY);
    const up = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up as EventListener);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up as EventListener);
  };

  return (
    <div
      ref={ref}
      onPointerDown={down}
      style={{ width: world.w * m, height: world.h * m }}
      className="absolute right-3 bottom-3 cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-slate-950/80 backdrop-blur"
    >
      {cols.map((c, i) => (
        <div
          key={c.frame.id}
          style={{ left: i * STRIDE * m, top: 0, width: Math.max(1, W * m), height: colH(c) * m }}
          className={`absolute rounded-[1px] ${c.alts.length ? "bg-cyan-400/40" : "bg-white/10"}`}
        />
      ))}
      {/* Where the camera is looking, in wall coordinates. */}
      <div
        style={{
          left: (-cam.tx / cam.s) * m,
          top: (-cam.ty / cam.s) * m,
          width: (vp.w / cam.s) * m,
          height: (vp.h / cam.s) * m,
        }}
        className="absolute border border-cyan-300/80 bg-cyan-300/5"
      />
    </div>
  );
}
