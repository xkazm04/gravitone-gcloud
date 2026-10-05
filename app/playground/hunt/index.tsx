"use client";

// Entry point of the Sound lab's hunt module (round 4, platform-consolidation).
// The shell (app/playground/PlaygroundView.tsx) mounts it under its tab; the
// module owns everything below that line. Stub until its work package lands.

import type { SoundKind } from "@/lib/sound/types";

export default function HuntModule({ kind }: { kind: SoundKind }) {
  return <div data-module="hunt" data-kind={kind} />;
}
