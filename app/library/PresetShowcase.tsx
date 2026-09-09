"use client";

// THE SHOWCASE — five seconds of the preset the rail is pointing at.
//
// The rail's cards are 240px wide and carry a name and nothing else. This is
// where the preset is actually READ: the clip at a size worth watching, the one
// line about when to reach for it, and the three colours with their roles.
//
// It never empties. The preset under the pointer wins; with nothing under the
// pointer it holds the last one considered, and on arrival it is the first card
// in the rail. A panel that blanks when the mouse leaves is a panel that
// flickers all the way down a list of six.
//
// The clip is image-to-video FROM the card's own swatch, so moving from the
// rail to here is the same picture getting larger and then moving — never a
// second, different picture in the same style.

import Clip from "@/components/ui/Clip";

import { PaletteDots } from "./parts";
import { clipPoster, clipSources, type Preset } from "./presets";

export default function PresetShowcase({ preset }: { preset: Preset }) {
  return (
    <section
      aria-label={`${preset.name} preset`}
      className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-3 sm:flex-row"
    >
      <Clip
        // Keyed by preset so switching cards remounts the player rather than
        // swapping <source> under a running decoder, which browsers ignore.
        key={preset.id}
        sources={clipSources(preset.id)}
        poster={clipPoster(preset.id)}
        label={`${preset.name} — ${preset.motion}`}
        className="aspect-video w-full shrink-0 rounded-xl bg-white/[0.03] sm:w-[46%] sm:max-w-[420px]"
      />
      <div className="flex min-w-0 flex-col justify-center gap-3 sm:pr-2">
        <h2 className="font-instrument text-2xl leading-tight text-white">{preset.name}</h2>
        <p className="font-hanken text-content leading-snug text-slate-400">{preset.line}</p>
        <PaletteDots palette={preset.block.palette} withNames />
      </div>
    </section>
  );
}
