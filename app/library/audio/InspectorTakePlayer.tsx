"use client";

// THE TAKE'S PLAYER — the Take block's transport, wired to the shared engine.
// It subscribes for the one take it shows: the engine's snapshot counts only
// while its id is this take's. Split out of InspectorTake.tsx to keep each
// Inspector file under the 200-line cap.

import { useSyncExternalStore } from "react";

import { Player } from "@/components/kit";

import { peaksOf, type Take } from "./book";
import type { Engine } from "./engine";

/* ── the take ──────────────────────────────────────────────────────────── */

export function TakePlayer({
  engine,
  take,
  url,
  playable,
}: {
  engine: Engine;
  take: Take;
  url: string | null;
  playable: boolean;
}) {
  const st = useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => null);
  const mine = st && st.id === take.id ? st : null;
  const duration = mine?.duration || take.duration_s || 0;
  return (
    <Player
      label={take.title}
      peaks={peaksOf(take, 96)}
      playing={mine?.playing ?? false}
      position={mine?.position ?? 0}
      duration={duration}
      disabled={!playable}
      onToggle={() => engine.toggle(take, url)}
      onSeek={(t) => engine.seek(take, t, url)}
    />
  );
}
