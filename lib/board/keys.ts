// THE BOARD'S ONE KEYMAP — pure, so the suppression rules are asserted in the
// node lane rather than discovered by a mis-decided item.
//
// A approve · X reject · U clear · J/K next/prev · Enter loupe · Esc close ·
// Z undo. K is PREV here, while v1's kit VerdictKeys drew its approve key as
// "K" (the foundry cull's keymap; the part was retired with the Almanac kit in
// Phase 1). The two could not both hold, so the Board binds A, and the new kit
// must not bring a second spelling of the verdict keys back.
//
// The guard is the kernel's (components/ui/signal/keymap.ts), promoted from
// StatReel's (apps/studio/src/board/keys.ts) with the reasons it gives:
//   · TYPING — a letter in a text field is text, not a verdict.
//   · AN OVERLAY — a dialog owns the keyboard, EXCEPT the Board's own loupe,
//     which is where decisions are made and must keep its keys.
//   · REPEAT — a held key decides ONE item, never the next ones the view
//     advances to while the key is still down. Navigation may repeat.
//   · A MODIFIER — Ctrl/Cmd/Alt+letter belongs to the browser and the OS.
//
// This file is now a DEFINITION over that kernel: the bindings below are the
// Board's whole keymap, and the kernel binds, guards and draws them.

import { type LayerEntry } from "@/components/ui/layers";
import { defineKeymap, resolveKey } from "@/components/ui/signal/keymap";

export { enterBelongsToTarget, LOUPE_MARK, overlayOpen, typing } from "@/components/ui/signal/keymap";
export type { KeyLike } from "@/components/ui/signal/keymap";
import type { KeyLike } from "@/components/ui/signal/keymap";

export type BoardAction = "approve" | "reject" | "clear" | "next" | "prev" | "loupe" | "close" | "undo";

/** The Board's keymap. K is PREV here, while the kit's VerdictKeys draws its
 *  approve key as "K"; the Board binds A (see the header). */
export const BOARD_KEYMAP = defineKeymap<BoardAction>({
  id: "board",
  bindings: [
    { keys: ["A"], does: "approve", action: "approve" },
    { keys: ["X"], does: "reject", action: "reject" },
    { keys: ["U"], does: "clear", action: "clear" },
    { keys: ["J"], does: "next", action: "next", repeat: true },
    { keys: ["K"], does: "previous", action: "prev", repeat: true },
    { keys: ["Enter"], does: "loupe", action: "loupe" },
    { keys: ["Esc"], does: "close", action: "close", repeat: true },
    { keys: ["Z"], does: "undo", action: "undo" },
  ],
});

/**
 * What a key press means on the Board, or null when it is not the Board's.
 * `overlay` is the result of `overlayOpen()` — passed in so this stays pure.
 */
export function boardKeyAction(e: KeyLike, overlay: boolean, layers?: readonly LayerEntry[]): BoardAction | null {
  return resolveKey(BOARD_KEYMAP, e, { overlay, layers });
}
