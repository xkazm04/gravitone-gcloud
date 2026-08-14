"use client";

// Shared leaves for Frames.
//
// FrameCanvas is the important one: it is the only place the three layers are
// composited, and now also the only place they are MOVED. Read-only by default;
// pass `edit` and it becomes a compositor.
//
// Coordinates are percentages of the frame everywhere — texts as CSS left/top,
// elements scaled into the SVG's own viewBox. One unit system, so a layer that
// reads x=50 sits at the same place whichever kind it is.

import { useCallback, useRef } from "react";

import type { Frame, FrameElement, FrameText, LayerRef } from "./frames";

/** The SVG's vertical extent. 100 wide × 56 tall is 16:9, so an x and a y in
 *  percent land where the eye expects rather than being squashed. */
const VB_H = 56;

export interface CanvasEdit {
  selected: LayerRef;
  onSelect: (ref: LayerRef) => void;
  onMove: (ref: NonNullable<LayerRef>, x: number, y: number) => void;
  onResize: (elId: string, w: number, h: number) => void;
}

export function FrameCanvas({
  frame,
  show = { plate: true, elements: true, texts: true },
  className = "",
  edit,
}: {
  frame: Frame;
  show?: { plate: boolean; elements: boolean; texts: boolean };
  className?: string;
  edit?: CanvasEdit;
}) {
  const box = useRef<HTMLDivElement>(null);

  /** Pointer → percent of the frame. The rect is read per drag rather than
   *  cached: the row this canvas sits in expands and collapses, and a stale
   *  rect puts every layer somewhere the user did not click. */
  const pctOf = useCallback((e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent, ref: NonNullable<LayerRef>, originX: number, originY: number) => {
      if (!edit) return;
      e.preventDefault();
      e.stopPropagation();
      edit.onSelect(ref);
      const start = pctOf(e);
      if (!start) return;
      const offX = start.x - originX;
      const offY = start.y - originY;

      const el = e.currentTarget as Element;
      el.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        edit.onMove(
          ref,
          ((ev.clientX - r.left) / r.width) * 100 - offX,
          ((ev.clientY - r.top) / r.height) * 100 - offY,
        );
      };
      const up = () => {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener("pointermove", move as EventListener);
        el.removeEventListener("pointerup", up as EventListener);
      };
      el.addEventListener("pointermove", move as EventListener);
      el.addEventListener("pointerup", up as EventListener);
    },
    [edit, pctOf],
  );

  const sel = edit?.selected;
  const isSel = (type: "element" | "text", id: string) => sel?.type === type && sel.id === id;

  return (
    <div
      ref={box}
      onPointerDown={() => edit?.onSelect(null)}
      className={`relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-slate-950 ${
        edit ? "cursor-default select-none" : ""
      } ${className}`}
    >
      {show.plate && frame.plate.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL from a
        // just-generated buffer; next/image optimises files, not blobs.
        <img src={frame.plate.src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent)]" aria-hidden />
      )}

      {show.elements && (
        <svg viewBox={`0 0 100 ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {frame.elements.map((el) =>
            el.hidden ? null : (
              <g
                key={el.id}
                onPointerDown={edit ? (e) => startDrag(e, { type: "element", id: el.id }, el.x, el.y) : undefined}
                className={edit ? "cursor-move" : ""}
                // The hit area is the mark itself, which for a hairline arrow is
                // a few pixels — so a transparent box sits behind it while
                // editing, or the layer is effectively undraggable.
              >
                {edit && (
                  <rect
                    x={el.x}
                    y={(el.y / 100) * VB_H}
                    width={el.w}
                    height={(el.h / 100) * VB_H}
                    fill="transparent"
                    stroke={isSel("element", el.id) ? "var(--gt-accent-cyan)" : "transparent"}
                    strokeWidth={0.4}
                    strokeDasharray="1.5 1"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <ElementMark el={el} />
              </g>
            ),
          )}
        </svg>
      )}

      {show.texts &&
        frame.texts.map((t) =>
          t.hidden ? null : (
            <TextMark
              key={t.id}
              t={t}
              selected={isSel("text", t.id)}
              onPointerDown={edit ? (e) => startDrag(e, { type: "text", id: t.id }, t.x, t.y) : undefined}
              editing={Boolean(edit)}
            />
          ),
        )}

      {/* Resize lives outside the SVG so it is a constant on-screen size rather
          than scaling with the element it resizes. */}
      {edit && sel?.type === "element" && (
        <ResizeHandle frame={frame} elId={sel.id} onResize={edit.onResize} box={box} />
      )}

      {frame.plate.state === "generating" && (
        <div className="absolute inset-0 animate-pulse bg-white/[0.04]" aria-hidden />
      )}
      {frame.plate.state === "refused" && (
        <p className="font-jetbrains absolute inset-x-2 bottom-2 rounded bg-rose-500/85 px-2 py-1 text-[10px] text-slate-950">
          refused — change the subject, not the seed
        </p>
      )}
    </div>
  );
}

function ResizeHandle({
  frame,
  elId,
  onResize,
  box,
}: {
  frame: Frame;
  elId: string;
  onResize: (elId: string, w: number, h: number) => void;
  box: React.RefObject<HTMLDivElement | null>;
}) {
  const el = frame.elements.find((e) => e.id === elId);
  if (!el || el.hidden) return null;

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      onResize(elId, ((ev.clientX - r.left) / r.width) * 100 - el.x, ((ev.clientY - r.top) / r.height) * 100 - el.y);
    };
    const up = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", up as EventListener);
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", up as EventListener);
  };

  return (
    <span
      onPointerDown={down}
      role="slider"
      aria-label="Resize element"
      aria-valuenow={Math.round(el.w)}
      tabIndex={0}
      style={{ left: `${el.x + el.w}%`, top: `${el.y + el.h}%` }}
      className="absolute -ml-1.5 -mt-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-slate-950 bg-cyan-300"
    />
  );
}

function ElementMark({ el }: { el: FrameElement }) {
  const stroke = el.accent ? "var(--gt-accent-cyan)" : "rgba(255,255,255,0.85)";
  const x = el.x;
  const y = (el.y / 100) * VB_H;
  const w = el.w;
  const h = (el.h / 100) * VB_H;

  switch (el.kind) {
    case "arrow":
      return (
        <g stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round">
          <path d={`M${x} ${y + h / 2} L${x + w} ${y + h / 2}`} />
          <path d={`M${x + w - 3} ${y + h / 2 - 2.4} L${x + w} ${y + h / 2} L${x + w - 3} ${y + h / 2 + 2.4}`} />
        </g>
      );
    case "bar":
      return (
        <g fill={stroke} opacity={0.9}>
          <rect x={x} y={y + h * 0.45} width={w * 0.24} height={h * 0.55} />
          <rect x={x + w * 0.38} y={y + h * 0.2} width={w * 0.24} height={h * 0.8} />
          <rect x={x + w * 0.76} y={y} width={w * 0.24} height={h} />
        </g>
      );
    case "bracket":
      return <path d={`M${x + w} ${y} L${x} ${y} L${x} ${y + h} L${x + w} ${y + h}`} stroke={stroke} strokeWidth={1.2} fill="none" />;
    case "rule":
      return <line x1={x} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={0.8} />;
    case "marker":
      return <circle cx={x} cy={y} r={1.8} fill={stroke} />;
    case "loop":
      return (
        <g stroke={stroke} strokeWidth={1.4} fill="none">
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2} strokeDasharray="6 3" />
        </g>
      );
  }
}

const TEXT_CLASS: Record<FrameText["role"], string> = {
  kicker: "font-jetbrains text-[9px] uppercase tracking-[0.18em] text-cyan-200",
  caption: "font-hanken text-[11px] text-white",
  figure: "font-instrument text-[26px] leading-none text-white",
  label: "font-jetbrains text-[9px] text-white/70",
};

function TextMark({
  t,
  selected,
  onPointerDown,
  editing,
}: {
  t: FrameText;
  selected: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  editing: boolean;
}) {
  return (
    <span
      onPointerDown={onPointerDown}
      style={{ left: `${t.x}%`, top: `${t.y}%` }}
      className={`absolute max-w-[52%] ${TEXT_CLASS[t.role]} ${
        editing ? "cursor-move rounded-sm px-0.5 outline-dashed outline-1 outline-transparent hover:outline-white/30" : ""
      } ${selected ? "outline-cyan-300/80" : ""}`}
    >
      {t.value}
      {/* A figure with no fact behind it is the defect this step exists to
          prevent, so it is marked on the canvas rather than in a side panel. */}
      {t.role === "figure" && !t.factId && (
        <span className="ml-1 align-super text-[8px] text-amber-300" title="not bound to a notebook fact">
          ●
        </span>
      )}
    </span>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────────── */

const KIND_TONE: Record<string, string> = {
  hook: "text-cyan-200 border-cyan-400/35",
  turn: "text-amber-200 border-amber-300/35",
  steelman: "text-violet-200 border-violet-300/35",
  close: "text-emerald-200 border-emerald-300/35",
};

export function KindChip({ kind }: { kind: string }) {
  return (
    <span
      className={`font-jetbrains rounded-full border px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase ${
        KIND_TONE[kind] ?? "border-white/15 text-white/50"
      }`}
    >
      {kind}
    </span>
  );
}

export function LayerBreakdown({ frame, compact = false }: { frame: Frame; compact?: boolean }) {
  const bits = [
    { label: "plate", n: frame.plate.state === "ready" ? 1 : 0, total: 1 },
    // The clip's dot means AUTHORED, not rendered — nothing in this app can
    // render one. Every other dot here means "exists"; this one means "someone
    // said what it does", which is the only claim the step can honestly make.
    { label: "clip", n: frame.clip?.motion.trim() ? 1 : 0, total: 1 },
    { label: "elements", n: frame.elements.length, total: frame.elements.length },
    { label: "texts", n: frame.texts.length, total: frame.texts.length },
  ];
  return (
    <div className={`font-jetbrains flex items-center ${compact ? "gap-2" : "gap-3"} text-[10px]`}>
      {bits.map((b) => (
        <span key={b.label} className={b.n ? "text-white/70" : "text-white/25"}>
          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${b.n ? "bg-cyan-300" : "bg-white/20"}`} />
          {b.label}
          {b.total > 1 && ` ${b.n}`}
        </span>
      ))}
    </div>
  );
}
