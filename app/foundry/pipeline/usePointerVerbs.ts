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

import type { PipelineEntry } from "@/lib/board/pipeline";

import { overlayOpen } from "@/lib/board/keys";

import type { Live } from "./canvasTypes";
import type { Layout } from "./geometry";
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

export function usePointerVerbs({
  liveRef,
  swallowRef,
  layout,
  sel,
  drag,
  verbs,
  playFromCard,
}: {
  liveRef: React.RefObject<Live | null>;
  swallowRef: React.RefObject<boolean>;
  layout: Layout;
  sel: Selection;
  drag: CardDrag;
  verbs: BoardVerbs;
  playFromCard(button: HTMLElement): void;
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

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!card) return;
    e.preventDefault();
    sel.touch(card.dataset.card!);
    verbs.setMap(null);
    verbs.setMenu({ x: e.clientX, y: e.clientY, id: card.dataset.card! });
  };

  return { onPointerDown, onClick, onDoubleClick, onContextMenu };
}
