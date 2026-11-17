// What an item's editor receives inside the dialog (prototype dock-package, round 2, variant "checklist"): the open
// release, the read, the session it dispatches through, and - for a per-track item - the track the dialog shows.
import type { Release } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../../../../../_release/_port/port.ts";
import type { ReleaseFields, TrackFields } from "../../../../../../_release/draft.ts";
import type { ReleaseSessionApi } from "../../../../../../_release/session.ts";
import type { StepId } from "../../../../../../_release/wizard/steps.ts";
import type { Item } from "../model.ts";

export interface EditorProps {
  readonly item: Item;
  readonly r: Release;
  readonly read: ReleaseRead;
  readonly problems: readonly ReleaseProblem[];
  readonly session: ReleaseSessionApi;
  /** The track the dialog is on (0-based). */
  readonly track: number;
  readonly go: (step: StepId, track?: number) => void;
  readonly close: () => void;
}

export const setRelease = (p: EditorProps) => (fields: ReleaseFields) => p.session.dispatch({ type: "patch", id: p.r.id, fields });
export const setTrack = (p: EditorProps, index = p.track) => (fields: TrackFields) => p.session.dispatch({ type: "patchTrack", id: p.r.id, index, fields });
