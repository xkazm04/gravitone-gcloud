// What every layout variant receives (spark audio-distribution, S1). The variants are three answers
// to one question - how a release is assembled - over the same read and the same draft, so the owner
// can pick or fuse them. A variant renders from `state`, dispatches into `dispatch`, and never holds
// a field of the release in local state (wizard-flows: one model owns every step).
import type { Dispatch } from "react";

import type { ReleaseRead } from "../_port/port.ts";
import type { DraftEvent, DraftState } from "../draft.ts";

export interface VariantProps {
  readonly read: ReleaseRead;
  readonly state: DraftState;
  readonly dispatch: Dispatch<DraftEvent>;
  /** A fresh `rel-` id for a release made on this page. */
  readonly newId: () => string;
}
