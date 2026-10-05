"use client";

// WP0 STUB — WP4 builds this: supers, end-card, aspects, render and downloads.
// Mounted by the cut step's discipline router; replaced, not extended.

import Notice from "../../_shared/ui/Notice";

export default function AdsFinish({ projectId }: { projectId: string }) {
  return (
    <Notice severity="info" title="not built yet">
      <p data-testid="AdsFinish-stub" data-project={projectId}>
        ads · cut
      </p>
    </Notice>
  );
}
