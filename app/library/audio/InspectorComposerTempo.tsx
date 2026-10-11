"use client";

// THE TEMPO AND KEY ROW — the Composer's "Tempo · key" facet: the BPM field, the
// key field (suggesting the keys seen in the ledger), and the Suno / ElevenLabs
// target switch. Split out of InspectorComposer.tsx to keep each Inspector file
// under the 200-line cap.

import type { Seed, Target } from "./book";

export function ComposerTempo({
  seed,
  keysList,
  target,
  onSeed,
  onTarget,
}: {
  seed: Seed;
  /** The datalist id the key field suggests from. */
  keysList: string;
  target: Target;
  onSeed: (s: Seed) => void;
  onTarget: (t: Target) => void;
}) {
  return (
    <div className="facet">
      <span className="caps">Tempo · key</span>
      <div className="tk">
        <input
          type="number"
          min={40}
          max={220}
          step={1}
          value={seed.bpm ? Math.round(seed.bpm) : ""}
          placeholder="BPM"
          aria-label="Tempo BPM"
          onChange={(e) => onSeed({ ...seed, bpm: Number(e.target.value) || null })}
        />
        <input
          className="key"
          list={keysList}
          value={seed.key ?? ""}
          placeholder="key"
          aria-label="Key"
          onChange={(e) =>
            onSeed({
              ...seed,
              key: e.target.value.trim() ? e.target.value : null,
            })
          }
        />
        <span className="grow" />
        <div className="seg" role="group" aria-label="Target">
          {(
            [
              ["suno", "Suno"],
              ["elevenlabs", "ElevenLabs"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={target === k} onClick={() => onTarget(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
