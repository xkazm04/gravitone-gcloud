// An on/off filter that applies at once (tokens.css `.toggle`): a native button with
// aria-pressed, so the state is announced without any consumer effort. Controlled: the
// caller owns `on` (ui-controls/composition-contracts).
//
// The design draws three more things inside a toggle, each now a prop instead of markup a
// page splices in (style contract README, "the kit cannot draw these yet"): a leading glyph
// (Ledger "facets", "newest"), a count of what is on behind it (Ledger "facets 2"), and the
// caps of the verb that also flips it (Library "detail ]"). `name` is the accessible name
// when the drawn label alone would read badly ("newest" says nothing about order).
//
// A toggle that shows and hides a region (`controls`) is a disclosure: it says expanded, and
// only that. Pressed and expanded on one button are two states for one fact, and a screen
// reader voices both ("toggle button, pressed, expanded").
import { Glyph, type GlyphName } from "../glyph/Glyph.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./Toggle.module.css";

export type ToggleProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly glyph?: GlyphName;
  /** How many things are on behind this toggle; nothing drawn at 0. */
  readonly count?: number;
  readonly shortcut?: { readonly mode: string; readonly verb: string };
  readonly name?: string;
  /** The id of the region this toggle shows and hides (aria-controls + aria-expanded). */
  readonly controls?: string;
};

export function Toggle({ label, on, onToggle, glyph, count, shortcut, name, controls }: ToggleProps) {
  return (
    <button
      type="button"
      className={s.toggle}
      aria-pressed={controls === undefined ? on : undefined}
      aria-label={name}
      aria-controls={controls}
      aria-expanded={controls === undefined ? undefined : on}
      onClick={() => onToggle(!on)}
    >
      {glyph !== undefined && <Glyph name={glyph} className={s.glyph} />}
      {label}
      {count !== undefined && count > 0 && (
        <>
          <b className={s.count} aria-hidden="true">
            {count}
          </b>
          {name === undefined && <SrOnly text={`, ${count} on`} />}
        </>
      )}
      {shortcut !== undefined && <Keycap mode={shortcut.mode} verb={shortcut.verb} size="sm" />}
    </button>
  );
}
