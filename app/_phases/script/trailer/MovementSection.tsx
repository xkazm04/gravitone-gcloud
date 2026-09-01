"use client";

// One named part of the spine — a Movement, and the beats that sit on it.
//
// PATTERNS.md § 9.1: parts as first-class objects, named, not a flat beat list.
// The header carries what the movement IS (role, ordinal, the cue section it
// sits on); the beats under it are editable; and between two adjacent beats
// the connector is a control rather than a label. The connector under the
// first beat of a part links it to the LAST beat of the part before — a chain
// does not restart at a part boundary, and neither does the checker.

import BeatEditor from "./BeatEditor";
import ConnectorPick from "./ConnectorPick";
import type { BeatPatch } from "./cut";
import { singleRaise } from "./cut";
import type { Cue, Movement, RaisedVariable, TrailerBeat } from "./types";

export default function MovementSection({
  movement,
  beats,
  previousBeat,
  previousRung,
  cue,
  onPatch,
}: {
  movement: Movement;
  /** This movement's beats, in chain order. */
  beats: TrailerBeat[];
  /** The last beat of the movement before, or null for the first part. */
  previousBeat: TrailerBeat | null;
  /** The last rung before this movement, for the repeat warning. */
  previousRung: TrailerBeat | null;
  cue?: Cue;
  onPatch: (beatId: string, patch: BeatPatch) => void;
}) {
  const section = cue?.sections.find((s) => s.id === movement.cueSection);
  const isEscalation = movement.role === "escalation";

  // The previous rung walks forward through this movement's own rungs —
  // computed up front as a list, so the render maps over data rather than
  // reassigning a variable while it draws.
  const rows = beats.reduce<{ beat: TrailerBeat; isRung: boolean; previousRaise: RaisedVariable | null }[]>(
    (acc, b) => {
      const isRung = isEscalation && b.kind === "rung";
      const lastRung = [...acc].reverse().find((r) => r.isRung)?.beat ?? previousRung;
      acc.push({ beat: b, isRung, previousRaise: isRung ? singleRaise(lastRung ?? undefined) : null });
      return acc;
    },
    [],
  );

  return (
    <section
      data-testid={`movement-${movement.id}`}
      className="rounded-2xl border border-white/8 bg-white/[0.02] p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-instrument text-[18px] text-white/90">{movement.label}</h3>
        <p className="font-jetbrains text-label tracking-[0.14em] text-white/35 uppercase">
          {movement.role} · part {movement.ordinal}
          {section ? (
            <span className="ml-2 normal-case tracking-normal text-white/45">on cue · {section.label}</span>
          ) : (
            <span className="ml-2 normal-case tracking-normal text-amber-200/80">no cue section</span>
          )}
        </p>
      </header>

      {beats.length === 0 ? (
        <p className="font-jetbrains mt-3 text-label text-amber-200/80">
          no beat picked for this part — the movement is declared and empty
        </p>
      ) : (
        <ol className="mt-3">
          {rows.map(({ beat: b, isRung, previousRaise }, i) => {
            const prev = i === 0 ? previousBeat : beats[i - 1];
            return (
              <li key={b.id}>
                {prev && (
                  <ConnectorPick
                    beatId={b.id}
                    value={b.connector}
                    onChange={(connector) => onPatch(b.id, { connector })}
                  />
                )}
                <BeatEditor
                  beat={b}
                  isRung={isRung}
                  previousRaise={previousRaise}
                  onPatch={(patch) => onPatch(b.id, patch)}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
