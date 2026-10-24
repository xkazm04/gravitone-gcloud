"use client";

// THE FRAME CANVAS (STEPS-DESIGN §2 frames + motion; v1 app/_phases/frames/parts.tsx FrameCanvas):
// one picture unit drawn as v1 composed it - the plate underneath, then its vector elements, then
// its texts - every position in PERCENT of the frame, so a layer means the same place at any size.
//
// Kept from v1: drag by pointer capture (parts.tsx:37-58), positions clamped 0-100, a resize
// handle on a selected element, an unsourced figure marked ● (a number nobody checked). Upgraded:
// a drag is LOCAL until the pointer lifts and then ONE edit leaves (v1 saved every move through
// a debounced whole-record write), so the op log holds "move t2" once, not forty times; and the
// canvas is the same object for Motion, which draws its proposed movers over the same plate.
//
// The canvas narrates nothing: the plate's absence is a shape (a dashed ground with its state as
// the accessible name), a hidden layer is drawn faint, a selected one ringed.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { cx } from "../cx.ts";
import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./FrameCanvas.module.css";

export type CanvasLayer = {
  readonly id: string;
  readonly layer: "element" | "text";
  readonly role: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly hidden: boolean;
  readonly accent?: boolean;
  readonly unsourced: boolean;
};

export type CanvasMover = { readonly label: string; readonly verb: string; readonly x?: number; readonly y?: number };

export type FrameCanvasProps = {
  /** The accessible name of the picture ("0:12 hook"). */
  readonly label: string;
  readonly plate: { readonly url: string | null; readonly state: string; readonly dry: boolean };
  readonly aspect?: "16:9" | "9:16";
  readonly layers: readonly CanvasLayer[];
  /** `${layer}:${id}` of the selected layer, or null. */
  readonly selected: string | null;
  readonly onSelect?: (key: string | null) => void;
  readonly onMove?: (l: CanvasLayer, x: number, y: number) => void;
  readonly onResize?: (l: CanvasLayer, w: number, h: number) => void;
  readonly movers?: readonly CanvasMover[];
  /** A clip to play over the plate (motion's render). */
  readonly clip?: string | null;
};

export const layerKey = (l: Pick<CanvasLayer, "layer" | "id">): string => `${l.layer}:${l.id}`;
const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

type Drag = { readonly key: string; readonly kind: "move" | "size"; readonly x0: number; readonly y0: number; readonly a: number; readonly b: number };

export function FrameCanvas(p: FrameCanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<{ readonly key: string; readonly a: number; readonly b: number } | null>(null);
  const editable = p.onMove !== undefined;

  const pct = (dx: number, dy: number): [number, number] => {
    const r = box.current?.getBoundingClientRect();
    return r === undefined || r.width === 0 || r.height === 0 ? [0, 0] : [(dx / r.width) * 100, (dy / r.height) * 100];
  };
  const down = (l: CanvasLayer, kind: Drag["kind"]) => (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    p.onSelect?.(layerKey(l));
    if (!editable || (kind === "size" && p.onResize === undefined)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key: layerKey(l), kind, x0: e.clientX, y0: e.clientY, a: kind === "move" ? l.x : (l.w ?? 10), b: kind === "move" ? l.y : (l.h ?? 10) });
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag === null) return;
    const [dx, dy] = pct(e.clientX - drag.x0, e.clientY - drag.y0);
    setLive({ key: drag.key, a: clamp(drag.a + dx), b: clamp(drag.b + dy) });
  };
  const up = (l: CanvasLayer) => () => {
    const d = drag;
    const v = live;
    setDrag(null);
    setLive(null);
    if (d === null || v === null || v.key !== d.key) return;
    if (d.kind === "move" && (v.a !== l.x || v.b !== l.y)) p.onMove?.(l, v.a, v.b);
    if (d.kind === "size" && (v.a !== l.w || v.b !== l.h)) p.onResize?.(l, Math.max(1, v.a), Math.max(1, v.b));
  };
  const at = (l: CanvasLayer) => {
    const k = layerKey(l);
    const d = drag?.key === k ? drag.kind : null;
    const v = live?.key === k ? live : null;
    return { x: d === "move" && v !== null ? v.a : l.x, y: d === "move" && v !== null ? v.b : l.y, w: d === "size" && v !== null ? v.a : l.w, h: d === "size" && v !== null ? v.b : l.h };
  };

  return (
    <figure className={cx(s.canvas, p.aspect === "9:16" && s.tall)} data-component="FrameCanvas" aria-label={p.label}>
      <div ref={box} className={s.frame} onPointerDown={() => p.onSelect?.(null)}>
        {p.plate.url !== null ? (
          // A plate is a content-addressed blob or a public still; next/image is not in this kit.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.plate} src={p.plate.url} alt="" draggable={false} />
        ) : (
          <div className={cx(s.plate, s.ground)} data-state={p.plate.state}>
            <SrOnly text={`no plate · ${p.plate.state}`} />
          </div>
        )}
        {p.clip !== undefined && p.clip !== null && <video className={s.plate} src={p.clip} muted loop autoPlay playsInline aria-label="clip" />}
        {p.layers.map((l) => {
          const k = layerKey(l);
          const pos = at(l);
          const on = p.selected === k;
          return l.layer === "element" ? (
            <div
              key={k}
              role="button"
              tabIndex={-1}
              aria-label={`${l.role} ${l.label}`}
              aria-pressed={on}
              className={cx(s.el, l.accent === true && s.accent, l.hidden && s.hidden, on && s.on)}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.w ?? 10}%`, height: `${pos.h ?? 10}%` }}
              data-layer={k}
              data-kind={l.role}
              onPointerDown={down(l, "move")}
              onPointerMove={move}
              onPointerUp={up(l)}
            >
              <span className={s.elLabel}>{l.label || l.role}</span>
              {/* The handle takes the press (and stops it, so the element does not start a move);
                  its moves and its lift bubble to the element's own handlers. Wiring them here as
                  well ran `up` twice off one render's state and sent every resize twice. */}
              {on && editable && p.onResize !== undefined && <span className={s.handle} aria-hidden="true" onPointerDown={down(l, "size")} />}
            </div>
          ) : (
            <div
              key={k}
              role="button"
              tabIndex={-1}
              aria-label={`${l.role} ${l.label}${l.unsourced ? " · unsourced" : ""}`}
              aria-pressed={on}
              className={cx(s.text, s[l.role], l.hidden && s.hidden, on && s.on)}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              data-layer={k}
              onPointerDown={down(l, "move")}
              onPointerMove={move}
              onPointerUp={up(l)}
            >
              {l.unsourced && (
                <span className={s.unsourced} aria-hidden="true">
                  ●
                </span>
              )}
              {l.label}
            </div>
          );
        })}
        {(p.movers ?? []).map((m, i) => (
          <div key={`${m.label}:${i}`} className={s.mover} style={{ left: `${m.x ?? 8}%`, top: `${m.y ?? 8 + i * 12}%` }} data-mover={m.label}>
            <span className={s.arrow} aria-hidden="true">
              ➜
            </span>
            <span className={s.moverLabel}>{`${m.label} · ${m.verb}`}</span>
          </div>
        ))}
        {p.plate.dry && p.plate.url !== null && <span className={s.dry}>dry</span>}
      </div>
    </figure>
  );
}
