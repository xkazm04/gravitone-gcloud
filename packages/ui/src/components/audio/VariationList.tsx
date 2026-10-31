// THE VARIATIONS (v1 app/library/audio/InspectorVariations.tsx): the seed's one-change fan-outs,
// one axis each (./variations.ts), with the change spelled as a diff and why the evidence picked
// it. Load puts it in the composer; Send opens its receipt. v1's "Render all N" (ElevenLabs,
// billed on the press) is not carried: a batch is N receipts' worth of spend and the receipt is
// per proposal; sending each is one press each, read before it spends. With an ear (2026-10-28),
// a variation whose seed this machine can play carries a play mark: its sketch - the instruments
// together at its own tempo and key - so a move is heard against the seed before it is loaded.
import { Button } from "../button/Button.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { cx } from "../cx.ts";
import { EarButton } from "./EarButton.tsx";
import type { EarState } from "./useEar.ts";
import type { Variation } from "./variations.ts";
import s from "./Composer.module.css";

const diffTone = (d: string): string | undefined => (d.startsWith("−") ? s.minus : d.startsWith("+") && !d.endsWith("BPM") ? s.plus : undefined);

export type VariationListProps = {
  readonly list: readonly Variation[];
  readonly onLoad: (v: Variation) => void;
  readonly onSend: (v: Variation) => void;
  readonly busy: boolean;
  /** The variation's sketch: whether it can sound here, how far it got, and the press. */
  readonly hear?: { readonly stateOf: (v: Variation) => EarState | null; readonly onPlay: (v: Variation) => void };
};

export function VariationList({ list, onLoad, onSend, busy, hear }: VariationListProps) {
  if (list.length === 0) return null;
  return (
    <section className={s.block} aria-label="variations">
      <CapsHeading text="variations" variant="section" tally={{ value: list.length }} />
      <ul className={s.vars}>
        {list.map((v, i) => (
          <li key={`${v.axis}-${i}`} className={s.var}>
            <span className={s.axis}>{v.axis}</span>
            <span className={s.why}>{v.why}</span>
            <span className={s.diffs}>
              {v.diff.map((d) => (
                <span key={d} className={cx(s.diff, diffTone(d))}>
                  {d}
                </span>
              ))}
            </span>
            <span className={s.varActs} role="group" aria-label={`${v.axis} ${v.diff.join(" ")}`}>
              {hear !== undefined && hear.stateOf(v) !== null && <EarButton state={hear.stateOf(v) ?? "idle"} name={`${v.axis} ${v.diff.join(" ")}`} onPress={() => hear.onPlay(v)} />}
              <Button label="Load" size="sm" onPress={() => onLoad(v)} />
              <Button label="Send" size="sm" tone="cyan" disabled={busy} onPress={() => onSend(v)} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
