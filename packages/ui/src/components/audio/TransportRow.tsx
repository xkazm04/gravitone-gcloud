"use client";

// THE STUDIO'S TRANSPORT ROW (spark audio-agent-studio): what is sounding, in words, its play mark,
// the second it is at against its length, a seek fader and stop. It draws a MixTransport's state
// (./useMix.ts) and proposes presses; it holds no audio of its own. Nothing sounding is drawn as
// nothing sounding ("nothing playing"), and a failed play says why on the row.
import { Button } from "../button/Button.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Fader } from "../fader/Fader.tsx";
import { EarButton } from "./EarButton.tsx";
import { clockOf } from "./mix.ts";
import type { EarState } from "./useEar.ts";
import s from "./Transport.module.css";

export type TransportRowProps = {
  /** What the play mark plays, in words ("the bed", "smooth bass alone"). */
  readonly name: string;
  readonly state: EarState;
  readonly clock: number;
  readonly duration: number | null;
  readonly failed?: string | null;
  readonly onToggle: () => void;
  readonly onSeek: (s: number) => void;
  readonly onStop: () => void;
};

export function TransportRow({ name, state, clock, duration, failed = null, onToggle, onSeek, onStop }: TransportRowProps) {
  const len = duration ?? 0;
  return (
    <div className={s.row} data-state={state}>
      <EarButton state={state} name={name} onPress={onToggle} big />
      <span className={s.name}>{state === "idle" ? "nothing playing" : name}</span>
      <span className={s.time} aria-label={`at ${clockOf(clock)} of ${clockOf(len)}`}>
        {`${clockOf(clock)} / ${clockOf(len)}`}
      </span>
      <Fader label={`position in ${name}`} value={Math.min(clock, len)} min={0} max={Math.max(len, 1)} step={1} onChange={onSeek} valueText={`${clockOf(clock)} of ${clockOf(len)}`} disabled={state !== "playing"} />
      <Button label="Stop" size="sm" disabled={state === "idle"} onPress={onStop} />
      {failed !== null && (
        <span className={s.err}>
          <ErrorLine message={failed} live />
        </span>
      )}
    </div>
  );
}
