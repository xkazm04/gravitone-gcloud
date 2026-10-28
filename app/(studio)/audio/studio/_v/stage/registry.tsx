// THE STAGE'S KIND REGISTRY (registry schema-driven-ui, registry-mapping): the one table from each of
// the eight node kinds to where it stands on the stage and the component that draws it. Dispatch is a
// lookup, never a switch; every piece renders inside its own boundary, so a piece that throws becomes
// one quiet line in its own slot and the rest of the stage stays up. An unknown kind never reaches
// here (the door dropped it and the side panel's backstage notes say so).
import { Component, type ReactNode } from "react";

import type { StudioNode, StudioNodeKind, StudioNodeOf } from "@gt/domain/audio.studio";

import { Band } from "./Band.tsx";
import type { StageCtx } from "./ctx.ts";
import { House } from "./House.tsx";
import { Lights } from "./Lights.tsx";
import { HeardCard, PullCard, Readout } from "./Notes.tsx";
import { Spotlights } from "./Spotlights.tsx";
import { Wings } from "./Wings.tsx";
import s from "./stage.module.css";

/** Where a kind stands: the house transport, the stage floor, the lighting strip, a wing, the note
 *  rail at the stage edge, the engineer's corner, or the spotlights under the stage. */
export type Place = "house" | "floor" | "strip" | "wing" | "notes" | "corner" | "spotlights";

type Entry<K extends StudioNodeKind> = {
  readonly place: Place;
  /** What this kind is on the stage, in words (the boundary's line names it). */
  readonly words: string;
  readonly View: (p: { readonly node: StudioNodeOf<K>; readonly ctx: StageCtx }) => ReactNode;
};

export const STAGE_KINDS: { readonly [K in StudioNodeKind]: Entry<K> } = {
  track: { place: "house", words: "the song", View: House },
  stems: { place: "floor", words: "the band", View: Band },
  sections: { place: "strip", words: "the lighting strip", View: Lights },
  candidates: { place: "wing", words: "the players in the wings", View: Wings },
  heard: { place: "notes", words: "the director's note", View: HeardCard },
  pull: { place: "notes", words: "the question card", View: PullCard },
  duel: { place: "spotlights", words: "the two spotlights", View: Spotlights },
  measures: { place: "corner", words: "the engineer's readout", View: Readout },
};

export const placeOf = (n: StudioNode): Place => STAGE_KINDS[n.kind].place;

/** One piece, by lookup, inside its own boundary. */
export function Piece({ node, ctx }: { readonly node: StudioNode; readonly ctx: StageCtx }) {
  const entry = STAGE_KINDS[node.kind] as Entry<StudioNodeKind>;
  const View = entry.View as (p: { readonly node: StudioNode; readonly ctx: StageCtx }) => ReactNode;
  return (
    <Slot words={entry.words} at={node.id}>
      <View node={node} ctx={ctx} />
    </Slot>
  );
}

type SlotProps = { readonly words: string; readonly at: string; readonly children: ReactNode };

/** A piece's containment: its failure is drawn in its own slot, in words, and goes no further. */
class Slot extends Component<SlotProps, { readonly failed: string | null }> {
  override state = { failed: null as string | null };

  static getDerivedStateFromError(e: unknown): { failed: string } {
    return { failed: e instanceof Error ? e.message : String(e) };
  }

  override render(): ReactNode {
    if (this.state.failed === null) return this.props.children;
    return (
      <p className={s.slotFailed} role="status">
        {`${this.props.words} could not be drawn (${this.props.at}): ${this.state.failed}`}
      </p>
    );
  }
}
