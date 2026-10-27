// Keys are a table, not prose (tokens.css `.keymap`, GT.Keycaps(map); v1 signal/Keycaps.tsx).
//
// The design draws the legend in the open at the foot of a desk, so this does too - v1 hid
// it behind a glyph, which the prototype's pages overruled. What v1 got right is kept and
// tightened: the rows are DERIVED from the keymap (keyTable for one mode), so the legend
// cannot disagree with what the keys do. There is no `map` prop to hand-write rows into.
//
// A cap may carry a TIP (2026-10-23): a reason key's word and meaning, on hover and focus - the
// legend draws `1 2 3 … reason`, and `3` alone does not say it is craft. Such a cap takes focus,
// so the keyboard reaches its tip, and the tip opens above: the legend sits at a desk's foot.
import type { Keymap } from "../../keymap/keymap.ts";
import { cx } from "../cx.ts";
import { Tip } from "../hint/Tip.tsx";
import { capsFor, legendFor, type TableOptions } from "./caps.ts";
import s from "./Keycaps.module.css";

/** One verb's caps, for a control that runs it (`Approve → slot [A]`). Nothing when unbound. */
export type KeycapProps = {
  readonly mode: string;
  readonly verb: string;
  /** `sm` sits inside a small control (a tab); `md` beside a button's label. */
  readonly size?: "md" | "sm";
  readonly map?: Keymap;
};

export function Keycap({ mode, verb, size = "md", map }: KeycapProps) {
  const caps = map === undefined ? capsFor(mode, verb) : capsFor(mode, verb, map);
  return (
    <>
      {caps.map((c) => (
        <kbd key={c} className={cx(s.cap, size === "sm" && s.sm)}>
          {c}
        </kbd>
      ))}
    </>
  );
}

/** What one cap stands for where it is drawn, and what that means: `3` -> craft, its sentence. */
export type CapTip = { readonly term: string; readonly text: string };

export type KeycapsProps = TableOptions & {
  readonly mode: string;
  /** The legend's accessible name. */
  readonly label: string;
  readonly map?: Keymap;
  /** By a row's `does`, then by cap: the tip that cap opens (a reason key's reason and meaning). */
  readonly tips?: Readonly<Record<string, Readonly<Record<string, CapTip>>>>;
};

export function Keycaps({ mode, label, map, tips, ...opts }: KeycapsProps) {
  const rows = map === undefined ? legendFor(mode, opts) : legendFor(mode, opts, map);
  return (
    <div className={s.map} role="group" aria-label={label}>
      {rows.map((r) => (
        <span key={`${r.keys.join(" ")}:${r.does}`} className={s.row}>
          {r.keys.map((k) => {
            const tip = tips?.[r.does]?.[k];
            return tip === undefined ? (
              <kbd key={k} className={s.cap}>
                {k}
              </kbd>
            ) : (
              <Tip key={k} text={tip.text} term={tip.term} above>
                {(id) => (
                  <kbd className={s.cap} role="term" tabIndex={0} aria-describedby={id}>
                    {k}
                  </kbd>
                )}
              </Tip>
            );
          })}{" "}
          {r.does}
        </span>
      ))}
    </div>
  );
}
