"use client";

// ONE LISTENER PER EVENT FOR THE WHOLE BOARD — the card is found by `closest()`,
// never by a handler on the card.
//
// This is what makes a card a leaf with no callbacks in its props: five hundred
// cards cost five handlers, not twenty-five hundred, and a card that re-renders
// never re-binds anything. `data-card`, `data-play` and `data-verbs` are the
// contract; a skin writes them and these four handlers read them.
//
// THE ORDER INSIDE `onClick` IS THE INTERESTING PART. `data-play` is tested
// BEFORE `NODRAG` returns, because an audition is a click on a <button> (which
// NODRAG covers) and it must still work — while changing neither the selection
// nor the cursor, because pressing play is not choosing a card.
//
// A RIGHT-CLICK OFF A CARD is the source's to answer. The cell under the
// pointer is read off the cell element's own `data-cell` key, or - on a seam
// between cells, where no cell element is under the pointer - from the world
// point, by the same `resolveCell` a drop uses. If the source has verbs for that
// place the menu opens with them; if it has none, the browser's own menu is
// left alone, because a right-click that opens nothing and also swallows the
// native menu is a dead click.

import type { CanonStage, PipelineEntry, VerbTarget } from "@/lib/board/pipeline";

import { overlayOpen } from "@/lib/board/keys";

import type { Live } from "./canvasTypes";
import { FRAME, resolveCell, toWorld, type Camera, type Layout } from "./geometry";
import { NODRAG, NONE } from "./tunables";
import type { BoardVerbs } from "./useBoardVerbs";
import type { CardDrag } from "./useCardDrag";
import type { Selection } from "./useSelection";

export interface PointerVerbs {
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onClick(e: React.MouseEvent<HTMLDivElement>): void;
  onDoubleClick(e: React.MouseEvent<HTMLDivElement>): void;
  onContextMenu(e: React.MouseEvent<HTMLDivElement>): void;
}

/** `data-cell` is `lane|stage|band` (CellLayer). A lane key may itself hold a
 *  `|`, so the two fixed fields are read off the END. */
function parseCellKey(key: string): { lane: string; stage: CanonStage; band: string | null } {
  const parts = key.split("|");
  const band = parts.pop() ?? "";
  const stage = parts.pop() as CanonStage;
  return { lane: parts.join("|"), stage, band: band || null };
}

export function usePointerVerbs({
  liveRef,
  swallowRef,
  viewportRef,
  camRef,
  layout,
  sel,
  drag,
  verbs,
  playFromCard,
  axisId,
  stageWord,
}: {
  liveRef: React.RefObject<Live | null>;
  swallowRef: React.RefObject<boolean>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  camRef: React.RefObject<Camera>;
  layout: Layout;
  sel: Selection;
  drag: CardDrag;
  verbs: BoardVerbs;
  playFromCard(button: HTMLElement): void;
  axisId: string;
  stageWord(stage: CanonStage): string;
}): PointerVerbs {
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || overlayOpen()) return;
    const t = e.target as Element;
    if (t.closest(NODRAG)) return;
    const card = t.closest<HTMLElement>("[data-card]");
    if (card) drag.pressCard(e, card.dataset.card!);
    else drag.pressBackground(e);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swallowRef.current) {
      swallowRef.current = false;
      return;
    }
    const t = e.target as Element;
    // Before NODRAG returns (a <button> is in it): an audition is a click on a
    // control, and it changes neither the selection nor the cursor.
    const play = t.closest<HTMLElement>("[data-play]");
    if (play) {
      playFromCard(play);
      return;
    }
    const verbList = t.closest("[data-verbs]");
    const card = t.closest<HTMLElement>("[data-card]");
    if (verbList && card) {
      const r = verbList.getBoundingClientRect();
      sel.touch(card.dataset.card!);
      verbs.setMenu({ x: r.left, y: r.bottom + 4, id: card.dataset.card! });
      return;
    }
    if (t.closest(NODRAG)) return;
    if (card) {
      const id = card.dataset.card!;
      sel.touch(id);
      if (e.ctrlKey || e.metaKey || e.shiftKey) sel.toggleSelect(id);
      else sel.setSelected(new Set([id]));
    } else if (sel.selected.size) sel.setSelected(NONE);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = (e.target as Element).closest<HTMLElement>("[data-card]");
    const entry: PipelineEntry | undefined = (card && layout.entryOf.get(card.dataset.card!)) || undefined;
    if (entry) liveRef.current?.onOpen?.(entry);
  };

  /** The cell under a right-click, or null over the heads and off the board. */
  const cellAt = (e: React.MouseEvent<HTMLDivElement>): { lane: string; stage: CanonStage; band: string | null } | null => {
    const el = (e.target as Element).closest<HTMLElement>("[data-cell]");
    if (el?.dataset.cell) return parseCellKey(el.dataset.cell);
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return null;
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    // The heads are drawn over the board's top and left edges; a click on one
    // is a click on a name, not on whatever cell has scrolled under it.
    if (sx < FRAME.left || sy < FRAME.top) return null;
    const w = toWorld(camRef.current, sx, sy);
    const at = resolveCell(layout, w.x, w.y);
    if (!at) return null;
    const col = layout.columns[at.col];
    return { lane: layout.lanes[at.lane].key, stage: col.stage, band: col.band };
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (overlayOpen()) return;
    const card = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!card) {
      const source = liveRef.current?.source;
      const cell = source?.cellVerbs ? cellAt(e) : null;
      if (!source?.cellVerbs || !cell) return;
      const target: VerbTarget = { axis: axisId, lane: cell.lane, stage: cell.stage, band: cell.band };
      const list = source.cellVerbs(target);
      if (!list.length) return;
      e.preventDefault();
      const laneLabel = layout.lanes.find((l) => l.key === cell.lane)?.label || cell.lane;
      const col = layout.columns.find((c) => c.stage === cell.stage && c.band === cell.band);
      const where = `${laneLabel} · ${stageWord(cell.stage)}${col?.band ? ` · ${col.label}` : ""}`;
      verbs.setMap(null);
      verbs.setMenu({ x: e.clientX, y: e.clientY, cell: target, verbs: list, where });
      return;
    }
    e.preventDefault();
    sel.touch(card.dataset.card!);
    verbs.setMap(null);
    verbs.setMenu({ x: e.clientX, y: e.clientY, id: card.dataset.card! });
  };

  return { onPointerDown, onClick, onDoubleClick, onContextMenu };
}
