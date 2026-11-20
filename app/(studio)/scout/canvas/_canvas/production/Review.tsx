"use client";

// THE CUT'S REVIEW ON THE STREET (spark character-cores WP3): the production's takes on its track map as @gt/ui's
// Timeline, played against the track, with a verdict and a direction per take written through the canvas port's
// `productionVerdict`. The production the port answers with replaces the store's (the street and the river redraw
// from it); a refusal lands under the timeline as the side's own sentence.
//
// The reasons are the scout source's video axes (craft, motion, style first), the same vocabulary the round's Board
// packet keys (@gt/ui/board/productionReasons), so a take judged here and in the gallery speaks one language.

import { useState } from "react";

import type { Production } from "@gt/domain/productionGraph";
import { productionReasons } from "@gt/ui/board/productionReasons";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Timeline, type TimelineBlock, type TimelineVerdict } from "@gt/ui/components/timeline/Timeline.tsx";

import type { CanvasStore } from "../store.ts";

const REASONS = productionReasons();

/** A production's clips as the timeline's blocks, each with its take-start still as the poster. */
export function blocksOf(p: Production): TimelineBlock[] {
  return p.nodes
    .filter((n) => n.station === "clip" && n.at !== undefined && n.dur !== undefined)
    .map((n) => {
      const start = n.madeFrom.map((id) => p.nodes.find((m) => m.id === id)).find((m) => m?.station === "keyframe" && m.media?.kind === "image");
      return {
        id: n.id,
        label: n.label,
        at: n.at ?? 0,
        dur: n.dur ?? 0,
        state: n.state,
        ...(n.verdict === undefined ? {} : { verdict: n.verdict }),
        ...(n.media?.kind === "video" ? { video: n.media.src } : {}),
        ...(start?.media === undefined ? {} : { poster: start.media.src }),
      };
    });
}

/** Writes one verdict through the port; the production it answers with replaces the store's. Answers the refusal. */
async function writeVerdict(st: CanvasStore, production: string, v: TimelineVerdict): Promise<string | null> {
  const got = await st.port.productionVerdict({ production, node: v.node, verdict: v.verdict, reasons: v.reasons, ...(v.note === undefined ? {} : { note: v.note }) });
  if (!got.ok) return got.error.error;
  const after = got.value.production;
  st.prod.productions = st.prod.productions.map((x) => (x.id === after.id ? after : x));
  for (const r of st.scene.rivers) if (r.prod?.id === after.id) r.prod = after;
  st.changed("verdict");
  return null;
}

export function Review({ st, p }: { readonly st: CanvasStore; readonly p: Production }) {
  const [error, setError] = useState<string | null>(null);
  const judge = async (v: TimelineVerdict): Promise<void> => {
    setError(null);
    setError(await writeVerdict(st, p.id, v));
  };
  return (
    <div data-role="street-review">
      <Timeline track={p.track} blocks={blocksOf(p)} reasons={REASONS} noteMax={REASONS.noteMax} onVerdict={(v) => void judge(v)} />
      {error !== null && <ErrorLine message={error} live />}
    </div>
  );
}
