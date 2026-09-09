"use client";

// The commission rail — where a style starts.
//
// Every preset swatch is a REAL render of that preset, generated from the one
// canonical subject by pipeline/build-preset-thumbs.mts. One subject across all
// six is the whole point: the grid varies by style alone, so the user is
// comparing the only thing they are actually choosing. A gradient placeholder
// here would be a lie about the product's central claim.
//
// THE CARDS CARRY NO WORDS BUT THE NAME. Each used to sit under its own line of
// copy ("Editorial flat vector. The default for argument-led explainers.") and
// repeat that line in a native `title=`. The picture above it is a render of
// exactly the style the sentence was describing, at the size the user is
// judging it at — the sentence was the weaker of the two. The line still
// exists, and it is now read once, large, in the showcase the rail drives.
//
// "From a brief" went with it. It minted a style called "Untitled style" whose
// four slots were a hardcoded generic block, which is not a brief — it is a
// blank the user then had to overwrite in full, and the wall filled with
// abandoned ones. Styles start from a preset here; a style from words is the
// dossier's job, on a style that already exists.

import Image from "next/image";

import { Ghost } from "@/components/ui/signal";
import { styleFits, type DisciplineFilter } from "@/lib/themes";

import { PRESETS, thumbSrc, type Preset } from "./presets";

export default function PresetRail({
  onPick,
  onConsider,
  busy,
  discipline,
}: {
  onPick: (p: Preset) => void;
  /** Which preset the pointer or keyboard focus is on. Reported UP so the
   *  showcase in the middle column can play its clip — the rail is 240px wide
   *  and a five-second clip deserves more than a postage stamp. */
  onConsider?: (p: Preset) => void;
  busy: boolean;
  /** The atelier's discipline filter: the SAME predicate the style pills use
   *  (lib/themes.ts#styleFits), so the rail and the wall never disagree. */
  discipline: DisciplineFilter;
}) {
  const shown = PRESETS.filter((p) => styleFits(p, discipline));
  return (
    <aside>
      {/* Not a flex row: at 240px the label wraps to two lines, and a flex
          count then sits marooned beside the first of them. Inline, it follows
          the last word wherever that word lands. */}
      <p className="font-jetbrains mb-2 text-content tracking-[0.18em] text-white/40 uppercase">
        start from a preset <span className="tracking-normal text-white/30">{shown.length}</span>
      </p>
      {/* Absence is DRAWN: every preset today is written for explainers, so a
          trailer or free filter empties this rail. */}
      {!shown.length && <Ghost shape="card" count={1} label="No preset for this discipline" />}
      <div className="space-y-2">
        {shown.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            onPointerEnter={() => onConsider?.(p)}
            onFocus={() => onConsider?.(p)}
            disabled={busy}
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
            <span className="font-hanken block px-2.5 py-2 text-content text-white/85 group-hover:text-white">
              {p.name}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
