// What the reel review needs from the server: the one act it performs. The server page hands WP4's Server Action
// (../_actions/decide.ts `decideAction`) down as this prop, so the client island never imports an action by value.
import type { ReelPin } from "@/lib/reel/store";

import type { ActionResult } from "../../../_server/actionCore.ts";

export type ReviewDecideInput = {
  readonly slug: string;
  readonly key: "film" | "release";
  readonly verdict: "keep" | "reject" | "drop";
  readonly reasons: readonly string[];
  readonly note?: string;
  readonly pins?: readonly ReelPin[];
  /** The subject sha judged (ReelDetail.subjectSha[key]). */
  readonly of: string;
};

export type ReviewActions = {
  readonly decide: (input: ReviewDecideInput) => Promise<ActionResult<{ readonly recorded: string; readonly slots?: readonly string[] }>>;
};
