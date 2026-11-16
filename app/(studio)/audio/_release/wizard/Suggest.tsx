"use client";

// THE AGENT'S SUGGESTION ON ONE FIELD (spark studio-to-release): every pending proposal for `path`, its value, where
// it came from, and accept / dismiss. Nothing is written until the operator accepts (owner, wave 2: pending per
// field). STUB (WP0): renders nothing; WP4 builds it, and every step places one beside each field a proposal may set.
import type { ProposalPath } from "@gt/domain/release.record";

import type { ReleaseSessionApi } from "../session.ts";

export interface SuggestProps {
  readonly path: ProposalPath;
  readonly session: ReleaseSessionApi;
}

export function Suggest(_props: SuggestProps) {
  return null;
}
