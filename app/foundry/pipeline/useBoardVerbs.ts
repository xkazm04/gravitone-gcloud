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
//
// THE SOURCE'S OWN VERBS ride the same menu. A card's list is the engine's
// moves and then whatever `source.cardVerbs(id)` adds; a right-click on a CELL
// opens a menu that is only the source's (`cellVerbs`), because the engine has
// no verb for a place. Those verbs are carried out by the source
// (`runVerb`), never here: this file only decides whether one needs input first
// (`ask` - the modal BoardOverlays mounts), says the answer, and re-reads the
// board, because a verb that wrote something has changed what the board is.

import { useState } from "react";

import type { BoardVerb, PipelineSource, VerbInput, VerbResult, VerbTarget } from "@/lib/board/pipeline";

import type { Live } from "./canvasTypes";
import type { MenuItem } from "./ContextMenu";
import { CARD_W, cardPos, stepCell, toScreen, type Camera, type Dir, type Layout } from "./geometry";
import { buildVerdicts, type Verdicts } from "./moves";
import type { BoardMoves } from "./useBoardMoves";
import type { Selection } from "./useSelection";

/** A card's menu: the engine's verbs for `id`, then the source's. */
export interface CardMenuAt {
  x: number;
  y: number;
  id: string;
}
/** A cell's menu: the source's verbs for that place, asked once at open. */
export interface CellMenuAt {
  x: number;
  y: number;
  cell: VerbTarget;
  verbs: BoardVerb[];
  /** "<lane> · <stage word>", for the menu's name and the modal's eyebrow. */
  where: string;
}
export type MenuAt = CardMenuAt | CellMenuAt;
export const isCellMenu = (m: MenuAt): m is CellMenuAt => "cell" in m;

export interface MapAt extends CardMenuAt {
  verdicts: Verdicts;
}

/** A source verb waiting on its input form. */
export interface VerbAsk {
  verb: BoardVerb;
  target: VerbTarget;
  where: string;
}

/** The prefix that keeps a source's verb ids apart from the engine's own. */
const SRC = "src:";

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
  /** The cell menu's items, from the verbs it was opened with. */
  cellItems(m: CellMenuAt): MenuItem[];
  runCellVerb(m: CellMenuAt, verbId: string): void;
  ask: VerbAsk | null;
  setAsk: React.Dispatch<React.SetStateAction<VerbAsk | null>>;
  /** Run one source verb with its input; says the answer and re-reads on ok. */
  perform(target: VerbTarget, verbId: string, input?: VerbInput): Promise<VerbResult>;
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
  axisId,
  reload,
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
  /** The group axis the lanes are read under — what a verb's `lane` means. */
  axisId: string;
  reload(): Promise<void>;
}): BoardVerbs {
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [map, setMap] = useState<MapAt | null>(null);
  const [ask, setAsk] = useState<VerbAsk | null>(null);

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

  const asItem = (v: BoardVerb, prefix = ""): MenuItem => ({ id: `${prefix}${v.id}`, label: v.label, ...(v.disabled ? { disabled: v.disabled } : {}) });

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
    for (const v of source.cardVerbs?.(id) ?? []) items.push(asItem(v, SRC));
    return items;
  };

  /* ── the source's verbs ─────────────────────────────────────────────── */

  const perform = async (target: VerbTarget, verbId: string, input?: VerbInput): Promise<VerbResult> => {
    let r: VerbResult;
    try {
      r = source.runVerb ? await source.runVerb(verbId, target, input) : { ok: false, reason: `${source.label} carries out no verbs` };
    } catch (e) {
      r = { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    if (r.ok) {
      say(r.announce);
      await reload();
    }
    return r;
  };

  /** Input first if the verb asks for it; otherwise run it now and say how it
   *  ended — there is no dialog to hold a refusal, so it is spoken. */
  const startVerb = (verb: BoardVerb, target: VerbTarget, where: string) => {
    if (verb.disabled) return;
    if (verb.input) {
      setAsk({ verb, target, where });
      return;
    }
    void perform(target, verb.id).then((r) => {
      if (!r.ok) say(r.reason);
    });
  };

  const cellItems = (m: CellMenuAt): MenuItem[] => m.verbs.map((v) => asItem(v));

  const runCellVerb = (m: CellMenuAt, verbId: string) => {
    const verb = m.verbs.find((v) => v.id === verbId);
    if (verb) startVerb(verb, m.cell, m.where);
  };

  const runVerb = (id: string, verb: string) => {
    const entry = layout.entryOf.get(id);
    if (!entry) return;
    if (verb.startsWith(SRC)) {
      const v = source.cardVerbs?.(id).find((x) => x.id === verb.slice(SRC.length));
      if (v) startVerb(v, { axis: axisId, itemId: id }, entry.item.title);
      return;
    }
    if (verb === "select") sel.toggleSelect(id);
    else if (verb === "open") liveRef.current?.onOpen?.(entry);
    else if (verb === "map") openMap(id, menu ? { x: menu.x, y: menu.y } : undefined);
    else if (verb === "retry") moves.retryOf(id)?.();
    else if (verb.startsWith("move-")) stepMove(id, verb.slice(5) as Dir);
  };

  return { menu, setMenu, map, setMap, targetsFor, cardAnchor, openMap, stepMove, verbItems, runVerb, cellItems, runCellVerb, ask, setAsk, perform };
}
