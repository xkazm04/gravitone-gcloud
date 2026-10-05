"use client";

// WP0 STUB — WP2 builds this: round 2 (scenarios executing the picked idea) on the card deck.
// Mounted by the script step's discipline router; replaced, not extended.

import Notice from "../../_shared/ui/Notice";

export default function AdsScenario({ projectId }: { projectId: string }) {
  return (
    <Notice severity="info" title="not built yet">
      <p data-testid="AdsScenario-stub" data-project={projectId}>
        ads · script
      </p>
    </Notice>
  );
}
