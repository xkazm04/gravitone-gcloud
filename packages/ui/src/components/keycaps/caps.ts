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

export type TableOptions = { readonly facts?: ReadonlySet<string>; readonly field?: string };

/** The legend for a mode: keymap.ts `keyTable`, over the app's keymap unless a test supplies one. */
export function legendFor(mode: string, opts: TableOptions = {}, map: Keymap = KEYMAP): readonly KeyRow[] {
  return keyTable(map, mode, {
    ...(opts.facts !== undefined ? { facts: opts.facts } : {}),
    ...(opts.field !== undefined ? { field: opts.field } : {}),
  });
}
