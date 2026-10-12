"use client";

// THE SHOWCASE — the preset the rail is pointing at, read against five problems.
//
// The body is the trial matrix (./TrialMatrix.tsx): six presets by five
// problems, the pointed-at preset's row lifted, and its clip the row's first
// cell. A preset is no longer chosen from a five-second clip alone.
//
// It never empties. The preset under the pointer wins; with nothing under the
// pointer it holds the last one considered, and on arrival it is the first card
// in the rail. A panel that blanks when the mouse leaves is a panel that
// flickers all the way down a list of six.
//
// The clip is image-to-video FROM the card's own swatch, so moving from the
// rail to here is the same picture getting larger and then moving — never a
// second, different picture in the same style.

import { PaletteDots } from "./parts";
import type { Preset } from "./presets";
import TrialMatrix from "./TrialMatrix";

export default function PresetShowcase({ preset }: { preset: Preset }) {
  return (
    <div className="space-y-3">
      <TrialMatrix preset={preset} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <h2 className="font-instrument text-2xl leading-tight text-white">{preset.name}</h2>
        <PaletteDots palette={preset.block.palette} withNames />
      </div>
      <p className="px-1 font-hanken text-content leading-snug text-slate-400">{preset.line}</p>
    </div>
  );
}
