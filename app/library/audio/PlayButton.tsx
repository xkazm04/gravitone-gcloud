"use client";

// A ROW'S PLAY MARK. Subscribes to the engine for ONE fact — is this take the
// one playing — so a 40 ms transport tick re-renders the one button whose
// answer changed, not the ledger.

import { useSyncExternalStore } from "react";

import type { Take } from "./book";
import type { Engine } from "./engine";

const PLAY = "M8 5.5v13l11-6.5z";
const PAUSE = "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";

export default function PlayButton({
  engine,
  take,
  disabled,
  onPlay,
}: {
  engine: Engine;
  take: Take;
  disabled: boolean;
  onPlay: () => void;
}) {
  const playing = useSyncExternalStore(
    engine.subscribe,
    () => engine.current?.id === take.id && engine.current.playing,
    () => false,
  );
  return (
    <button
      type="button"
      className={`playbtn${playing ? " is-playing" : ""}`}
      tabIndex={-1}
      aria-label={`${playing ? "Pause" : "Play"} ${take.title}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onPlay();
      }}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path d={playing ? PAUSE : PLAY} fill="currentColor" />
      </svg>
    </button>
  );
}
