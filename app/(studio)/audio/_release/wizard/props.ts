// What the wizard receives (spark audio-distribution): the read and the draft. It renders from `state`,
// dispatches into `dispatch`, and never holds a field of the release in local state - only its own
// position (the step, the focused track, the visited set). Registry wizard-flows: one model owns
// every step.
import type { Dispatch } from "react";

import type { ReleaseRead } from "../_port/port.ts";
import type { DraftEvent, DraftState } from "../draft.ts";

export interface WizardProps {
  readonly read: ReleaseRead;
  readonly state: DraftState;
  readonly dispatch: Dispatch<DraftEvent>;
  /** A fresh `rel-` id for a release made on this page. */
  readonly newId: () => string;
}
