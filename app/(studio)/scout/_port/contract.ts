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

/** What the screen draws: the graph, and the split the steer holds now (absent: none set). */
export type ScoutView = { readonly graph: ScoutGraph; readonly split?: SplitInput };

export type ScoutPort = {
  readonly pause: (input: { readonly ref: string }) => Promise<ActionResult<ScoutView>>;
  readonly resume: (input: { readonly ref: string }) => Promise<ActionResult<ScoutView>>;
  readonly split: (input: SplitInput) => Promise<ActionResult<ScoutView>>;
};
