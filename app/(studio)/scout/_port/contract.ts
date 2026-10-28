// THE SCOUT PORT AS THE SCREEN HOLDS IT - client-safe (types only): the Server Actions /scout calls. Each writes the
// operator's steer (lib/foundry/scout/steer.ts) and answers with the view rebuilt after the write, in the action
// core's envelope (app/_server/actionCore.ts): `{ok, value}` or `{ok, error}` with the door's sentence verbatim.

import type { ScoutGraph } from "@gt/domain/scoutGraph";

import type { ActionResult } from "../../../_server/actionCore.ts";

/** The steer's split as the editor sends it: whole percents per audience, and per genre inside an audience. */
export type SplitInput = {
  readonly audience: Readonly<Record<string, number>>;
  readonly genre?: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

/**
 * What the screen draws: ONE graph (spark scout-vision S3 - the muse wing merged into the loop; its four nights are
 * archive nodes in the same graph, GraphNode.archive), and the split the steer holds now (absent: none set).
 */
export type ScoutView = {
  readonly graph: ScoutGraph;
  readonly split?: SplitInput;
  readonly backlog?: ScoutBacklog;
  /** The live ventures (spark scout-vision S2) the nodes may carry (GraphNode.venture), oldest birth
   *  first; omitted when there is none, and then no venture filter is drawn. */
  readonly ventures?: readonly ScoutVenture[];
};

/** A venture as the filter names it. */
export type ScoutVenture = { readonly id: string; readonly name: string };

/**
 * The scout wing's backlog (spark scout-vision; lib/foundry/scout/backlog.ts backlogOf) as numbers: kept ideas
 * waiting for a storyboard, kept seeds no idea grows from yet, and the seed gate that follows (`freshAllowed`: the
 * fresh seeds a gated batch may take, null when ungated). Absent from the view when it is not known.
 */
export type ScoutBacklog = { readonly waiting: number; readonly seedsWaiting: number; readonly gated: boolean; readonly freshAllowed: number | null };

export type ScoutPort = {
  readonly pause: (input: { readonly ref: string }) => Promise<ActionResult<ScoutView>>;
  readonly resume: (input: { readonly ref: string }) => Promise<ActionResult<ScoutView>>;
  readonly split: (input: SplitInput) => Promise<ActionResult<ScoutView>>;
};
