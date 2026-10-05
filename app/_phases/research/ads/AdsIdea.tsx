"use client";

// WP0 STUB — WP2 builds this: the brief card, then round 1 (ideas) on the card deck.
// Mounted by the research step's discipline router; replaced, not extended.

import Notice from "../../_shared/ui/Notice";

export default function AdsIdea({ projectId }: { projectId: string }) {
  return (
    <Notice severity="info" title="not built yet">
      <p data-testid="AdsIdea-stub" data-project={projectId}>
        ads · research
      </p>
    </Notice>
  );
}
