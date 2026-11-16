// HOW A PICTURE OR A CLIP SETTLES - the three drawn states Plate and Clip share (desk/Plate.tsx,
// desk/Clip.tsx): waiting (its box on a ground, nothing yet), loaded, failed.
//
// `entered` is loaded-by-an-event: the bytes arrived while the box was on screen, so the picture
// fades in. `loaded` is loaded-at-mount: a cached picture, or one that landed before hydration,
// is simply there - an entrance over pixels the operator already saw would be a flicker.
//
// The state is kept per source: a new src is a new try, waiting again, and a failure is
// remembered for the src that failed and no other.
import { useState } from "react";

export type Phase = "waiting" | "loaded" | "entered" | "failed";

export function useSettle(key: string | undefined): { readonly phase: Phase; readonly settle: (p: Phase) => void } {
  const [at, setAt] = useState<{ readonly key: string | undefined; readonly phase: Phase }>({ key, phase: "waiting" });
  return { phase: at.key === key ? at.phase : "waiting", settle: (phase) => setAt({ key, phase }) };
}

/**
 * The entrance, written onto the element IN the load handler, before React renders it: the load
 * event and the first paint with the pixels share a frame, and a state update lands a frame or
 * more later - the picture would paint whole, vanish, and fade in. React's render then writes the
 * same two attributes.
 */
export function enter(el: Element): void {
  el.setAttribute("data-state", "loaded");
  el.setAttribute("data-enter", "");
}

/** An img the browser had already finished with when it mounted (cache, or before hydration). */
export function imgDone(el: HTMLImageElement): Phase | undefined {
  if (!el.complete || (el.getAttribute("src") ?? "") === "") return undefined;
  return el.naturalWidth === 0 ? "failed" : "loaded";
}

/** A video that already has its metadata, or already failed, when it mounted. */
export function videoDone(el: HTMLVideoElement): Phase | undefined {
  if (el.error !== null) return "failed";
  return el.readyState >= 1 ? "loaded" : undefined;
}
