// THE RELEASE ACTS' WIRE (spark studio-to-release): what the page sends to ./acts.ts and what comes back, zod-free
// so client components can import it. Every write names the version it was made against; the store applies it only
// when that is still the stored version (compare-and-swap) - otherwise nothing is written and the answer carries the
// record as stored, `stale: true`, so the page re-bases on it instead of overwriting what the agent (or another tab)
// wrote in between.
import type { ReleaseRecord } from "@gt/domain/release.record";

import type { ActionResult } from "../../../_server/actionCore.ts";
import type { ReleaseEdit } from "./draft.ts";

export type ReleaseAct =
  /** One wizard edit (draft.ts `applyEdit`, run by the server on the stored release). */
  | { readonly kind: "edit"; readonly edit: ReleaseEdit }
  /** Accept pending proposals: each value is applied through the release door, then the proposal leaves `pending`. */
  | { readonly kind: "accept"; readonly proposalIds: readonly string[] }
  /** Dismiss pending proposals: they leave `pending`, the release is untouched. */
  | { readonly kind: "dismiss"; readonly proposalIds: readonly string[] };

export interface ReleaseOutcome {
  /** The record as stored after the act - or, when `stale`, as stored before it (nothing was written). */
  readonly record: ReleaseRecord;
  readonly stale: boolean;
}

export type ReleaseAnswer = ActionResult<ReleaseOutcome>;

/** The three doors, as the page receives them (Server Actions on the real side, local stand-ins on the fixture). */
export interface ReleaseActs {
  /** "Release this" on a studio track: the take is kept and finalized with the release title as its label, and a
   *  release is created from it, in one act (owner, wave 2). */
  readonly releaseThis: (input: { readonly takeId: string; readonly sessionId: string | null }) => Promise<ReleaseAnswer>;
  /** A release from picked shelf takes (the catalog's "new"). */
  readonly create: (input: { readonly takeIds: readonly string[] }) => Promise<ReleaseAnswer>;
  readonly apply: (input: { readonly id: string; readonly version: number; readonly act: ReleaseAct }) => Promise<ReleaseAnswer>;
}
