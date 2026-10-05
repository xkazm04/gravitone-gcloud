"use client";

// The one key handler the Board mounts. The rules — what each key means,
// and when the Board must leave a key alone — are pure and live in
// lib/board/keys.ts, where the node lane asserts them; this file only binds
// them to `window` and to the sheet's handlers.

import { useEffect, useRef } from "react";

import { boardKeyAction, enterBelongsToTarget, overlayOpen, type BoardAction } from "@/lib/board/keys";

export type BoardKeyHandlers = Partial<Record<BoardAction, () => void>>;

export function useBoardKeys(handlers: BoardKeyHandlers, enabled = true): void {
  // The latest handlers, read at key time: rebinding the listener on every
  // render would drop a press that lands between unbind and bind.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const action = boardKeyAction(e, overlayOpen());
      if (!action) return;
      if (action === "loupe" && enterBelongsToTarget(e.target)) return;
      const run = ref.current[action];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
