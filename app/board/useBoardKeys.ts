"use client";

// The one key handler the Board mounts. The rules — what each key means,
// and when the Board must leave a key alone — are pure and live in
// lib/board/keys.ts, where the node lane asserts them; this file only binds
// them to `window` and to the sheet's handlers (useKeymap).

import { BOARD_KEYMAP, type BoardAction } from "@/lib/board/keys";
import { useKeymap } from "@/components/ui/signal/keymap";

export type BoardKeyHandlers = Partial<Record<BoardAction, () => void>>;

export function useBoardKeys(handlers: BoardKeyHandlers, enabled = true): void {
  useKeymap(BOARD_KEYMAP, handlers, { enabled });
}
