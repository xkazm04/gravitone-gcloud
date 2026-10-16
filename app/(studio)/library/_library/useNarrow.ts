"use client";

// The two widths the Library changes shape at (library.css): below 1360px the detail becomes a
// drawer over the results, below 1280px the rail does too. Read from matchMedia, the same
// breakpoints the stylesheet uses, so the keys' Esc cascade and the drawn drawers agree.

import { useSyncExternalStore } from "react";

const DETAIL = "(max-width: 1359px)";
const RAIL = "(max-width: 1279px)";

function subscribe(cb: () => void): () => void {
  const a = window.matchMedia(DETAIL);
  const b = window.matchMedia(RAIL);
  a.addEventListener("change", cb);
  b.addEventListener("change", cb);
  return () => {
    a.removeEventListener("change", cb);
    b.removeEventListener("change", cb);
  };
}

const snap = (): number => (window.matchMedia(DETAIL).matches ? 1 : 0) + (window.matchMedia(RAIL).matches ? 2 : 0);

export function useNarrow(): { readonly narrow: boolean; readonly railNarrow: boolean } {
  // The server draws the wide shape; a narrow browser corrects it on hydration.
  const v = useSyncExternalStore(subscribe, snap, () => 0);
  return { narrow: (v & 1) !== 0, railNarrow: (v & 2) !== 0 };
}
