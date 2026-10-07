"use client";

// THE CARD SHELL — what a card is, and what it is never handed.
//
// A card receives its ENTRY, its WORLD position (x, y — a number the layout
// computed, not a screen position), five booleans about itself and a skin. It
// receives NO camera, no callback and no sibling. That is rung 1 of the
// performance ladder, and it is structural: the container owns the pan/zoom
// transform on one parent element and writes it to the DOM directly, so a pan
// step cannot reach a card's props. A card that computed its own screen
// position would be invalidated by every pan by construction, and no
// memoization recovers that.
//
// NO CALLBACKS, because every pointer interaction is delegated: the canvas puts
// one listener on the viewport and finds the card with `closest("[data-card]")`.
// A callback handed to 500 cards is 500 chances to defeat memoization with a
// fresh closure; here there is nothing to hand.
//
// MEMOIZED ON IDENTITY + VERSION (`areEqual`), not on the entry object: a
// reload returns 500 brand-new objects for the same cards, and `version` is
// the source's promise that a card's own data changed. `enter` is deliberately
// NOT compared — it matters only at mount (the entrance stagger), and the
// per-wave bookkeeping that changes it must not re-render a mounted card.
//
// THREE LAYERS, because three things want the `transform` property and one
// element cannot give it to all of them: the outer layer is the card's place in
// the world (and its glide to a new place), the middle one is the entrance, the
// inner one is the press lift.

import { memo, useLayoutEffect, useRef, useState } from "react";

import { Ellipsis } from "lucide-react";
import { animate } from "motion/react";

import type { PipelineEntry } from "@/lib/board/pipeline";
import { EASE } from "@/components/ui/tokens";

import { CARD_H, CARD_W } from "./geometry";
import { STAGE_TONE } from "./tone";
import type { PipelineSkin } from "./types";

export interface CardProps {
  entry: PipelineEntry;
  /** World position — from the layout, never from the camera. */
  x: number;
  y: number;
  /** The lane's label, for the accessible name. */
  lane: string;
  selected: boolean;
  /** The keyboard cursor. */
  active: boolean;
  /** Being dragged, in flight or waiting on a prompt: the home slot dims. */
  away: boolean;
  /** A move is awaiting the authority's answer. */
  busy: boolean;
  /** The last move was refused or failed. */
  flagged: boolean;
  /** Animate to a new place instead of jumping. Off above the choreography cap. */
  glide: boolean;
  /** Entrance delay in ms, or null. Read once, at mount. */
  enter: number | null;
  /** "4 of 9", only on the active card — the others would all re-render every
   *  time a sibling joined their cell. */
  pos: string | null;
  skin: PipelineSkin;
  domId: string;
}

const areEqual = (a: CardProps, b: CardProps): boolean =>
  a.entry.item.id === b.entry.item.id &&
  a.entry.item.version === b.entry.item.version &&
  a.x === b.x &&
  a.y === b.y &&
  a.lane === b.lane &&
  a.selected === b.selected &&
  a.active === b.active &&
  a.away === b.away &&
  a.busy === b.busy &&
  a.flagged === b.flagged &&
  a.glide === b.glide &&
  a.pos === b.pos &&
  a.skin === b.skin &&
  a.domId === b.domId;

export const Card = memo(function Card({ entry, x, y, lane, selected, active, away, busy, flagged, glide, enter, pos, skin, domId }: CardProps) {
  const item = entry.item;
  const stage = entry.placement.stage;
  const tone = STAGE_TONE[stage];
  const enterRef = useRef<HTMLDivElement>(null);
  const [enterAtMount] = useState(enter);

  useLayoutEffect(() => {
    const el = enterRef.current;
    if (enterAtMount === null || !el) return;
    const a = animate(
      el,
      { opacity: [0, 1], y: [14, 0], scale: [0.96, 1] },
      { delay: enterAtMount / 1000, duration: 0.42, ease: [...EASE] as [number, number, number, number] },
    );
    return () => a.stop();
  }, [enterAtMount]);

  const name = `${item.title}, ${stage}${entry.placement.band ? ` · ${entry.placement.band}` : ""}, ${lane}${selected ? ", selected" : ""}${
    pos ? `, ${pos}` : ""
  }`;

  return (
    <div
      className="absolute top-0 left-0"
      style={{
        width: CARD_W,
        height: CARD_H,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        transition: glide ? "transform 340ms var(--gt-ease)" : undefined,
      }}
    >
      <div ref={enterRef} className="h-full w-full" style={enterAtMount === null ? undefined : { opacity: 0 }}>
        <div
          id={domId}
          data-card={item.id}
          role="group"
          aria-roledescription="card"
          aria-label={name}
          aria-current={active ? "true" : undefined}
          aria-busy={busy || undefined}
          className={`group relative h-full w-full cursor-grab overflow-hidden rounded-xl border transition-[border-color,background-color,opacity,box-shadow] duration-150 select-none hover:border-white/30 active:-translate-y-px active:cursor-grabbing active:shadow-lg active:shadow-black/40 ${
            selected ? "border-cyan-300/70 bg-cyan-300/[0.12]" : tone.card
          } ${flagged ? "border-rose-300/70" : ""} ${away ? "opacity-30" : ""} ${busy ? "animate-pulse" : ""} ${
            active ? "ring-2 ring-cyan-300/80 ring-offset-1 ring-offset-[var(--gt-ink)]" : ""
          }`}
        >
          {skin.face ? skin.face(entry) : <DefaultFace entry={entry} />}
          <button
            type="button"
            data-verbs
            tabIndex={-1}
            aria-haspopup="menu"
            aria-label={`Actions for ${item.title}`}
            className="absolute top-1.5 right-1.5 grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            <Ellipsis className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}, areEqual);

/** What a card says when its skin says nothing: the title and the first facts,
 *  verbatim. */
export function DefaultFace({ entry }: { entry: PipelineEntry }) {
  const facts = entry.facts.slice(0, 2);
  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-0.5 pr-10 pl-3">
      <p className="font-hanken truncate text-label text-white/90">{entry.item.title}</p>
      <p className="font-jetbrains truncate text-label text-white/50">
        {facts.length ? facts.map((f) => `${f.name} ${f.value}`).join(" · ") : entry.item.group ?? ""}
      </p>
    </div>
  );
}
