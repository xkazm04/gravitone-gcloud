"use client";

// The commission rail — where a style starts.
//
// Every preset swatch is a REAL render of that preset, generated from the one
// canonical subject by pipeline/build-preset-thumbs.mts. One subject across all
// six is the whole point: the grid varies by style alone, so the user is
// comparing the only thing they are actually choosing. A gradient placeholder
// here would be a lie about the product's central claim.

import Image from "next/image";

import { styleFits, type DisciplineFilter } from "@/lib/themes";

import { PRESETS, thumbSrc, type Preset } from "./presets";

export default function PresetRail({
  onPick,
  onScratch,
  busy,
  discipline,
}: {
  onPick: (p: Preset) => void;
  onScratch: () => void;
  busy: boolean;
  /** The atelier's discipline filter: the SAME predicate the style pills use
   *  (lib/themes.ts#styleFits), so the rail and the wall never disagree. */
  discipline: DisciplineFilter;
}) {
  const shown = PRESETS.filter((p) => styleFits(p, discipline));
  return (
    <aside className="space-y-4">
      <div>
        <p className="font-jetbrains mb-2 text-content tracking-[0.18em] text-white/40 uppercase">start a style</p>
        <button
          onClick={onScratch}
          disabled={busy}
          className="font-hanken w-full rounded-xl border border-dashed border-cyan-400/30 bg-cyan-400/[0.04] px-4 py-3.5 text-left transition hover:bg-cyan-400/[0.08] disabled:opacity-50"
        >
          <span className="font-instrument block text-lg text-white">From a brief</span>
          <span className="mt-0.5 block text-label leading-snug text-slate-400">
            Write the four slots yourself.
          </span>
        </button>
      </div>

      <div>
        <p className="font-jetbrains mb-2 text-content tracking-[0.18em] text-white/40 uppercase">or a preset</p>
        {/* Absence is said: every preset today is written for explainers, so
            a trailer or free filter empties this rail rather than lying. */}
        {!shown.length && (
          <p className="font-hanken rounded-xl border border-dashed border-white/10 px-3 py-3 text-content leading-snug text-slate-500">
            No preset is written for this discipline yet. Start from a brief.
          </p>
        )}
        <div className="space-y-2">
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              disabled={busy}
              title={p.line}
              className="group block w-full overflow-hidden rounded-xl border border-white/8 text-left transition hover:border-cyan-400/35 disabled:opacity-50"
            >
              {/* next/image, not <img>: the swatches are committed at the
                  generator's full 1472px and this rail shows them at 240. Left
                  raw that is ~1.3MB of wire for six pictures the size of a
                  postage stamp. `fill` avoids hardcoding dimensions, which
                  matters because Leonardo and Google return different sizes for
                  the same 16:9 request. */}
              <span className="relative block aspect-video w-full bg-white/[0.03]">
                <Image
                  src={thumbSrc(p.id)}
                  alt={`${p.name} preset sample`}
                  fill
                  sizes="240px"
                  className="object-cover"
                />
              </span>
              <span className="block px-2.5 py-2">
                <span className="font-hanken block text-content text-white/85 group-hover:text-white">{p.name}</span>
                <span className="block text-label leading-snug text-slate-500">{p.line}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
