// v2 · SPATIAL FIELD — glass, depth and air; lanes implied by light, not drawn.
//
// THE BET. Nothing on this board is a row in a table; everything is an OBJECT
// lying a few millimetres above a lit surface. Three mechanisms carry that and
// nothing else does:
//
//   · LIGHT INSTEAD OF A RULE. `world` puts one large soft radial wash per lane,
//     cycling the three accent hues, so a lane is a region of coloured light
//     rather than a bounded band. The stage columns are a second, flatter light:
//     the gate column is warm, working is cool, done is green, proposed is bare.
//     No lane border is drawn anywhere.
//   · DEPTH ON THE CARD. The face is a `backdrop-blur` plate with a 1px top
//     highlight, so the lane's light reads THROUGH it, out of focus. That is
//     the whole reason the world layer exists, and it is also this direction's
//     true cost: a blur is a compositing pass per card, and the cost is paid
//     per mounted card on every frame of a pan.
//   · AIR. One line of 1.125rem name and one line of 1rem fact, a 44px plate on
//     the left and nothing else. Two marks of information per card against the
//     ledger's five, which is exactly the "items per screen" the bet gives up.
//
// WHERE IT LOSES: items per screen, and honesty at volume. Light is a poor
// counter — four cards in a wash and four hundred in the same wash look alike
// from the same distance, where the ledger's ruling tells you at a glance.
//
// THE MEASURED TRAP THIS DIRECTION WAS WARNED ABOUT. A `<Ghost>` at ~0.12
// effective alpha was invisible on this app's ink ground and every gate stayed
// green; only photographing the screen caught it. So nothing below was chosen
// by eye. The board was rendered at 2432x1180, photographed, and the PNG's own
// pixels were read back and compared against the SAME points on v1, which draws
// no wash at all and is therefore the control:
//
//   point                         v1 (control)   v2 (this)       vs bare ink
//   bare ink, far gutter          rgb(8,10,16)   rgb(8,10,16)    1.00:1
//   lane 1, cyan wash centre      rgb(11,13,19)  rgb(27,50,58)   1.47:1
//   lane 2, violet wash centre    rgb(11,13,19)  rgb(34,31,52)   1.24:1
//   gate column, no card over it  rgb(19,18,17)  rgb(35,31,18)   1.20:1
//   working column, no card       rgb(9,14,20)   rgb(14,30,37)   1.16:1
//
// 1.47:1 is not a text contrast and is not claimed as one — these are FIELDS of
// tens of thousands of pixels, where area does the work a 1px dashed outline
// could not, and the control column is the proof that each one actually moved
// the pixel rather than merely appearing in a stylesheet. The VIOLET lane is
// the weakest of the three at 1.24:1 and is the first thing to re-measure if
// the ink ground is ever lightened. Nothing here is drawn below 0.07 alpha.

import { AudioLines, Film, Image as ImageIcon, Type } from "lucide-react";

import type { BoardMedia } from "@/lib/board/types";
import type { CanonStage, PipelineEntry } from "@/lib/board/pipeline";

import { CARD_H, type Layout } from "../geometry";
import type { PipelineSkin } from "../types";

/** What the artifact IS, on the plate. Not a decoration: a take, a frame and a
 *  draft are three different things to pick up, and the shape says which. */
const PLATE_ICON: Record<BoardMedia["kind"], typeof AudioLines> = {
  audio: AudioLines,
  image: ImageIcon,
  video: Film,
  text: Type,
};

/** The lit edge of the plate, per stage — the gate's is warm and the brightest
 *  ring on the board, which is how this direction tells gate from working in
 *  KIND rather than by column (lib/board/pipeline.ts STAGE_MEANS). */
const PLATE_RING: Record<CanonStage, string> = {
  proposed: "ring-white/15",
  working: "ring-cyan-300/40",
  gate: "ring-amber-300/60",
  done: "ring-emerald-300/30",
};

/** The glow INSIDE the card, so an object that needs a person is lit from
 *  within. The gate's breathes; `animate-pulse` is a CSS animation, which the
 *  blanket prefers-reduced-motion rule at the foot of app/globals.css switches
 *  off for free. */
const INNER_GLOW: Record<CanonStage, string> = {
  proposed: "",
  working: "shadow-[inset_0_0_36px_-14px] shadow-cyan-300/60",
  gate: "animate-pulse shadow-[inset_0_0_38px_-10px] shadow-amber-300/70",
  done: "shadow-[inset_0_0_36px_-16px] shadow-emerald-300/50",
};

/** A sphere of light on the plate. `--gt-ink-bright` mixed down rather than a
 *  white literal, so the plate tracks the palette's own foreground. */
const PLATE_WASH =
  "radial-gradient(circle at 34% 26%, color-mix(in srgb, var(--gt-ink-bright) 24%, transparent) 0%, transparent 72%)";

const valueOf = (entry: PipelineEntry, name: string): string | undefined =>
  entry.facts.find((f) => f.name === name)?.value;

function fieldFace(entry: PipelineEntry) {
  const stage = entry.placement.stage;
  const Icon = PLATE_ICON[entry.item.media[0]?.kind ?? "text"];
  // TWO MARKS, AND THE TITLE KEEPS THE WIDTH. This face was measured three
  // ways at 272x80. Three facts (`provider · 10 s · $…`) always ellipsed the
  // price. Giving the price its own column on the title's line fixed the price
  // and cut the title to about twelve characters — which is the one thing on a
  // board that must never be guessed at. So the title takes the full line, and
  // the sub-line is the shortest pair that is still worth reading: who made it
  // and what it cost. At 1rem mono in the 170px left beside the plate that is
  // 17 characters; only `elevenlabs` plus a five-figure price overruns it, by
  // about one glyph.
  const line = [valueOf(entry, "provider") ?? valueOf(entry, "model"), valueOf(entry, "cost") ?? valueOf(entry, "length") ?? valueOf(entry, "status")]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="absolute inset-0 flex items-center gap-2.5 pr-11 pl-2 shadow-[inset_0_1px_0_0_var(--gt-surface-top)] backdrop-blur-[10px]">
      <span aria-hidden className={`absolute inset-0 rounded-xl ${INNER_GLOW[stage]}`} />
      <span aria-hidden className={`relative grid size-10 shrink-0 place-items-center rounded-full ring-1 ${PLATE_RING[stage]}`} style={{ backgroundImage: PLATE_WASH }}>
        <Icon className="size-5 text-white/75" strokeWidth={1.25} aria-hidden />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="font-hanken block truncate text-content leading-tight text-white/95">{entry.item.title}</span>
        <span className="font-jetbrains block truncate text-label tabular-nums text-white/55">{line || entry.item.group || entry.item.source}</span>
      </span>
    </div>
  );
}

/** One wash per lane, cycling the three accents. The percentages are the ones
 *  measured in this file's header; the falloff stops at 74% so two neighbouring
 *  lanes do not pool into one bright band down the middle of the board. */
const LANE_LIGHT = [
  "radial-gradient(60% 135% at 15% 50%, color-mix(in srgb, var(--gt-accent-cyan) 22%, transparent) 0%, transparent 74%)",
  "radial-gradient(60% 135% at 15% 50%, color-mix(in srgb, var(--gt-accent-violet) 20%, transparent) 0%, transparent 74%)",
  "radial-gradient(60% 135% at 15% 50%, color-mix(in srgb, var(--gt-accent-emerald) 20%, transparent) 0%, transparent 74%)",
];

/** The stage's own light. Flat, not a gradient, and rounded: a panel of lit
 *  surface the lane light passes over. Amber has no token in this repo and
 *  stays a Tailwind utility (components/ui/tokens.ts). */
const STAGE_LIGHT: Record<CanonStage, string> = {
  proposed: "bg-white/[0.015]",
  working: "bg-cyan-300/[0.04]",
  gate: "bg-amber-300/[0.07]",
  done: "bg-emerald-300/[0.03]",
};

function fieldWorld(layout: Layout) {
  return (
    <div aria-hidden className="absolute top-0 left-0">
      {layout.stages.map((span) => (
        <span
          key={span.stage}
          className={`absolute top-0 left-0 rounded-[36px] ${STAGE_LIGHT[span.stage]}`}
          style={{ transform: `translate3d(${span.x - 8}px, -10px, 0)`, width: span.w + 16, height: layout.height + 20 }}
        />
      ))}
      {layout.lanes.map((lane, i) => (
        <span
          key={lane.key}
          className="absolute top-0 left-0"
          // Wider and taller than the lane on purpose: light does not stop at
          // the edge of the thing it is lighting, and a wash clipped to a lane
          // box would draw the box this direction refuses to draw.
          style={{
            transform: `translate3d(-40px, ${lane.y - CARD_H / 2}px, 0)`,
            width: layout.width + 80,
            height: lane.h + CARD_H,
            backgroundImage: LANE_LIGHT[i % LANE_LIGHT.length],
          }}
        />
      ))}
    </div>
  );
}

export const field: PipelineSkin = {
  face: fieldFace,
  world: fieldWorld,
  // The words of a place rather than a process. "needs you" is the one label on
  // this board that names a person, which is the whole difference the canon
  // keeps between `gate` and `working`.
  stageLabel: { working: "in flight", gate: "needs you", done: "landed" },
};
