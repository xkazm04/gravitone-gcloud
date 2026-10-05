"use client";

// Entry point of the Sound lab's triage module (round 4, platform-consolidation).
// The shell (app/playground/PlaygroundView.tsx) mounts it under its tab; the
// module owns everything below that line. Stub until its work package lands.

import type { SoundKind } from "@/lib/sound/types";

export default function TriageModule({ kind }: { kind: SoundKind }) {
  return <div data-module="triage" data-kind={kind} />;
}
