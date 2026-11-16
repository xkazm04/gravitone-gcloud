// THE KEY SHEET'S TABLE - what ⌘/ draws, read off the same rows the dispatcher resolves.
//
// keyboard-shortcuts declared-keymap-authority: the reference is a render of the declarations,
// never a document someone remembers to update. A press in `board.cull` can reach the cull's
// rows, then the board's, then the global layer's (route.ts), so the sheet draws exactly those
// modes, innermost first, each through `keyTable` with the screen's facts - the rows a press
// could fire right now, no more. Field rows are a field's own legend (Keycaps `field`) and are
// not drawn here: the sheet is opened from outside any field.

import { GLOBAL, keyTable, modePath, type Keymap, type KeyRow } from "./keymap.ts";

export type HelpSection = { readonly mode: string; readonly rows: readonly KeyRow[] };

/** The modes a press can reach from `mode` (null: no screen bound keys), innermost first, the global layer last. */
export function helpModes(mode: string | null): string[] {
  const path = mode === null || mode === GLOBAL ? [] : modePath(mode);
  return [...path, GLOBAL];
}

/** One section per reachable mode that draws at least one row. */
export function helpTable(map: Keymap, mode: string | null, facts: ReadonlySet<string>): HelpSection[] {
  return helpModes(mode)
    .map((m) => ({ mode: m, rows: keyTable(map, m, { facts }) }))
    .filter((s) => s.rows.length > 0);
}
