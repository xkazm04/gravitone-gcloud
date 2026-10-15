// Caps come from the keymap registry, never from a hand-typed string. The prototype drew
// `<kbd>A</kbd>` beside each button and a separate GT.Keycaps([...]) table per desk, so a
// rebinding meant finding every literal; here both read the one table (keymap/bindings.ts).
import { KEYMAP } from "../../keymap/bindings.ts";
import { keyTable, type Keymap, type KeyRow } from "../../keymap/keymap.ts";

/** The drawn caps of the row that runs `verb` in exactly `mode`; [] when no row does. */
export function capsFor(mode: string, verb: string, map: Keymap = KEYMAP): readonly string[] {
  const row = map.rows.find((r) => r.binding.mode === mode && r.binding.verb === verb);
  return row === undefined ? [] : row.binding.keys;
}

export type TableOptions = {
  readonly facts?: ReadonlySet<string>;
  readonly field?: string;
  /** A row's keys narrowed to those that act here, by the row's `does`: the cull binds 1-9 0 -
   *  for every source, and a forge packet's four reasons answer only on 1-4, so its legend
   *  draws 1-4 (a row left with no key is not drawn). */
  readonly only?: Readonly<Record<string, readonly string[]>>;
};

/** The legend for a mode: keymap.ts `keyTable`, over the app's keymap unless a test supplies one. */
export function legendFor(mode: string, opts: TableOptions = {}, map: Keymap = KEYMAP): readonly KeyRow[] {
  const rows = keyTable(map, mode, {
    ...(opts.facts !== undefined ? { facts: opts.facts } : {}),
    ...(opts.field !== undefined ? { field: opts.field } : {}),
  });
  const only = opts.only;
  if (only === undefined) return rows;
  return rows.flatMap((r) => {
    const keep = only[r.does];
    if (keep === undefined) return [r];
    const keys = r.keys.filter((k) => keep.includes(k));
    return keys.length === 0 ? [] : [{ keys, does: r.does }];
  });
}
