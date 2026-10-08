"use client";

// THE WAY TO THE OTHER FACE, in its own module (Wave 2, 2026-10-08).
//
// It lived in GuidedResearch.tsx, and ResearchStep imported it from there for
// the expert face's header — which meant the expert face could not be drawn
// without the whole guided wizard (the deck engine, the run stage, the trace)
// arriving in the same chunk. Both faces are now `next/dynamic` in
// ResearchStep, each fetched only when it is the face shown, and the one piece
// both of them draw sits here so that neither pulls the other in.
// GuidedResearch.tsx re-exports both names, so its callers are unchanged.

import type { GuidedModeStepData } from "../../_shared/stepStore";

export type Face = GuidedModeStepData["mode"];

/** The way to the other face, on BOTH faces, discarding nothing — the
 *  ModeChooser doctrine, one step over. One face is mounted at a time, so the
 *  testid stays unique on the page. */
export function FaceSwitch({ face, onSwitch }: { face: Face; onSwitch: (f: Face) => void }) {
  const other: Face = face === "guided" ? "expert" : "guided";
  const word = other === "expert" ? "the expert board" : "the guided wizard";
  return (
    <button
      type="button"
      data-testid="research-face-switch"
      onClick={() => onSwitch(other)}
      className="font-jetbrains rounded-full border border-white/12 px-2.5 py-1 text-label tracking-[0.1em] text-white/45 transition hover:border-white/25 hover:text-white/75"
    >
      switch to {word}
    </button>
  );
}
