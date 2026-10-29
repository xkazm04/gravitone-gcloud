"use client";

// THE STUDIO VIEW'S KIND -> COMPONENT REGISTRY (spark audio-agent-studio, stage S2; registry
// schema-driven-ui, registry-mapping). One entry per node kind of the closed vocabulary - the
// `satisfies` makes a ninth kind a type error here until it has a place - naming where in a card the
// kind stands, the desk component that realizes it, what stands there when the card has none of it,
// and its containment: a piece that throws draws its own one-line failure in its own slot and the
// rest of the card lives. An unknown kind never reaches this table: the door dropped it and the
// card's notes say so.
import { Component, type ReactNode } from "react";

import type { StudioNode, StudioNodeKind } from "@gt/domain/audio.studio";
import type { Placed } from "@gt/ui/components/studio-desk/desk.ts";

import type { CardCtx } from "./ctx.ts";
import { LanesAbsent, RulerAbsent, SectionsRuler, StemLanes } from "./Lanes.tsx";
import { HeardLine, PullSides } from "./Sentence.tsx";
import { DuelSwitch, MasterAbsent, MeasureChips, TrackLane } from "./Track.tsx";
import { SunoPromptStub, TasteStub } from "./Suno.tsx";
import { TryInstead } from "./TryInstead.tsx";
import s from "./view.module.css";

/** Where in a card a kind stands. */
export type CardPlace = "strip" | "ruler" | "master" | "lanes" | "drawer" | "transport" | "chips" | "prompt" | "taste";

type Entry<K extends StudioNodeKind> = {
  readonly place: CardPlace;
  readonly View: (p: { readonly placed: Placed<K>; readonly ctx: CardCtx }) => ReactNode;
  /** What stands in the place when the card has none of this kind (null: the place stays empty). */
  readonly Absent: (() => ReactNode) | null;
  /** Its failure, in words, when its component throws. */
  readonly broken: string;
};

export const VIEW_REGISTRY = {
  heard: { place: "strip", View: HeardLine, Absent: null, broken: "what I heard could not be drawn" },
  pull: { place: "strip", View: PullSides, Absent: null, broken: "the two wishes could not be drawn" },
  sections: { place: "ruler", View: SectionsRuler, Absent: RulerAbsent, broken: "the sections could not be drawn" },
  track: { place: "master", View: TrackLane, Absent: MasterAbsent, broken: "the track could not be drawn" },
  stems: { place: "lanes", View: StemLanes, Absent: LanesAbsent, broken: "the parts could not be drawn" },
  candidates: { place: "drawer", View: TryInstead, Absent: null, broken: "the instruments to try could not be drawn" },
  duel: { place: "transport", View: DuelSwitch, Absent: null, broken: "the comparison could not be drawn" },
  measures: { place: "chips", View: MeasureChips, Absent: null, broken: "the measures could not be drawn" },
  suno_prompt: { place: "prompt", View: SunoPromptStub, Absent: null, broken: "the Suno prompt could not be drawn" },
  taste: { place: "taste", View: TasteStub, Absent: null, broken: "the taste lines could not be drawn" },
} as const satisfies { readonly [K in StudioNodeKind]: Entry<K> };

const REG: { readonly [K in StudioNodeKind]: Entry<K> } = VIEW_REGISTRY;
/** Kinds a card draws once (its place holds one); the rest are said in the card's notes. */
export const SINGLE: ReadonlySet<StudioNodeKind> = new Set(["track", "sections", "stems", "heard", "pull", "duel", "suno_prompt"]);

/** One piece's containment: its failure stays in its slot. */
class Contained extends Component<{ readonly broken: string; readonly children: ReactNode }, { readonly error: string | null }> {
  override state: { readonly error: string | null } = { error: null };
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  override render(): ReactNode {
    if (this.state.error !== null) return <p className={s.broken} role="status">{`${this.props.broken} (${this.state.error}). The rest of the answer still works.`}</p>;
    return this.props.children;
  }
}

function one<K extends StudioNodeKind>(kind: K, placed: Placed<K>, ctx: CardCtx): ReactNode {
  const entry = REG[kind];
  const View = entry.View;
  return (
    <Contained key={`${placed.turnId}/${placed.node.id}`} broken={entry.broken}>
      <View placed={placed} ctx={ctx} />
    </Contained>
  );
}

/** Draw the card's pieces of one kind (those `only` keeps), or the kind's absent state when it has none at all. */
export function drawKind<K extends StudioNodeKind>(kind: K, ctx: CardCtx, only?: (node: StudioNode) => boolean): ReactNode {
  const all: readonly Placed<K>[] = ctx.desk[kind];
  const kept = (only === undefined ? all : all.filter((p) => only(p.node as StudioNode))).slice(0, SINGLE.has(kind) ? 1 : undefined);
  if (kept.length === 0) {
    const Absent = REG[kind].Absent;
    return only === undefined && Absent !== null ? <Absent /> : null;
  }
  return kept.map((p) => one(kind, p, ctx));
}

/** How many pieces of a kind a card holds past the one its place shows. */
export function extras(ctx: Pick<CardCtx, "desk">): readonly string[] {
  return [...SINGLE].filter((k) => ctx.desk[k].length > 1).map((k) => `${ctx.desk[k].length - 1} more ${k} piece${ctx.desk[k].length > 2 ? "s" : ""} not shown: a card shows one at a time`);
}
