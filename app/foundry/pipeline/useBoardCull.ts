"use client";

// WHAT IS IN THE DOM, DERIVED — rung 2 of the engine, as arithmetic over the
// layout and the culling rectangle.
//
// `want` is every card the rectangle crosses. `mounted` is what a wave has so
// far allowed of it, plus whatever was already there, plus the keyboard cursor
// wherever it is. Nothing here allocates per card beyond the list itself, and
// every function it calls is pure (./cells.ts), which is what lets this re-run
// on every camera change without being a performance question.
//
// THE CURSOR IS ALWAYS MOUNTED. `aria-activedescendant` must name an element
// that exists, so the keyboard's card is appended even when the camera has
// wandered off it. One card out of view is cheaper than a broken a11y contract.
//
// `away` is the cards some other surface is currently drawing — a ghost in
// flight, a drag, a prompt — so the board does not draw them twice.

import { useMemo } from "react";

import type { Flight, Notice, PromptState } from "./canvasTypes";
import { CARD_H, CARD_W, PITCH, countRect, cullRect, laneRange, type Layout, type Placed } from "./geometry";
import { NONE } from "./tunables";
import type { ChoreoState } from "./types";
import type { ViewState, WaveState } from "./useCullRect";

export interface BoardCull {
  /** How many cards the rectangle holds, inset by the overscan: the number the
   *  choreography cap is judged against. */
  visible: number;
  choreo: ChoreoState;
  mounted: readonly Placed[];
  /** Per-card entrance delay in ms, or null when choreography is off. */
  enters: Map<string, number> | null;
  /** How many of `want` are not yet mounted — what a wave is working through. */
  fresh: number;
  laneFrom: number;
  laneTo: number;
  away: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
}

export function useBoardCull({
  layout,
  view,
  wave,
  active,
  reduced,
  choreoCap,
  dragIds,
  flight,
  prompt,
  notice,
}: {
  layout: Layout;
  view: ViewState | null;
  wave: WaveState | null;
  active: string | null;
  reduced: boolean;
  choreoCap: number;
  dragIds: string[] | null;
  flight: Flight | null;
  prompt: PromptState | null;
  notice: Notice | null;
}): BoardCull {
  const visible = useMemo(
    () => (view ? countRect(layout, { x0: view.rect.x0 + view.m, y0: view.rect.y0 + view.m, x1: view.rect.x1 - view.m, y1: view.rect.y1 - view.m }) : 0),
    [layout, view],
  );
  const choreo = useMemo<ChoreoState>(
    () => ({ on: !reduced && visible <= choreoCap, reason: reduced ? "reduced-motion" : visible > choreoCap ? "cap" : null, visible, cap: choreoCap }),
    [reduced, visible, choreoCap],
  );

  const want = useMemo(() => (view ? cullRect(layout, view.rect) : []), [layout, view]);
  const { mounted, enters, fresh } = useMemo(() => {
    let list = want;
    let enters: Map<string, number> | null = null;
    let fresh = 0;
    if (view && wave) {
      // A wave limits how many NEW cards mount per frame, nearest the middle
      // first. What was already mounted stays: dropping it to re-mount it a
      // frame later is the flicker a naive limit would cause.
      const mx = (view.rect.x0 + view.rect.x1) / 2;
      const my = (view.rect.y0 + view.rect.y1) / 2;
      const ranked: { i: number; d: number }[] = [];
      want.forEach((p, i) => {
        if (!wave.keep.has(p.id)) ranked.push({ i, d: (p.x + CARD_W / 2 - mx) ** 2 + (p.y + CARD_H / 2 - my) ** 2 });
      });
      ranked.sort((a, b) => a.d - b.d);
      fresh = ranked.length;
      const chosen = new Set<number>();
      enters = new Map();
      for (let r = 0; r < Math.min(wave.to, ranked.length); r++) {
        const p = want[ranked[r].i];
        chosen.add(ranked[r].i);
        if (r >= wave.from) enters.set(p.id, p.col * 70 + ((r - wave.from) % 10) * 16);
      }
      list = want.filter((p, i) => wave.keep.has(p.id) || chosen.has(i));
    }
    // The keyboard cursor is always in the DOM, so aria-activedescendant can
    // name it wherever the camera has wandered.
    if (active && !list.some((p) => p.id === active)) {
      const s = layout.slotOf.get(active);
      if (s) list = [...list, { id: active, lane: s.lane, col: s.col, row: s.row, x: layout.columns[s.col].x + 12, y: layout.lanes[s.lane].y + 12 + s.row * PITCH }];
    }
    return { mounted: list, enters: choreo.on ? enters : null, fresh };
  }, [want, wave, view, active, layout, choreo.on]);

  const [laneFrom, laneTo] = useMemo(() => (view ? laneRange(layout, view.rect) : [0, 0]), [layout, view]);

  const away = useMemo(() => {
    const s = new Set<string>();
    if (dragIds) dragIds.forEach((i) => s.add(i));
    if (flight && flight.phase !== "done") flight.ids.forEach((i) => s.add(i));
    if (prompt) prompt.ids.forEach((i) => s.add(i));
    return s;
  }, [dragIds, flight, prompt]);
  const flagged = useMemo(() => (notice ? new Set(notice.ids) : NONE), [notice]);

  return { visible, choreo, mounted, enters, fresh, laneFrom, laneTo, away, flagged };
}
