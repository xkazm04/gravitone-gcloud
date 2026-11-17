// WHAT THE FOCUS STAGE RECEIVES (prototype dock-package, the owner's pick 2026-11-17): the release being packaged,
// from the same session every other surface reads. The dock's layout core (stage rail above, the conversation folded
// into the dock below) is the dock's own; Focus draws what fills the step frame.
import type { ReleaseRead } from "../../../../_release/_port/port.ts";
import type { ReleaseSessionApi } from "../../../../_release/session.ts";
import type { StepId } from "../../../../_release/wizard/steps.ts";

export interface StageProps {
  readonly read: ReleaseRead;
  readonly session: ReleaseSessionApi;
  readonly newId: () => string;
  /** The release stage opens the walk at its review. */
  readonly startStep?: StepId;
}
