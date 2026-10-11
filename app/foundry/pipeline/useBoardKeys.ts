"use client";

// THE BOARD'S KEYS — what each press does, once `pipelineKeyAction` has decided
// that the press is the board's at all.
//
// THE DECISION IS NOT HERE. `./keymap.ts` is pure and holds every suppression
// rule (a chord belongs to the browser, a letter in a field is text, an open
// overlay owns the keyboard except for Escape), so each rule is asserted in the
// node lane instead of discovered by a mis-moved card. This file is only the
// consequences.
//
// WHERE A WALK STARTS. `cursor` (a pointer's last touch) outranks `active` (the
// ring), so clicking a card and then pressing an arrow walks from the card you
// clicked. With neither, the walk starts at the card nearest the middle of the
// view, which is the one you are looking at.
//
// WHY THE WALK ANNOUNCEMENT IS DEBOUNCED. Holding an arrow crosses a dozen cards
// a second and a live region read a dozen titles is noise, not information. The
// 220ms timer means a held arrow speaks once, where it stopped.

import { useEffect, useRef } from "react";

import type { Live } from "./canvasTypes";
import { nearestTo, viewRect, walk, type Camera, type Layout } from "./geometry";
import { pipelineKeyAction } from "./keymap";
import { overlayOpen } from "@/lib/board/keys";
import { NONE } from "./tunables";
import type { BoardMoves } from "./useBoardMoves";
import type { BoardVerbs } from "./useBoardVerbs";
import type { Selection } from "./useSelection";
import type { Viewport } from "./useViewport";

export interface BoardKeys {
  onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void;
  onFocus(e: React.FocusEvent<HTMLDivElement>): void;
}

export function useBoardKeys({
  camRef,
  sizeRef,
  cursorRef,
  pointerFocusRef,
  liveRef,
  viewport,
  moves,
  verbs,
  sel,
  layout,
  hasOpen,
  say,
  colWord,
}: {
  camRef: React.RefObject<Camera>;
  sizeRef: React.RefObject<{ w: number; h: number } | null>;
  cursorRef: React.RefObject<string | null>;
  pointerFocusRef: React.RefObject<boolean>;
  liveRef: React.RefObject<Live | null>;
  viewport: Viewport;
  moves: BoardMoves;
  verbs: BoardVerbs;
  sel: Selection;
  layout: Layout;
  hasOpen: boolean;
  say(text: string): void;
  colWord(L: Layout, col: number): string;
}): BoardKeys {
  // The keyboard's own: a held arrow crosses a dozen cards a second, so the live
  // region is read once, where it stopped.
  const walkSayRef = useRef(0);
  useEffect(() => () => window.clearTimeout(walkSayRef.current), []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = pipelineKeyAction(e, overlayOpen());
    if (!a) return;
    const s = sizeRef.current;
    const from = cursorRef.current && layout.slotOf.has(cursorRef.current) ? cursorRef.current : sel.active;
    const here = from && layout.slotOf.has(from) ? from : null;
    cursorRef.current = null;
    if (here && here !== sel.active) sel.setActive(here);
    const take = () => e.preventDefault();

    switch (a.kind) {
      case "walk": {
        take();
        const start = here ?? (viewport.view && s ? nearestTo(layout, viewRect(camRef.current, s.w, s.h)) : null);
        if (!start) return;
        const to = here ? walk(layout, start, a.dir) : start;
        if (!to) {
          say("edge of the board");
          return;
        }
        sel.setActive(to);
        viewport.reveal(to);
        window.clearTimeout(walkSayRef.current);
        walkSayRef.current = window.setTimeout(() => {
          const l = liveRef.current;
          const sl = l?.layout.slotOf.get(to);
          if (!l || !sl) return;
          const n = l.layout.ids[sl.lane * l.layout.columns.length + sl.col].length;
          say(`${l.layout.entryOf.get(to)?.item.title ?? ""} · ${colWord(l.layout, sl.col)} · ${sl.row + 1} of ${n}`);
        }, 220);
        return;
      }
      case "move":
        take();
        if (here) verbs.stepMove(here, a.dir);
        return;
      case "toggle":
        take();
        if (here) sel.toggleSelect(here);
        return;
      case "open": {
        const entry = here ? layout.entryOf.get(here) : null;
        if (entry && hasOpen) {
          take();
          liveRef.current?.onOpen?.(entry);
        }
        return;
      }
      case "map":
        take();
        if (here) verbs.openMap(here);
        return;
      case "menu":
        take();
        if (here) {
          const p = verbs.cardAnchor(here);
          verbs.setMenu({ x: p.x, y: p.y, id: here });
        }
        return;
      case "retry":
        if (moves.notice?.retry) {
          take();
          moves.notice.retry();
        }
        return;
      case "zoom":
        take();
        viewport.zoomBy(a.by > 0 ? 1.25 : 0.8);
        return;
      case "fit":
        take();
        viewport.fit();
        return;
      case "escape":
        if (moves.notice) {
          take();
          moves.setNotice(null);
        } else if (sel.selected.size) {
          take();
          sel.setSelected(NONE);
        }
        return;
    }
  };

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (pointerFocusRef.current) {
      pointerFocusRef.current = false;
      return;
    }
    if (e.target !== e.currentTarget || sel.active || !viewport.view || !sizeRef.current) return;
    const s = sizeRef.current;
    sel.setActive(nearestTo(layout, viewRect(camRef.current, s.w, s.h)));
  };

  return { onKeyDown, onFocus };
}
