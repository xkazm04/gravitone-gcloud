"use client";

// THE DRAG — a card travelling under the pointer, and the one ask that decides
// what every cell under it means.
//
// THE ONE ASK. `buildVerdicts` is called once, in `start`. A pointer crossing
// forty cells asks the authority nothing: the verdict for a cell is a lookup,
// and `admits()` is a question about an item and a column, not about a pointer.
//
// WHAT TRAVELS IS THE GHOST, not the card. The card stays in the layout, drawn
// `away`; the ghost is one element following two springs. That is why dragging a
// selection of thirty costs the same as dragging one.
//
// EDGE AUTO-SCROLL lives in `frame`, which `pressDrag` calls once per animation
// frame: near an edge the board travels under a stationary pointer, and the cell
// under it is re-resolved because the WORLD moved, not the pointer.

import { useState } from "react";

import type { DragState, Live } from "./canvasTypes";
import { pressDrag } from "./dragMode";
import { pressBackground as backgroundPress } from "./pressBackground";
import type { AnimationPlaybackControls } from "motion/react";

import { cardPos, resolveCell, toWorld, type Camera } from "./geometry";
import type { Verdict } from "./types";
import { buildVerdicts, type Verdicts } from "./moves";
import { EDGE_PX, EDGE_SPEED } from "./tunables";
import type { BoardMoves } from "./useBoardMoves";
import type { BoardVerbs } from "./useBoardVerbs";
import type { Selection } from "./useSelection";
import type { Viewport } from "./useViewport";

export interface CardDrag {
  drag: DragState | null;
  pressCard(e: React.PointerEvent<HTMLDivElement>, id: string): void;
  pressBackground(e: React.PointerEvent<HTMLDivElement>): void;
}

export function useCardDrag({
  viewportRef,
  camRef,
  camAnimRef,
  cursorRef,
  pointerFocusRef,
  swallowRef,
  liveRef,
  viewport,
  moves,
  verbs,
  sel,
  say,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  camRef: React.RefObject<Camera>;
  camAnimRef: React.RefObject<AnimationPlaybackControls | null>;
  cursorRef: React.RefObject<string | null>;
  pointerFocusRef: React.RefObject<boolean>;
  swallowRef: React.RefObject<boolean>;
  liveRef: React.RefObject<Live | null>;
  viewport: Viewport;
  moves: BoardMoves;
  verbs: BoardVerbs;
  sel: Selection;
  say(text: string): void;
}): CardDrag {
  const [drag, setDrag] = useState<DragState | null>(null);
  const { gx, gy, cx, cy, sx, sy } = moves.ghost;

  const pressCard = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    const vpEl = viewportRef.current;
    if (!vpEl) return;
    const press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    let ids = verbs.targetsFor(id);
    if (!ids.includes(id)) ids = [id];
    let grab = { x: 0, y: 0 };
    let last: { cell: { lane: number; col: number } | null; verdict: Verdict | null } = { cell: null, verdict: null };
    let overKey = -2;
    let rect = vpEl.getBoundingClientRect();
    let pointer = { x: press.x, y: press.y };
    let verdicts: Verdicts | null = null;
    pointerFocusRef.current = document.activeElement !== vpEl;
    vpEl.focus({ preventScroll: true });
    cursorRef.current = id;
    camAnimRef.current?.stop();
    swallowRef.current = false;

    const track = (px: number, py: number) => {
      const L = liveRef.current!;
      pointer = { x: px, y: py };
      const w = toWorld(camRef.current, px - rect.left, py - rect.top);
      gx.set(w.x - grab.x);
      gy.set(w.y - grab.y);
      cx.set(px - rect.left + 18);
      cy.set(py - rect.top + 24);
      const cell = resolveCell(L.layout, w.x, w.y);
      const key = cell ? cell.lane * L.layout.columns.length + cell.col : -1;
      if (key === overKey || !verdicts) return;
      overKey = key;
      const verdict = cell ? verdicts.verdictFor(cell.lane, cell.col) : null;
      last = { cell, verdict };
      setDrag((d) => (d ? { ...d, over: cell, verdict, fresh: false } : d));
    };

    pressDrag(press, {
      surface: vpEl,
      start: () => {
        const L = liveRef.current!;
        const home = cardPos(L.layout, id);
        if (!home) return false;
        rect = vpEl.getBoundingClientRect();
        const w = toWorld(camRef.current, press.x - rect.left, press.y - rect.top);
        grab = { x: w.x - home.x, y: w.y - home.y };
        gx.set(home.x);
        gy.set(home.y);
        sx.jump(home.x);
        sy.jump(home.y);
        // THE ONE ASK. Every admits() call this drag will make is made here.
        verdicts = buildVerdicts(L.source, L.layout, ids);
        verbs.setMenu(null);
        verbs.setMap(null);
        moves.setNotice(null);
        moves.setFlight(null);
        cursorRef.current = null;
        sel.setActive(id);
        setDrag({ ids, lead: id, verdicts, over: null, verdict: null, fresh: true });
        say(`grabbed ${ids.length > 1 ? `${ids.length} cards` : (L.layout.entryOf.get(id)?.item.title ?? "")}`);
        return true;
      },
      move: track,
      frame: () => {
        const L = liveRef.current!;
        if (!L.layout.slotOf.has(id)) return "vanished";
        const alive = ids.filter((i) => L.layout.slotOf.has(i));
        if (alive.length !== ids.length) {
          ids = alive;
          setDrag((d) => (d ? { ...d, ids: alive } : d));
        }
        // Edge auto-scroll: the board travels under a stationary pointer.
        const px = pointer.x - rect.left;
        const py = pointer.y - rect.top;
        const edge = (v: number, max: number) => (v < EDGE_PX ? ((EDGE_PX - v) / EDGE_PX) * EDGE_SPEED : v > max - EDGE_PX ? -((v - (max - EDGE_PX)) / EDGE_PX) * EDGE_SPEED : 0);
        const dx = edge(px, rect.width);
        const dy = edge(py, rect.height);
        if (dx || dy) {
          const c = camRef.current;
          viewport.setCam({ k: c.k, x: c.x + dx, y: c.y + dy });
          overKey = -2;
          track(pointer.x, pointer.y);
        }
      },
      end: ({ exit, started }) => {
        setDrag(null);
        if (!started) return;
        swallowRef.current = true;
        window.setTimeout(() => (swallowRef.current = false), 150);
        const L = liveRef.current!;
        const lead = ids[0];
        if (exit === "vanished") {
          moves.setFlight(null);
          say("cancelled: the card is no longer on the board");
          return;
        }
        if (exit !== "up") {
          void moves.goHome({ ids, lead });
          say(exit === "dialog" ? "cancelled: a dialog opened" : "cancelled");
          return;
        }
        const cell = last.cell;
        if (!cell || !L.layout.slotOf.has(lead)) {
          void moves.goHome({ ids, lead });
          say("cancelled: dropped outside the board");
          return;
        }
        void moves.decide(ids, cell.lane, cell.col, { drag: true, verdicts: verdicts ?? undefined });
      },
    });
  };

  // The refs are handed over INSIDE the handler, not during render: passing a
  // ref to a function at render time is how a stale one gets captured.
  const pressBackground = (e: React.PointerEvent<HTMLDivElement>) => backgroundPress(e, { viewportRef, camAnimRef, swallowRef, pointerFocusRef });

  return { drag, pressCard, pressBackground };
}
