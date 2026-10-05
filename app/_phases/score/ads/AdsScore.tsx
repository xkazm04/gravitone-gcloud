"use client";

// WP0 STUB — WP4 builds this: one music bed spanning the cut, via the cue-takes flow.
// Mounted by the score step's discipline router; replaced, not extended.

import Notice from "../../_shared/ui/Notice";

export default function AdsScore({ projectId }: { projectId: string }) {
  return (
    <Notice severity="info" title="not built yet">
      <p data-testid="AdsScore-stub" data-project={projectId}>
        ads · score
      </p>
    </Notice>
  );
}
