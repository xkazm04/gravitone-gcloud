"use client";

// THE VERBS, AS DATA — one list, and one place a verb is carried out.
//
// `verbItems` builds the list and `runVerb` performs it, so the context menu,
// the keyboard and the card's actions button are three doors onto the same
// table. A verb that exists in one and not the others is then impossible rather
// than merely unlikely.
//
// `targetsFor` is the multi-card rule, and it lives here because it is the same
// question every verb asks first: a card inside a selection of several moves the
// whole selection; a card outside it moves alone.
//
// The two floating surfaces are here too (`menu`, `map`), because opening one is
// itself a verb and both are anchored off a card's own corner.

import { useState } from "react";

import type { PipelineSource } from "@/lib/board/pipeline";

import type { Live } from "./canvasTypes";
import type { MenuItem } from "./ContextMenu";
import { CARD_W, cardPos, stepCell, toScreen, type Camera, type Dir, type Layout } from "./geometry";
import { buildVerdicts, type Verdicts } from "./moves";
import type { BoardMoves } from "./useBoardMoves";
import type { Selection } from "./useSelection";

export interface MenuAt {
  x: number;
  y: number;
  id: string;
}
export interface MapAt extends MenuAt {
  verdicts: Verdicts;
}

export interface BoardVerbs {
  menu: MenuAt | null;
  setMenu: React.Dispatch<React.SetStateAction<MenuAt | null>>;
  map: MapAt | null;
  setMap: React.Dispatch<React.SetStateAction<MapAt | null>>;
  targetsFor(id: string): string[];
  cardAnchor(id: string): { x: number; y: number };
  openMap(id: string, at?: { x: number; y: number }): void;
  stepMove(id: string, dir: Dir): void;
  verbItems(id: string): MenuItem[];
  runVerb(id: string, verb: string): void;
}

export function useBoardVerbs({
  viewportRef,
  camRef,
  liveRef,
  moves,
  sel,
  layout,
  source,
  hasOpen,
  say,
  colWord,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  camRef: React.RefObject<Camera>;
  liveRef: React.RefObject<Live | null>;
  moves: BoardMoves;
  sel: Selection;
  layout: Layout;
  source: PipelineSource;
  hasOpen: boolean;
  say(text: string): void;
  colWord(L: Layout, col: number): string;
}): BoardVerbs {
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [map, setMap] = useState<MapAt | null>(null);

  const targetsFor = (id: string): string[] => (sel.selected.has(id) && sel.selected.size > 1 ? [...sel.selected].filter((i) => layout.slotOf.has(i)) : [id]);

  const cardAnchor = (id: string): { x: number; y: number } => {
    const r = viewportRef.current?.getBoundingClientRect();
    const p = cardPos(layout, id);
    if (!r || !p) return { x: 80, y: 80 };
    const s = toScreen(camRef.current, p.x + CARD_W, p.y);
    return { x: Math.min(r.right - 24, Math.max(r.left + 24, r.left + s.x)), y: Math.min(r.bottom - 24, Math.max(r.top + 24, r.top + s.y)) };
  };

  const openMap = (id: string, at?: { x: number; y: number }) => {
    const a = at ?? cardAnchor(id);
    setMenu(null);
    // asked once, when the map opens — the same table the drag uses
    setMap({ x: a.x, y: a.y, id, verdicts: buildVerdicts(source, layout, targetsFor(id)) });
  };

  const stepMove = (id: string, dir: Dir) => {
    const cell = stepCell(layout, id, dir);
    if (!cell) {
      say(`${layout.entryOf.get(id)?.item.title ?? ""} · edge of the board`);
      return;
    }
    void moves.decide(targetsFor(id), cell.lane, cell.col, { drag: false });
  };

  const verbItems = (id: string): MenuItem[] => {
    const entry = layout.entryOf.get(id);
    if (!entry || !layout.slotOf.has(id)) return [];
    const many = targetsFor(id).length;
    const lead = many > 1 ? `${many} cards ` : "";
    // The menu focuses its first item on open: the first verb is the safe one.
    const items: MenuItem[] = [{ id: "select", label: sel.selected.has(id) ? "Deselect" : "Select", detail: "Space" }];
    if (hasOpen) items.push({ id: "open", label: "Open", detail: "Enter" });
    const toward = (dir: Dir, detail: string) => {
      const c = stepCell(layout, id, dir);
      if (!c) return;
      const to = dir === "left" || dir === "right" ? `to ${colWord(layout, c.col)}` : `${dir} to ${layout.lanes[c.lane].label || "lane"}`;
      items.push({ id: `move-${dir}`, label: `Move ${lead}${to}`, detail });
    };
    toward("right", "⇧→");
    toward("left", "⇧←");
    toward("up", "⇧↑");
    toward("down", "⇧↓");
    items.push({ id: "map", label: `Move ${lead}to…`, detail: "M" });
    if (moves.retryOf(id)) items.push({ id: "retry", label: "Retry the move", detail: "R" });
    return items;
  };

  const runVerb = (id: string, verb: string) => {
    const entry = layout.entryOf.get(id);
    if (!entry) return;
    if (verb === "select") sel.toggleSelect(id);
    else if (verb === "open") liveRef.current?.onOpen?.(entry);
    else if (verb === "map") openMap(id, menu ? { x: menu.x, y: menu.y } : undefined);
    else if (verb === "retry") moves.retryOf(id)?.();
    else if (verb.startsWith("move-")) stepMove(id, verb.slice(5) as Dir);
  };

  return { menu, setMenu, map, setMap, targetsFor, cardAnchor, openMap, stepMove, verbItems, runVerb };
}
