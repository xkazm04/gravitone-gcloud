// One of a few (tokens.css `.seg`: 12h · 24h · 3d · week). A group of native pressed
// buttons, exactly one pressed, named as a group. The prototype's own markup; the ARIA
// radio pattern would need arrow keys that bypass the keymap registry.
//
// An option may carry a glyph and a count (ledger.js `#lg-seg`: "◉ Operator 12"), and an
// actor accent that colours its glyph and its pressed rule in that actor's token - the
// Ledger's actor filter is the first Seg whose options are WHO, and who is a colour
// everywhere else in the design (time strip, rows, detail). The count is the number the
// option would show if pressed, so it is part of the option's accessible name.
import type { ActorKind } from "@gt/domain/event";
import { cx } from "../cx.ts";
import { Glyph, type GlyphName } from "../glyph/Glyph.tsx";
import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./Seg.module.css";

export type SegOption<V extends string> = {
  readonly value: V;
  readonly label: string;
  readonly glyph?: GlyphName;
  readonly count?: number;
  readonly accent?: ActorKind;
};

export type SegProps<V extends string> = {
  readonly label: string;
  readonly options: readonly SegOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
};

export function Seg<V extends string>({ label, options, value, onChange }: SegProps<V>) {
  return (
    <div className={s.seg} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(s.opt, o.accent !== undefined && s[o.accent])}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.glyph !== undefined && <Glyph name={o.glyph} className={s.glyph} />}
          {o.label}
          {o.count !== undefined && (
            <>
              <b className={s.count} aria-hidden="true">
                {o.count}
              </b>
              <SrOnly text={`, ${o.count}`} />
            </>
          )}
        </button>
      ))}
    </div>
  );
}
