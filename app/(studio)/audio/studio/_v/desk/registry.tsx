// THE DESK'S KIND -> COMPONENT REGISTRY (spark audio-agent-studio, variant "desk"; registry
// schema-driven-ui, registry-mapping). One entry per node kind of the closed vocabulary - the
// `satisfies` makes a ninth kind a type error here until it has a place - naming where on the desk
// the kind stands, the component that realizes it, what stands there when the desk has none of it,
// and its containment: a piece that throws draws its own one-line failure in its own slot and the
// rest of the desk lives. An unknown kind never reaches this table: the door dropped it and the
// desk notes say so.
import { Component, type ReactNode } from "react";

import type { StudioNode, StudioNodeKind } from "@gt/domain/audio.studio";
import type { Placed } from "@gt/ui/components/studio-desk/desk.ts";

import type { DeskCtx } from "./ctx.ts";
import { LanesAbsent, RulerAbsent, SectionsRuler, StemLanes } from "./Lanes.tsx";
import { DuelSwitch, MasterAbsent, MeasureChips, TrackLane } from "./Master.tsx";
import { HeardLine, PullSides } from "./Sentence.tsx";
import { TryInstead } from "./TryInstead.tsx";
import s from "./desk.module.css";

/** Where on the desk a kind stands. */
export type DeskPlace = "strip" | "ruler" | "master" | "lanes" | "drawer" | "transport" | "chips";

type Entry<K extends StudioNodeKind> = {
  readonly place: DeskPlace;
  readonly View: (p: { readonly placed: Placed<K>; readonly ctx: DeskCtx }) => ReactNode;
  /** What stands in the place when the desk has none of this kind (null: the place stays empty). */
  readonly Absent: (() => ReactNode) | null;
  /** Its failure, in words, when its component throws. */
  readonly broken: string;
};

export const DESK_REGISTRY = {
  heard: { place: "strip", View: HeardLine, Absent: null, broken: "what I heard could not be drawn" },
  pull: { place: "strip", View: PullSides, Absent: null, broken: "the two wishes could not be drawn" },
  sections: { place: "ruler", View: SectionsRuler, Absent: RulerAbsent, broken: "the sections could not be drawn" },
  track: { place: "master", View: TrackLane, Absent: MasterAbsent, broken: "the track could not be drawn" },
  stems: { place: "lanes", View: StemLanes, Absent: LanesAbsent, broken: "the parts could not be drawn" },
  candidates: { place: "drawer", View: TryInstead, Absent: null, broken: "the instruments to try could not be drawn" },
  duel: { place: "transport", View: DuelSwitch, Absent: null, broken: "the comparison could not be drawn" },
  measures: { place: "chips", View: MeasureChips, Absent: null, broken: "the measures could not be drawn" },
} as const satisfies { readonly [K in StudioNodeKind]: Entry<K> };

const REG: { readonly [K in StudioNodeKind]: Entry<K> } = DESK_REGISTRY;
/** Kinds the desk draws once (its place holds one); the rest are said in the desk notes. */
const SINGLE: ReadonlySet<StudioNodeKind> = new Set(["track", "sections", "stems", "heard", "pull", "duel"]);

/** One piece's containment: its failure stays in its slot. */
class Contained extends Component<{ readonly broken: string; readonly children: ReactNode }, { readonly error: string | null }> {
  override state: { readonly error: string | null } = { error: null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  override render(): ReactNode {
    if (this.state.error !== null) return <p className={s.broken} role="status">{`${this.props.broken}: ${this.state.error}`}</p>;
    return this.props.children;
  }
}

function one<K extends StudioNodeKind>(kind: K, placed: Placed<K>, ctx: DeskCtx): ReactNode {
  const entry = REG[kind];
  const View = entry.View;
  return (
    <Contained key={`${placed.turnId}/${placed.node.id}`} broken={entry.broken}>
      <View placed={placed} ctx={ctx} />
    </Contained>
  );
}

/** Draw the desk's pieces of one kind (those `only` keeps), or the kind's absent state when it has none at all. */
export function drawKind<K extends StudioNodeKind>(kind: K, ctx: DeskCtx, only?: (node: StudioNode) => boolean): ReactNode {
  const all: readonly Placed<K>[] = ctx.desk[kind];
  const kept = (only === undefined ? all : all.filter((p) => only(p.node as StudioNode))).slice(0, SINGLE.has(kind) ? 1 : undefined);
  if (kept.length === 0) {
    const Absent = REG[kind].Absent;
    return only === undefined && Absent !== null ? <Absent /> : null;
  }
  return kept.map((p) => one(kind, p, ctx));
}

/** How many pieces of a kind the desk holds past the one its place shows (a desk draws one track, one ruler, one set of lanes). */
export function extras(ctx: DeskCtx): readonly string[] {
  return [...SINGLE].filter((k) => ctx.desk[k].length > 1).map((k) => `${ctx.desk[k].length - 1} more ${k} piece${ctx.desk[k].length > 2 ? "s" : ""} not shown: the desk shows one at a time`);
}
