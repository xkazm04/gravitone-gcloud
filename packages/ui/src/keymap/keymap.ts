// ONE KEYMAP, DECLARED ONCE: bind, guard, check and draw from the same rows.
//
// v1 got halfway (components/ui/signal/keymap.ts: one `defineKeymap` value drives
// binding, guarding and the drawn <Keycaps>), and still had three keymaps and 30
// raw keydown listeners, because a keymap was per COMPONENT: each surface brought
// its own and nothing could see two of them claim the same key. The prototype went
// the other way - one listener per page and keys that change meaning per page
// (plan §9.1). Here every binding of the app is a row in ONE table, scoped by a
// MODE, so "what does K do here" is a lookup and "do two rows fight" is a pure
// check (`conflicts`) that runs as a unit test over the real table.
//
//   mode     dotted and nested: `board.cull` sees its own rows, then `board`'s.
//            An inner row hides an outer one for the same chord ONLY when it says
//            `shadows`; an undeclared overlap is a conflict, not a precedence.
//   when     a named fact the active screen supplies (`audio`, `job`); `!fact`
//            negates it, and `x` / `!x` are the one pair the checker treats as
//            mutually exclusive. Any other two rows on one chord can both be live.
//   field    the row fires ONLY inside the editable field of that `data-keyfield`
//            ("*" for any field). Without it a row never fires while typing.
//   repeat   a held key keeps firing (walking). Default refused: a held K decides
//            ONE item (v1 keyGuard's rule, and the Board's before it).
//   keys     the caps that are drawn; `alias` binds more caps without drawing them
//            (the cull draws ← → and also answers J / L).

import { parseCap, sameChord, type Chord } from "./chord.ts";
import type { TargetInfo } from "./target.ts";

export type Binding = {
  readonly mode: string;
  readonly keys: readonly string[];
  readonly verb: string;
  /** The drawn words; defaults to `verb`. Adjacent rows with equal `does` draw as one row. */
  readonly does?: string;
  readonly when?: string;
  readonly alias?: readonly string[];
  readonly field?: string;
  readonly repeat?: true;
  readonly shadows?: true;
  /** Enter/Space still fire on a focused button or link. Default: the control's own. */
  readonly onControl?: true;
};

export type Compiled = { readonly binding: Binding; readonly chords: readonly Chord[]; readonly caps: readonly string[] };
export type Keymap = { readonly rows: readonly Compiled[]; readonly problems: readonly string[] };

/** Parse every cap once. A cap that does not parse is a PROBLEM, reported and left unbound. */
export function compile(table: readonly Binding[]): Keymap {
  const problems: string[] = [];
  const rows = table.map((binding) => {
    const caps = [...binding.keys, ...(binding.alias ?? [])];
    if (caps.length === 0) problems.push(`${binding.mode}/${binding.verb}: binds no key`);
    const chords: Chord[] = [];
    const kept: string[] = [];
    for (const cap of caps) {
      const r = parseCap(cap);
      if (r.ok) { chords.push(r.value); kept.push(cap); } else problems.push(`${binding.mode}/${binding.verb}: ${r.error.message}`);
    }
    return { binding, chords, caps: kept };
  });
  return { rows, problems };
}

/** `board.cull` -> [`board.cull`, `board`]: the modes a press in `mode` can reach, innermost first. */
export function modePath(mode: string): string[] {
  const parts = mode.split(".");
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("."));
}

const holds = (when: string | undefined, facts: ReadonlySet<string>): boolean =>
  when === undefined || (when.startsWith("!") ? !facts.has(when.slice(1)) : facts.has(when));

const fieldAdmits = (field: string | undefined, t: TargetInfo): boolean =>
  field === undefined ? !t.editable : t.editable && (field === "*" || field === t.field);

export type Press = {
  /** Best reading first (`chordsOf`). */
  readonly chords: readonly Chord[];
  readonly repeat: boolean;
  readonly target: TargetInfo;
};

export type Match = { readonly binding: Binding; readonly cap: string; readonly index: number };

/**
 * What a press means in `mode` given the screen's `facts`, or null when it is nobody's.
 *
 * The innermost live row for the chord decides, and its guards are FINAL: a held K
 * refused by the cull's row does not fall through to an outer row that would take it.
 */
export function resolve(map: Keymap, press: Press, mode: string, facts: ReadonlySet<string>): Match | null {
  for (const chord of press.chords) {
    for (const m of modePath(mode)) {
      for (const row of map.rows) {
        const b = row.binding;
        if (b.mode !== m || !holds(b.when, facts) || !fieldAdmits(b.field, press.target)) continue;
        const index = row.chords.findIndex((c) => sameChord(c, chord));
        if (index < 0) continue;
        if (press.repeat && b.repeat !== true) return null;
        const activates = chord.key === "Enter" || chord.key === " ";
        if (activates && press.target.control && b.onControl !== true) return null;
        return { binding: b, cap: row.caps[index] ?? "", index };
      }
    }
  }
  return null;
}

export type Conflict = { readonly a: Binding; readonly b: Binding; readonly cap: string; readonly why: string };

const exclusive = (x: string | undefined, y: string | undefined): boolean =>
  x !== undefined && y !== undefined && (x === `!${y}` || y === `!${x}`);

const fieldsOverlap = (x: string | undefined, y: string | undefined): boolean =>
  x === undefined || y === undefined ? x === y : x === "*" || y === "*" || x === y;

/**
 * Every pair of rows that can both be live for one chord where neither is
 * declared to win: same mode, or an inner mode overlapping an outer one without
 * `shadows`. Returns [] for a sound table.
 */
export function conflicts(map: Keymap): Conflict[] {
  const out: Conflict[] = [];
  const rows = map.rows;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const p = rows[i];
      const q = rows[j];
      if (p === undefined || q === undefined) continue;
      const a = p.binding;
      const b = q.binding;
      const aInB = modePath(a.mode).includes(b.mode);
      const bInA = modePath(b.mode).includes(a.mode);
      if (!aInB && !bInA) continue;
      if (exclusive(a.when, b.when) || !fieldsOverlap(a.field, b.field)) continue;
      const hit = p.chords.findIndex((c) => q.chords.some((d) => sameChord(c, d)));
      if (hit < 0) continue;
      const cap = p.caps[hit] ?? "";
      if (a.mode === b.mode) out.push({ a, b, cap, why: `both bind ${cap} in ${a.mode}` });
      else {
        const inner = aInB ? a : b;
        if (inner.shadows !== true) out.push({ a, b, cap, why: `${inner.mode}/${inner.verb} overlaps ${cap} of an outer mode without \`shadows\`` });
      }
    }
  }
  return out;
}

/** Declarations that lie or cannot bind: unparsable caps, a `shadows` with nothing under it. */
export function problems(map: Keymap): string[] {
  const out = [...map.problems];
  for (const row of map.rows) {
    const b = row.binding;
    if (b.shadows !== true) continue;
    const outer = modePath(b.mode).slice(1);
    const hides = map.rows.some(
      (o) => outer.includes(o.binding.mode) && o.chords.some((c) => row.chords.some((d) => sameChord(c, d))),
    );
    if (!hides) out.push(`${b.mode}/${b.verb}: declares \`shadows\` but no outer mode binds its keys`);
  }
  return out;
}

export type KeyRow = { readonly keys: readonly string[]; readonly does: string };

/**
 * The drawn table for exactly `mode` (not its ancestors: the cull desk draws the
 * desk's keys, the sheet bar draws its own), in declaration order, with adjacent
 * rows of equal `does` drawn as one. `facts` hides rows whose `when` is false, so
 * an audio packet draws "Space play" and an image packet does not. `field` draws
 * that field's rows instead of the page's.
 */
export function keyTable(map: Keymap, mode: string, opts: { facts?: ReadonlySet<string>; field?: string } = {}): KeyRow[] {
  const facts = opts.facts ?? new Set<string>();
  const out: { keys: string[]; does: string }[] = [];
  for (const { binding: b } of map.rows) {
    if (b.mode !== mode || !holds(b.when, facts) || b.field !== opts.field || b.keys.length === 0) continue;
    const does = b.does ?? b.verb;
    const last = out[out.length - 1];
    if (last !== undefined && last.does === does) last.keys.push(...b.keys);
    else out.push({ keys: [...b.keys], does });
  }
  return out;
}
