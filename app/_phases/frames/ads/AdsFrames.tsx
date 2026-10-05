"use client";

// WP0 STUB — WP3 builds this: per shot, three key-image takes, then one costed clip on demand.
// Mounted by the frames step's discipline router; replaced, not extended.

import Notice from "../../_shared/ui/Notice";

export default function AdsFrames({ projectId }: { projectId: string }) {
  return (
    <Notice severity="info" title="not built yet">
      <p data-testid="AdsFrames-stub" data-project={projectId}>
        ads · frames
      </p>
    </Notice>
  );
}
