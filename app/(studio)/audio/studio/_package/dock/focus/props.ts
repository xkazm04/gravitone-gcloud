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
  /** The room's light (@gt/ui RoomLight): what the step leads with, and the sleeve that glows behind it. The
   *  layout that owns the room draws it; the stage only says what it is. */
  readonly onLight?: (light: StageLight) => void;
}

export type StageLight = { readonly kind: "block" | "warn" | "agent" | "ready" | "clear"; readonly sleeve: string | null };
