// THE PIPELINE AXIS — what a Board source says when it has STAGES, not just a verdict.
//
// `BoardSource` (./types.ts) asks one question per item: approve, reject, or
// undecided. That is the right question for an inbox, and it is the wrong
// question for a pipeline, where the item's position IS the state and moving it
// is the act. A run at the gate and a run being drafted are both "undecided" to
// the Board, and the difference between them is the only thing a pipeline canvas
// draws.
//
// So this file adds ONE axis to the existing contract and changes nothing else.
// `PipelineCapable` is OPTIONAL on a source: the eight verdict-only adapters
// compile and render exactly as before, and a source opts in by implementing it.
// There is deliberately no second normalizer — a source's native shape is
// translated once, by its own adapter, and everything downstream (ordering,
// grouping, keyboard, bulk moves, drag) sees one contract. Two normalizers for
// one job is how a unified surface becomes N surfaces wearing one frame.
//
// THE FOUR STAGES ARE A CANON, NOT A UNION OF WHAT THE LANES HAPPEN TO HAVE.
// Articles has eleven statuses and Audio has four; neither gets to decide the
// board's geometry, because an operator who switches media mode should not have
// to re-learn where things are. Each adapter maps its own machine onto the canon
// and declares SUB-BANDS where it has detail worth seeing — Articles draws four
// inside `working`, Audio draws none. The furniture stays still; the detail is
// honest.

import type { BoardItem } from "./types";
import type { BoardEntry, BoardSourceExt } from "./source";

/** The X axis, for every media type, forever. Order is the pipeline's order. */
export const CANON_STAGES = ["proposed", "working", "gate", "done"] as const;
export type CanonStage = (typeof CANON_STAGES)[number];

export const STAGE_INDEX: Record<CanonStage, number> = { proposed: 0, working: 1, gate: 2, done: 3 };

/** What each stage MEANS, so an adapter cannot quietly repurpose one.
 *
 *  `gate` is the only stage that is waiting on the HUMAN. `working` is waiting
 *  on a machine. Keeping those apart is the whole reason the canon has four
 *  columns and not three: a surface that mixes "is happening" with "needs me"
 *  teaches its operator that most items need nothing, and then the ones that do
 *  are missed. The skins are required to distinguish `gate` from `working` in
 *  KIND — colour, weight, chrome — not merely by its position on the X axis. */
export const STAGE_MEANS: Record<CanonStage, string> = {
  proposed: "a candidate nothing has been spent on yet",
  working: "a machine is working; nobody is waiting on you",
  gate: "waiting on your judgement",
  done: "landed; leaves the board on its own",
};

/** A sub-column inside a stage. A lane with one band draws its header bare. */
export interface StageBand {
  id: string;
  label: string;
}

/** Where one item sits. `band` is null when its stage declares no bands; `lane`
 *  is never null — an item with no group takes UNGROUPED_LANE. */
export interface PipelinePlacement {
  stage: CanonStage;
  band: string | null;
  lane: string;
}

/** The ungrouped row's key. The same glyph `app/playground/arrange/model.ts`
 *  already uses, because a second spelling of "no group" is a second bug. */
export const UNGROUPED_LANE = "∅";

/** A Board item with its place on the canvas.
 *
 *  `version` exists for one reason: a canvas memoizes a card on identity +
 *  version, so that a card re-renders when its OWN data changes and never when
 *  a sibling's does. Bump it on every server-confirmed change. */
export type PipelineItem = BoardItem & {
  lane: string;
  placement: PipelinePlacement;
  version: number;
};

export type PipelineEntry = BoardEntry & {
  item: PipelineItem;
  placement: PipelinePlacement;
};

/** One way to group the Y axis. Only axes the adapter knows are POPULATED
 *  belong here — an axis that reads blank for most items is a worse board than
 *  no axis, because the operator cannot tell "ungrouped" from "unwritten". */
export interface GroupAxis {
  id: string;
  label: string;
  of(item: PipelineItem): string;
}

export interface LaneDef {
  key: string;
  label: string;
}

/** What a move will cost, stated BEFORE it is made.
 *
 *  Every number here is omitted when unknown — never `null`, never `0`, because
 *  `0` is a real answer ("this is free") and the difference matters when the
 *  figure is money. `note` is always present and always says where the figures
 *  came from, so a modal never implies a precision the measurement does not
 *  have. */
export interface MoveCost {
  usdLow?: number;
  usdHigh?: number;
  turnsLow?: number;
  turnsHigh?: number;
  seconds?: number;
  note: string;
}

/** The answer to "what would happen if I dropped this here?", asked while the
 *  pointer is still down and the user can still change their mind.
 *
 *  A drop whose placement a backend owns is a REQUEST, not a commit: the canvas
 *  previews, submits, and reconciles against the authority's answer. It never
 *  renders the move as done because a pointer was released. `needs` is how an
 *  adapter demands the input the authority will require anyway — a rework note,
 *  a finalize label, a confirmation for a move that spends money — so the
 *  refusal happens in the hand, before the write, instead of as a 409 after it. */
export type MoveOffer =
  | { kind: "ok" }
  | {
      kind: "needs";
      needs: MoveNeed;
      prompt: string;
      cost?: MoveCost;
      /** A default the prompt should open with - a suggested label, a previous
       *  note. Its own field rather than prose inside `prompt`, because a
       *  dialog has to put it in an input, and parsing it back out of a
       *  sentence is how a suggestion becomes a sentence the operator deletes. */
      suggest?: string;
    }
  | { kind: "refused"; reason: string };

export type MoveNeed = "note" | "label" | "confirm";

export interface MoveRequest {
  itemId: string;
  to: CanonStage;
  band: string | null;
  /** A move down the Y axis as well as across. Omitted = keep the lane. */
  lane?: string;
  /** WHICH GROUPING the lane was read under, when `lane` is set.
   *
   *  The Y axis is a view choice: the same drop means "write this take's row"
   *  under the `group` axis and "change this run's model" under the `model`
   *  axis - and the second is not a thing a drag may do. Without this field an
   *  adapter cannot tell them apart and has to assume the writable one, so a
   *  drop made while the board was grouped by status would silently write a
   *  group. An adapter refuses an axis it does not own. */
  axis?: string;
  /** Satisfies a `needs: "note"` offer. */
  note?: string;
  /** Satisfies a `needs: "label"` offer. */
  label?: string;
  /** Satisfies a `needs: "confirm"` offer. False (the default) means the
   *  adapter must NOT spend: it is the stub/dry path. Nothing about this
   *  flag is inferred — an unset `live` never bills. */
  live?: boolean;
}

/** `retryable` separates "the network blinked" from "the authority said no".
 *  A refusal is shown and kept; a retryable failure offers the move again.
 *
 *  `stub` is the dry path: `live` was not set, so nothing was written and
 *  nothing was spent, and `item` is exactly as it was. It is on the SUCCESS
 *  variant on purpose - the move did not fail - which means a caller that
 *  commits on `ok` alone draws a move that never happened. Check it.
 *
 *  THE ITEM MAY COME BACK WITH A DIFFERENT `id`. A move can replace the thing
 *  it moved: rendering an audio prompt produces a take, and the candidate's id
 *  (`audio:prompt:...`) is not the take's (`audio:take:...`). So a caller
 *  reconciles by the RETURNED item's identity and must not assume the id it
 *  sent back is the id it gets. */
export type MoveResult =
  | { ok: true; item: PipelineItem; stub?: true; wouldCall?: string }
  | { ok: false; reason: string; retryable: boolean };

/** A dry move: nothing written, nothing spent, the item untouched. */
export const stubbedMove = (item: PipelineItem, wouldCall: string): MoveResult => ({
  ok: true,
  item,
  stub: true,
  wouldCall,
});

export const isStubbedMove = (r: MoveResult): boolean => r.ok && r.stub === true;

/** WHAT A LOAD DID NOT DRAW. A column that hides items says so; it never just
 *  reads shorter, because "nothing here" and "28 things I could not place" are
 *  different sentences and only one of them is good news.
 *
 *  `degraded` is the per-stage half of the honesty rule. `loadPipeline()` can
 *  only throw or succeed, and a lane is read from several places: the Articles
 *  lane needs the sibling registry for its `proposed` column and the studio
 *  routes for the other three. Throwing on the registry would render the whole
 *  lane as failed and take the gate column - the one with work in it - down
 *  with it. So a read that fails for ONE stage is reported here, that stage
 *  draws its failure, and the rest of the lane still draws its items. */
export interface PipelineLoadNotes {
  hidden: { stage: CanonStage; count: number; why: string }[];
  /** Records whose manifest could not be read at all. */
  damaged: string[];
  /** A stage whose own read failed while the rest of the lane loaded. */
  degraded?: { stage: CanonStage; reason: string }[];
}

/** Per-item version bookkeeping, so a card re-renders on its own change and
 *  never on a sibling's. Both adapters had written this; one copy is enough.
 *  `sig` is any stable digest of the item's drawn state. */
export function makeVersionStamp(): (id: string, sig: string) => number {
  const seen = new Map<string, { sig: string; v: number }>();
  return (id, sig) => {
    const have = seen.get(id);
    if (have && have.sig === sig) return have.v;
    const v = (have?.v ?? 0) + 1;
    seen.set(id, { sig, v });
    return v;
  };
}

/** The optional half of a Board source. A source that implements this can be
 *  drawn on the pipeline canvas; one that does not is unaffected. */
export interface PipelineCapable {
  /** Which canon stages this source actually uses. A source with no `proposed`
   *  stage draws an empty first column rather than shifting the others. */
  stages: CanonStage[];
  bands: Partial<Record<CanonStage, StageBand[]>>;
  /** `[0]` is the adapter's own default grouping. */
  groupAxes: GroupAxis[];
  lanes(items: readonly PipelineItem[], axis: GroupAxis): LaneDef[];
  placementOf(item: BoardItem): PipelinePlacement;
  /** `lane` is the target row when the drop crossed the Y axis, so an adapter
   *  can refuse a row it does not own as well as a stage it cannot reach. */
  admits(item: PipelineItem, to: CanonStage, band: string | null, lane?: string): MoveOffer;
  move(req: MoveRequest): Promise<MoveResult>;
  /** Items with their placement. Kept separate from `loadEntries()` so the
   *  Board's own surface is untouched by this axis. */
  loadPipeline(): Promise<PipelineEntry[]>;
  /** What the last `loadPipeline()` hid, and which stages it could not read.
   *  Optional so a fixture source need not keep books. */
  lastLoad?(): PipelineLoadNotes;
}

export type PipelineSource = BoardSourceExt & PipelineCapable;

export const isPipelineSource = (s: BoardSourceExt): s is PipelineSource =>
  Array.isArray((s as Partial<PipelineCapable>).stages);

/** Lanes derived from the items themselves, in first-seen order, with the
 *  ungrouped row last.
 *
 *  Last, not first, and not sorted: an item whose group was never written is
 *  not a category, it is an absence, and putting absence at the top of a board
 *  gives it the position the eye reads first. Adapters with a declared row
 *  order (Audio has four named rows) override this. */
export function lanesFromItems(items: readonly PipelineItem[], axis: GroupAxis): LaneDef[] {
  const seen = new Map<string, LaneDef>();
  let ungrouped = false;
  for (const item of items) {
    const key = axis.of(item);
    if (key === UNGROUPED_LANE) {
      ungrouped = true;
      continue;
    }
    if (!seen.has(key)) seen.set(key, { key, label: key });
  }
  const lanes = [...seen.values()];
  if (ungrouped) lanes.push({ key: UNGROUPED_LANE, label: "ungrouped" });
  return lanes;
}

/** Above this many cards in the viewport, the board stops choreographing.
 *
 *  It is a VISIBLE change, never a silent optimisation: the surface says the
 *  choreography is off and why. An operator who sees the entrance stagger on a
 *  small board and not on a large one, with nothing explaining it, learns that
 *  the board is unreliable rather than that it is busy. The number is a
 *  starting measurement, not a constant — it moves when the frame budget says
 *  so, and the disclosure moves with it. */
export const CHOREO_MAX_CARDS = 150;

/** A move that crosses no stage boundary is a lane change, not a stage change —
 *  worth its own name because the two have different authorities. A lane change
 *  is usually the interface's own business (a personal arrangement) and commits
 *  immediately; a stage change usually belongs to a backend and is a request. */
export const isLaneOnly = (from: PipelinePlacement, req: MoveRequest): boolean =>
  from.stage === req.to && from.band === req.band;
