"use client";

// FULL SCREEN BUYS SIZE, NOT JUST AREA — and the first cut of it only bought
// area. Filling the screen gave the board 173 more pixels of height and left
// every card and every label exactly as big as they were at a third of the
// width, which is a bigger spreadsheet rather than a better one. A wider screen
// should be legible from further away.
//
// So it scales BOTH halves by `FULL_SCALE`, and they are two mechanisms because
// the board has two coordinate systems:
//
//   the CONTENT rides the camera. The world is one element under
//   `translate3d(x,y,0) scale(k)`, so a card and the type inside it scale
//   together with `k` — one `zoomBy` is the whole of it, and nothing in the skin
//   or the layout has to know.
//
//   the CHROME is in screen space — the stage heads, the lane heads, the control
//   cluster — and does not ride the camera by design (a head that scaled with
//   the board would stop being a fixed reference). It moves by redefining the two
//   scale tokens on the root, so every `text-label` and `text-content` under it
//   grows together and not one className changes. Writing sizes into the markup
//   instead would mean an arbitrary size per element, which is what
//   `npm run check:type` exists to stop.
//
// THE CAMERA FOLLOWS THE FLAG, in an effect rather than in each of the two
// callers that can flip it (the key and the button), so the two cannot drift and
// a flip from anywhere else later is covered for free. `zoomedRef` holds the
// first run: on mount `full` is false and there is nothing to undo, and zooming
// out by a factor nobody zoomed in by would shrink the opening frame.
//
// `f` TOGGLES, and Escape deliberately does not. Escape is the canvas's own
// "close the innermost thing" — menu, then map, then selection, then cursor
// (./keymap.ts) — and a second listener taking it would collapse the board and
// clear the selection on one press. `f` is free: the canvas's keymap returns
// null for it.

import { useEffect, useRef, useState } from "react";

import { typing } from "@/lib/board/keys";

import { refusedKey } from "../keyGuard";
import type { PipelineHandle } from "./types";

/** How much bigger full screen draws everything. ~20%: enough to read the board
 *  from further back, small enough that a lane of cards still fits the width it
 *  fitted before. */
export const FULL_SCALE = 1.2;

export interface FullScreen {
  full: boolean;
  toggle(): void;
  /** What the shell's root wears while expanded. */
  rootClass: string;
  rootStyle: React.CSSProperties | undefined;
}

export function useFullScreen(apiRef: React.RefObject<PipelineHandle | null>): FullScreen {
  const [full, setFull] = useState(false);
  const zoomedRef = useRef(false);

  useEffect(() => {
    if (zoomedRef.current === full) return;
    zoomedRef.current = full;
    apiRef.current?.zoomBy(full ? FULL_SCALE : 1 / FULL_SCALE);
  }, [full, apiRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `refusedKey` FIRST, and it is the board's own guard rather than a second
      // set: a chord belongs to the browser (Ctrl+F is its find) and a held key
      // must not toggle the screen forty times. Spelling that by hand here is
      // what `foundry-key-guard` exists to catch, and it caught this.
      if (refusedKey(e)) return;
      if (typing(e.target)) return;
      // Spelled as `===`, not `!== && !==`. foundry-key-guard reads the file for
      // the first `e.key ===` and requires `refusedKey(e)` before it; a handler
      // that only ever writes `!==` reads the key without the probe seeing it,
      // so the probe treats "no read found" as a failure. It errs in the safe
      // direction, and the positive form is the clearer one anyway.
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFull((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    full,
    toggle: () => setFull((v) => !v),
    rootClass: full ? "fixed inset-0 z-40 overflow-y-auto bg-[var(--gt-ink)] p-3" : "",
    rootStyle: full ? ({ "--text-label": `${FULL_SCALE}rem`, "--text-content": `${1.125 * FULL_SCALE}rem` } as React.CSSProperties) : undefined,
  };
}
