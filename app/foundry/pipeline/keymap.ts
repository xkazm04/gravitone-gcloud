// THE CANVAS'S ONE KEYMAP — pure, so every suppression rule is asserted in the
// node lane rather than discovered by a mis-moved card.
//
// Arrow            walk to the nearest card in that direction
// Shift+Arrow      move the card one cell (a REQUEST: the authority may refuse)
// Space            select / deselect
// Enter            open the card's native surface
// M                the move map ("move to…")
// R                retry the move that failed
// ContextMenu, Shift+F10    the verb menu
// + / - / 0        zoom in, out, fit
// Escape           closes the innermost thing: menu, map, selection, cursor
//
// THE GUARDS ARE THE BOARD'S, NOT A SECOND SET.
//   · `refusedKey` (app/foundry/keyGuard.ts) first: a chord belongs to the browser
//     (Ctrl+K is its search), and a held key repeats everything but an arrow.
//   · `typing` (lib/board/keys.ts): a letter in a field is text, not a verb.
//   · an open overlay owns the keyboard — except Escape, which only ever closes.
//   · Shift+Arrow does not repeat even though a bare arrow does: a held chord
//     must move ONE card one cell, not march it across the board and ask the
//     authority four times.
//   · Enter and Space belong to a focused control (the card's actions button)
//     before they belong to the canvas; `enterBelongsToTarget` is the same rule
//     app/foundry/CullGrid.tsx's `activatesOnEnter` records, kept pure here so
//     this file imports nothing with a component in it.

import { enterBelongsToTarget, typing } from "@/lib/board/keys";

import { refusedKey } from "../keyGuard";
import type { Dir } from "./geometry";

export type PipelineAction =
  | { kind: "walk"; dir: Dir }
  | { kind: "move"; dir: Dir }
  | { kind: "toggle" }
  | { kind: "open" }
  | { kind: "map" }
  | { kind: "menu" }
  | { kind: "retry" }
  | { kind: "zoom"; by: 1 | -1 }
  | { kind: "fit" }
  | { kind: "escape" };

export interface KeyEvt {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}

const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/** What a key press means on the canvas, or null when it is not the canvas's.
 *  `overlay` is `overlayOpen()`, passed in so this stays pure. */
export function pipelineKeyAction(e: KeyEvt, overlay: boolean): PipelineAction | null {
  if (refusedKey(e)) return null;
  if (typing(e.target)) return null;
  if (e.key === "Escape") return { kind: "escape" };
  if (overlay) return null;

  const dir = ARROWS[e.key];
  if (dir) return e.shiftKey ? (e.repeat ? null : { kind: "move", dir }) : { kind: "walk", dir };

  if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) return { kind: "menu" };
  if (e.key === "Enter") return enterBelongsToTarget(e.target) ? null : { kind: "open" };
  if (e.key === " ") return enterBelongsToTarget(e.target) ? null : { kind: "toggle" };
  if (e.key === "+" || e.key === "=") return { kind: "zoom", by: 1 };
  if (e.key === "-" || e.key === "_") return { kind: "zoom", by: -1 };
  if (e.key === "0") return { kind: "fit" };
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "m") return { kind: "map" };
  if (k === "r") return { kind: "retry" };
  return null;
}
