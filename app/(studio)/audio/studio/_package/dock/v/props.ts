// WHAT A DESIGN VARIANT OF THE PACKAGE STAGE RECEIVES (prototype dock-package, 2026-11-17). The dock's layout core
// stays the dock's own (the stage rail above, the conversation folded into the dock below, the handle between); a
// variant draws only what fills the step frame - the release being packaged, its steps, the agent's suggestions - from
// the same session every other surface reads. THROWAWAY with the switcher: Phase 5 keeps one variant and deletes this.
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
