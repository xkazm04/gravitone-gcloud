"use client";

// THE ONE CLOCK the score and the cut draw (lib/cut/deriveTimeline.ts: one picture, one ruler).
// v1 drew it twice (ScoreSpotting's lanes, the Cut's Lanes.tsx) and both squeezed thirty scenes
// into slivers (INVENTORY §7.5). Here the scale is chosen so a TYPICAL scene gets a readable cell
// (the median scene at least a thumb wide), the lane scrolls sideways instead of squeezing, and
// zoom multiplies that scale. A scene narrower than a cell still draws - by its index - never as
// an unreadable hairline of text.
//
// A block may be draggable (the score's music spans): its edges trim, its body moves, and the
// drop snaps to scene marks - the cue's span IS its first and last scene, so the drop is one op.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";

import type { SceneView } from "@gt/domain/partView";
import { cx } from "@gt/ui/components/cx.ts";
import { clock } from "@gt/ui/components/part/part.ts";
import { tokens } from "@gt/ui/tokens";

import s from "./Cut.module.css";

export type ClockBlock = {
  readonly id: string;
  readonly startS: number;
  readonly durS: number;
  readonly label: string;
  readonly look: "ok" | "missing" | "drift" | "proposed";
  /** Spoken with the block: the reason it is missing, the line it carries. */
  readonly title?: string;
};
export type ClockLane = { readonly id: string; readonly label: string; readonly blocks: readonly ClockBlock[]; readonly drag?: boolean };

/** A drop: the scenes a dragged block now spans, by index into `scenes`. */
export type Drop = { readonly blockId: string; readonly first: number; readonly last: number };

const CELL = Number.parseFloat(tokens["w-thumb"]);
/** The lane label's column (Cut.module.css .clock padding: w-timecode + sp-5). */
const LABEL = Number.parseFloat(tokens["w-timecode"]) + Number.parseFloat(tokens["sp-5"]);
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

/** Seconds per ruler tick so ticks sit at least two cells apart. */
const tickOf = (pps: number): number => STEPS.find((x) => x * pps >= CELL * 2) ?? 600;

function median(xs: readonly number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  return v.length === 0 ? 1 : (v[Math.floor(v.length / 2)] ?? 1);
}

/** The index of the scene whose start is nearest `t` (a drop snaps to scene marks). */
function nearestStart(scenes: readonly SceneView[], t: number): number {
  let best = 0;
  scenes.forEach((x, i) => {
    if (Math.abs(x.startS - t) < Math.abs((scenes[best]?.startS ?? 0) - t)) best = i;
  });
  return best;
}
function nearestEnd(scenes: readonly SceneView[], t: number): number {
  let best = 0;
  scenes.forEach((x, i) => {
    const b = scenes[best];
    if (b !== undefined && Math.abs(x.startS + x.durS - t) < Math.abs(b.startS + b.durS - t)) best = i;
  });
  return best;
}
const sceneAt = (scenes: readonly SceneView[], t: number): number => {
  const i = scenes.findIndex((x) => t >= x.startS && t < x.startS + x.durS);
  return i < 0 ? scenes.length - 1 : i;
};

type Drag = { readonly blockId: string; readonly kind: "start" | "end" | "move"; readonly x0: number; readonly first: number; readonly last: number; readonly dx: number };

export function CutClock({
  label,
  totalS,
  scenes,
  lanes,
  zoom,
  t,
  selected,
  marks = [],
  onSeek,
  onSelect,
  onDrop,
  pictureLabel = "picture",
  sceneLane = true,
}: {
  readonly label: string;
  readonly totalS: number;
  readonly scenes: readonly SceneView[];
  readonly lanes: readonly ClockLane[];
  readonly zoom: number;
  readonly t: number | null;
  readonly selected: string | null;
  readonly marks?: readonly { readonly atS: number; readonly label: string }[];
  readonly onSeek?: (t: number) => void;
  readonly onSelect: (blockId: string) => void;
  readonly onDrop?: (d: Drop) => void;
  readonly pictureLabel?: string;
  /** The scene cells as their own lane (the score); the cut draws its picture blocks instead. */
  readonly sceneLane?: boolean;
}): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fit = totalS > 0 && width > 0 ? (width - LABEL) / totalS : 1;
  // 0 = the whole film in view; otherwise the median scene gets a readable cell, never more than
  // four screens of film at 1x, and zoom multiplies that.
  const pps = zoom === 0 ? fit : Math.min(fit * 4, Math.max(fit, CELL / Math.max(0.1, median(scenes.map((x) => x.durS))))) * zoom;
  const W = Math.max(width - LABEL, totalS * pps);
  // Keep the needle and the selection in view: a lane wider than its region scrolls to them.
  useEffect(() => {
    const el = box.current;
    if (el === null || t === null) return;
    const nx = t * pps + LABEL;
    if (nx < el.scrollLeft + LABEL || nx > el.scrollLeft + el.clientWidth - CELL) el.scrollLeft = Math.max(0, nx - LABEL - CELL);
  }, [t, pps]);
  useEffect(() => {
    if (selected === null) return;
    box.current?.querySelector(`[data-block="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  const tick = tickOf(pps);
  const ticks = Array.from({ length: Math.floor(totalS / tick) + 1 }, (_, i) => i * tick);
  const x = (sec: number): number => sec * pps;

  const seekAt = (e: RPointerEvent<HTMLDivElement>): void => {
    if (onSeek === undefined) return;
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(totalS, (e.clientX - r.left) / pps)));
  };

  const start = (b: ClockBlock, kind: Drag["kind"], e: RPointerEvent<HTMLElement>): void => {
    if (onDrop === undefined || scenes.length === 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(b.id);
    setDrag({ blockId: b.id, kind, x0: e.clientX, first: sceneAt(scenes, b.startS + 0.001), last: sceneAt(scenes, b.startS + b.durS - 0.001), dx: 0 });
  };
  /** The scenes the drag spans now, snapped to scene marks. */
  const span = (d: Drag): { first: number; last: number } => {
    const dt = d.dx / pps;
    const s0 = scenes[d.first]?.startS ?? 0;
    const e0 = (scenes[d.last]?.startS ?? 0) + (scenes[d.last]?.durS ?? 0);
    if (d.kind === "move") {
      const n = nearestStart(scenes, s0 + dt) - d.first;
      const shift = Math.max(-d.first, Math.min(scenes.length - 1 - d.last, n));
      return { first: d.first + shift, last: d.last + shift };
    }
    if (d.kind === "start") return { first: Math.min(d.last, nearestStart(scenes, s0 + dt)), last: d.last };
    return { first: d.first, last: Math.max(d.first, nearestEnd(scenes, e0 + dt)) };
  };
  const ghost = drag === null ? null : span(drag);

  return (
    <div className={s.clockWrap} ref={box}>
      <div className={s.clock} style={{ width: W }} role="group" aria-label={label}>
        <div className={s.ruler} onPointerDown={seekAt} aria-hidden="true">
          {ticks.map((tk) => (
            <span key={tk} className={s.tick} style={{ left: x(tk) }}>
              {clock(tk)}
            </span>
          ))}
          {marks.map((m) => (
            <span key={m.label} className={s.mark} style={{ left: x(m.atS) }}>
              {m.label}
            </span>
          ))}
        </div>
        {sceneLane && <div className={s.lane} aria-label={pictureLabel}>
          <span className={s.laneLabel}>{pictureLabel}</span>
          {scenes.map((sc) => {
            const w = x(sc.durS);
            return (
              <span key={sc.id} className={s.scene} style={{ left: x(sc.startS), width: w }} title={`${sc.index} · ${sc.label}`}>
                {w >= CELL ? `${sc.index} · ${sc.label}` : sc.index}
              </span>
            );
          })}
        </div>}
        {lanes.map((lane) => (
          <div key={lane.id} className={s.lane} aria-label={lane.label}>
            <span className={s.laneLabel}>{lane.label}</span>
            {lane.blocks.map((b) => {
              const g = drag !== null && drag.blockId === b.id && ghost !== null ? ghost : null;
              const left = g === null ? x(b.startS) : x(scenes[g.first]?.startS ?? b.startS);
              const right = g === null ? x(b.startS + b.durS) : x((scenes[g.last]?.startS ?? 0) + (scenes[g.last]?.durS ?? 0));
              return (
                <button
                  key={b.id}
                  type="button"
                  className={cx(s.block, s[b.look], b.id === selected && s.sel, g !== null && s.dragging)}
                  style={{ left, width: Math.max(2, right - left) }}
                  aria-pressed={b.id === selected}
                  aria-label={`${b.label} ${clock(b.startS)} to ${clock(b.startS + b.durS)}${b.title === undefined ? "" : ` · ${b.title}`}`}
                  data-block={b.id}
                  onClick={() => onSelect(b.id)}
                  onPointerDown={lane.drag === true ? (e) => start(b, "move", e) : undefined}
                  onPointerMove={(e) => drag !== null && drag.blockId === b.id && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
                  onPointerUp={() => {
                    if (drag === null || drag.blockId !== b.id || ghost === null) return;
                    setDrag(null);
                    if (Math.abs(drag.dx) > 2 && (ghost.first !== drag.first || ghost.last !== drag.last)) onDrop?.({ blockId: b.id, ...ghost });
                  }}
                >
                  {lane.drag === true && <span className={cx(s.edge, s.edgeL)} onPointerDown={(e) => start(b, "start", e)} aria-hidden="true" />}
                  <span className={s.blockText}>{b.label}</span>
                  {lane.drag === true && <span className={cx(s.edge, s.edgeR)} onPointerDown={(e) => start(b, "end", e)} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
        {t !== null && <span className={s.needle} style={{ left: x(t) }} aria-hidden="true" />}
      </div>
    </div>
  );
}

/** The transport outside React's render (v1 cut/clock.ts): a frame loop advances the needle at
 *  the J/K/L rate and stops at either end; a seek parks it. One per editor. */
export function useTransport(totalS: number): {
  readonly t: number;
  readonly playing: boolean;
  readonly rate: number;
  readonly seek: (t: number) => void;
  readonly toggle: () => void;
  readonly shuttle: (rate: number) => void;
} {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const at = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const next = Math.max(0, Math.min(totalS, at.current + ((now - last) / 1000) * rate));
      last = now;
      at.current = next;
      setT(next);
      if ((rate > 0 && next >= totalS) || (rate < 0 && next <= 0)) setPlaying(false);
      else raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, totalS]);
  const seek = (x: number): void => {
    at.current = Math.max(0, Math.min(totalS, x));
    setT(at.current);
  };
  return {
    t,
    playing,
    rate,
    seek,
    toggle: () => {
      if (!playing && at.current >= totalS) seek(0);
      setPlaying((p) => !p && totalS > 0);
    },
    shuttle: (r) => {
      // From the end, like play: a shuttle there would run one frame and stop where it stood.
      if (at.current >= totalS) seek(0);
      setRate(r);
      setPlaying(totalS > 0);
    },
  };
}
