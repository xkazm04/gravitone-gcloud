// A CHORD IS WHAT A PERSON READS ON THE CAP, AND WHAT A PRESS IS MATCHED AGAINST.
//
// v1 (components/ui/signal/keymap.ts) already derived the event keys from the caps
// (`eventKeys`), so the drawn table and the bound table could not drift. It had no
// grammar for Shift or for the platform modifier, so every chord that needed one
// lived in a hand-rolled `if` beside the keymap: the prototype's ⇧1-4 lane focus,
// ⇧K/⇧X row verdicts and Ctrl/⌘+Z undo were all invisible to the drawn table and to
// any conflict check. Here a cap may carry `⇧` and `⌘` prefixes, so every chord the
// design binds is declared as data and parsed by this one function.
//
// Three rules the parser and the matcher share, each with the failure it prevents:
//   · LETTERS are matched on `key`, case-folded: the key labelled K on an AZERTY or
//     Dvorak board is the K a person was told to press. `code` would bind positions.
//   · SHIFTED DIGITS are also matched on `code` (Digit1..): Shift+1 reports `key` "!"
//     on a US layout, so ⇧1 could never match by `key` (the prototype read `e.code`
//     for the same reason). The typed character is tried first, so ⇧7 on a German
//     board is still `/`. An unshifted digit is matched on `key` like a letter.
//   · PUNCTUATION already encodes Shift in the character ("?" is ⇧/ on one layout
//     and something else on the next), so a punctuation chord ignores Shift and a
//     cap that writes `⇧/` is refused as ambiguous.
// Alt belongs to the OS and to assistive technology and never matches - except as
// AltGr (Ctrl+Alt reported together with a printable character), which is how a
// German or Polish board types `[` and `]`; v1 refused those presses outright.

import { err, ok, type Result } from "@gt/domain/errors";

export type Chord = {
  /** The normalised key: a lower-case letter, a digit, a punctuation character, or a named key. */
  readonly key: string;
  readonly shift: boolean;
  /** Ctrl on Windows/Linux, ⌘ on macOS: the platform's primary modifier. */
  readonly mod: boolean;
};

/** Named caps as drawn, to the `KeyboardEvent.key` they stand for. */
const NAMED: Readonly<Record<string, string>> = {
  "←": "ArrowLeft",
  "→": "ArrowRight",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  Esc: "Escape",
  "⏎": "Enter",
  Enter: "Enter",
  "⌫": "Backspace",
  Space: " ",
  Tab: "Tab",
  PgUp: "PageUp",
  PgDn: "PageDown",
  Home: "Home",
  End: "End",
};

const NAMED_KEYS: ReadonlySet<string> = new Set(Object.values(NAMED));

const isLetterOrDigit = (k: string): boolean => /^[a-z0-9]$/.test(k);
const isPunctuation = (k: string): boolean => k.length === 1 && k !== " " && !isLetterOrDigit(k);

/** Parse a drawn cap (`K`, `⇧K`, `⌘Z`, `⏎`, `⇧1`, `/`) into the chord it binds. */
export function parseCap(cap: string): Result<Chord> {
  let rest = cap;
  let shift = false;
  let mod = false;
  for (;;) {
    if (rest.startsWith("⇧") && !shift && rest.length > 1) { shift = true; rest = rest.slice(1); continue; }
    if (rest.startsWith("⌘") && !mod && rest.length > 1) { mod = true; rest = rest.slice(1); continue; }
    break;
  }
  const named = NAMED[rest];
  const key = named ?? (rest.length === 1 ? rest.toLowerCase() : undefined);
  if (key === undefined) return err("invalid", `cap "${cap}": "${rest}" is neither a single character nor a named key (${Object.keys(NAMED).join(" ")})`);
  if (shift && isPunctuation(key)) return err("invalid", `cap "${cap}": punctuation carries its own shift; write the character itself`);
  return ok({ key, shift, mod });
}

export const sameChord = (a: Chord, b: Chord): boolean => a.key === b.key && a.shift === b.shift && a.mod === b.mod;

/** The fields of a KeyboardEvent the matcher reads; a test builds one by hand. */
export type KeyEventLike = {
  readonly key: string;
  readonly code?: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
};

/**
 * The chords a press makes, best reading first, or [] when it belongs to the OS
 * (Alt, a dead key, a bare modifier). A shifted digit-row key has TWO readings: the
 * character it typed (`/` is ⇧7 on a German board) and the digit it sits on (`!` is
 * ⇧1 on a US board, where the design binds ⇧1). The character is tried first.
 */
export function chordsOf(e: KeyEventLike): Chord[] {
  const ctrl = e.ctrlKey === true;
  const alt = e.altKey === true;
  const raw = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const out: Chord[] = [];
  if (raw.length === 1 || NAMED_KEYS.has(raw)) {
    const altGr = ctrl && alt && raw.length === 1;
    if (alt && !altGr) return [];
    out.push({ key: raw, shift: isPunctuation(raw) ? false : e.shiftKey === true, mod: !altGr && (ctrl || e.metaKey === true) });
  } else if (alt) return [];
  // AltGr+8 is `[` on a German board and also reports Digit8, so AltGr never reads the code.
  const digit = e.shiftKey === true && !alt ? /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? "")?.[1] : undefined;
  if (digit !== undefined && digit !== raw) out.push({ key: digit, shift: true, mod: ctrl || e.metaKey === true });
  return out;
}
