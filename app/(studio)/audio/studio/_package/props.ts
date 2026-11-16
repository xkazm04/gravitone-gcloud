// WHAT A PACKAGING LAYOUT RECEIVES (spark studio-to-release). Two layouts are under test - `split` (the conversation
// narrowed beside the release's step) and `dock` (the step in the main frame, the conversation folded into the dock)
// - and both get the same four things: the address, the release read, the session (the draft and the agent's pending
// proposals) and the conversation itself, already rendered. A layout decides WHERE these go; it never re-implements
// the conversation or the wizard.
import type { ReactNode } from "react";

import type { ReleaseRead } from "../../_release/_port/port.ts";
import type { ReleaseSessionApi } from "../../_release/session.ts";
import type { StudioUrl } from "../url.ts";

export interface PackagingVariantProps {
  readonly url: StudioUrl;
  readonly read: ReleaseRead;
  readonly session: ReleaseSessionApi;
  /** The studio conversation (StudioHost), unchanged - the agent keeps talking while the release is packaged. */
  readonly thread: ReactNode;
  /** A fresh `rel-` id for a release made on this page. */
  readonly newId: () => string;
}
