"use client";

// THE CARD DRAG - pointer events, not a library and not native HTML5 drag (v1 app/playground/
// arrange/Board.tsx's reasons, kept): it works for mouse, pen and touch alike, the element stays
// put while the target cell lights, and it never collides with the Suno drop zones, which ARE
// native file drops.
//
// The lifecycle has named exits (drag-drop drag-lifecycle): a press that travels under
// SLOP_PX is a click and nothing happens; past it the drag is live and the cell under the
// pointer is the target (asked of the document - `elementFromPoint`, then up to `data-cell` -
// so the drop lands on the cell that was lit); release over a cell is the drop, release
// anywhere else, `pointercancel` and Escape are the cancel, and every exit clears the highlight.
// One drag at a time (drag-lifecycle): a press while a drag is live is inert; a press that never
// travelled (released off the card, so its own pointerup never came) is reaped by the next one.
// A press that starts on a control inside the card (`data-nodrag`: play, versions, the round
// trip, the label prompt) is that control's, never a drag.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { CELL_ATTR } from "@gt/ui/components/audio/ArrangeBoard.tsx";

const SLOP_PX = 4;

type Live = { readonly id: string; readonly x: number; readonly y: number; started: boolean; over: string | null; readonly end: () => void };

function cellUnder(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest(`[${CELL_ATTR}]`)?.getAttribute(CELL_ATTR) ?? null;
}

export function useCardDrag(onDrop: (id: string, cellKey: string) => void): {
  readonly over: string | null;
  readonly dragging: string | null;
  readonly start: (id: string, e: ReactPointerEvent<HTMLElement>) => void;
} {
  const live = useRef<Live | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const start = (id: string, e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest("[data-nodrag]") !== null)) return;
    const cur = live.current;
    if (cur !== null) {
      if (cur.started) return;
      cur.end();
    }
    const el = e.currentTarget;
    const end = (): void => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", key);
      if (live.current?.end === end) live.current = null;
      setOver(null);
      setDragging(null);
    };
    const move = (ev: PointerEvent): void => {
      const d = live.current;
      if (d === null) return;
      if (!d.started) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < SLOP_PX) return;
        d.started = true;
        el.setPointerCapture(ev.pointerId);
        setDragging(d.id);
      }
      const at = cellUnder(ev.clientX, ev.clientY);
      if (at !== d.over) {
        d.over = at;
        setOver(at);
      }
    };
    const up = (ev: PointerEvent): void => {
      const d = live.current;
      const at = d?.started === true ? cellUnder(ev.clientX, ev.clientY) : null;
      end();
      if (d !== null && at !== null) onDrop(d.id, at);
    };
    const cancel = (): void => end();
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") end();
    };
    live.current = { id, x: e.clientX, y: e.clientY, started: false, over: null, end };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", key);
  };

  return { over, dragging, start };
}
