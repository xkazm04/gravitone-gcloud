"use client";

// Entry point of the Sound lab's arrange module (round 4, platform-consolidation).
// The shell (app/playground/PlaygroundView.tsx) mounts it under its tab; the
// module owns everything below that line. Stub until its work package lands.

import type { SoundKind } from "@/lib/sound/types";

export default function ArrangeModule({ kind }: { kind: SoundKind }) {
  return <div data-module="arrange" data-kind={kind} />;
}
