// THE RELEASE SESSION'S FACE (spark studio-to-release): the one object the wizard, the catalog and both studio
// packaging layouts read a release through. It hides whether a change was only reduced on the page (the fixture)
// or also written to the store (the real side, ./Session.tsx with ./acts.ts) - every consumer dispatches the same
// events and reads the same state.
import type { Dispatch } from "react";

import type { ReleaseProposal, ReleaseRecord } from "@gt/domain/release.record";

import type { DraftEvent, DraftState } from "./draft.ts";

export interface ReleaseSessionApi {
  /** The releases as the page shows them (the stored records, with this page's edits applied on top) and the open one. */
  readonly state: DraftState;
  readonly dispatch: Dispatch<DraftEvent>;
  readonly records: readonly ReleaseRecord[];
  /** The open release's record, or null. */
  readonly open: ReleaseRecord | null;
  /** The open release's pending proposals (the agent's suggestions), oldest first. */
  readonly pending: readonly ReleaseProposal[];
  readonly accept: (proposalIds: readonly string[]) => void;
  readonly dismiss: (proposalIds: readonly string[]) => void;
  /** A write is on its way to the store. */
  readonly saving: boolean;
  /** The last refusal or conflict in the store's own words, or null. */
  readonly notice: string | null;
}
