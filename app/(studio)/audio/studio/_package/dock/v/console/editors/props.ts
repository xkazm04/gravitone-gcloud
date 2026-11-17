// What every editor in the console's dialog receives (prototype dock-package, "console"): the open release, the read,
// every live problem, the session (the one model: dispatch, pending, accept / dismiss), the editor's track position and
// the door to another step. An editor never holds a field of the release; only the track it is looking at is local.
import type { Dispatch } from "react";

import type { Release } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../../../../../_release/_port/port.ts";
import type { DraftEvent } from "../../../../../../_release/draft.ts";
import type { ReleaseSessionApi } from "../../../../../../_release/session.ts";
import type { StepId } from "../../../../../../_release/wizard/steps.ts";

export interface EditorProps {
  readonly release: Release;
  readonly read: ReleaseRead;
  readonly problems: readonly ReleaseProblem[];
  readonly session: ReleaseSessionApi;
  readonly dispatch: Dispatch<DraftEvent>;
  readonly track: number;
  readonly setTrack: (index: number) => void;
  readonly go: (step: StepId, track?: number) => void;
  readonly reduce: boolean;
}
