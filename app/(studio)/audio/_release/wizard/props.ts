// What the wizard receives (spark audio-distribution): the read and the draft. It renders from `state`,
// dispatches into `dispatch`, and never holds a field of the release in local state - only its own
// position (the step, the focused track, the visited set). Registry wizard-flows: one model owns
// every step.
import type { ReleaseRead } from "../_port/port.ts";
import type { ReleaseSessionApi } from "../session.ts";
import type { StepId } from "./steps.ts";

export interface WizardProps {
  readonly read: ReleaseRead;
  /** The draft and the agent's pending proposals (../Session.tsx); the wizard never holds a field itself. */
  readonly session: ReleaseSessionApi;
  /** A fresh `rel-` id for a release made on this page. */
  readonly newId: () => string;
  /** Where an opened release starts its walk; absent: its first blocked step (or the review). */
  readonly startStep?: StepId;
}
