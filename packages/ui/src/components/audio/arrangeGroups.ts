// THE BOARD'S ROWS, AS DATA - the groups file's edits and the rows worth creating, pure. Moved
// with the board from v1 lib/sound/arrangeModel.ts; the server door (lib/sound/arrange.ts)
// applies an edit and the takes it carries in ONE store transaction (v1 patched carried takes one
// request at a time, so a rename could leave a row half under each name).
//
// Kept: deleting is for an EMPTY row only - a row with cards in it is the operator's
// arrangement, and removing it would drop them into "ungrouped" without a word; names are
// compared case-folded, so "Ambient" and "ambient" are one row.
import type { ArrangeKind, ArrangeTake, Stack } from "./arrange.ts";

export type Groups = { readonly music: readonly string[]; readonly sfx: readonly string[] };
export type GroupEdit = { readonly ok: true; readonly groups: Groups } | { readonly ok: false; readonly error: string };

/** One edit the operator makes to the rows of one kind. */
export type GroupOp =
  | { readonly op: "add"; readonly name: string }
  | { readonly op: "rename"; readonly from: string; readonly to: string }
  | { readonly op: "move"; readonly name: string; readonly by: -1 | 1 }
  | { readonly op: "delete"; readonly name: string }
  /** A row the takes carry that the file does not list, or a suggestion, made a declared row. */
  | { readonly op: "adopt"; readonly name: string };

const fold = (s: string): string => s.trim().toLowerCase();
/** The declared spelling an orphan name folds onto when it differs only in case; else null. */
export const declaredAs = (declared: readonly string[], name: string): string | null => declared.find((x) => x !== name && fold(x) === fold(name)) ?? null;
const withKind = (g: Groups, kind: ArrangeKind, list: readonly string[]): Groups => ({ ...g, [kind]: list });

export function addGroup(g: Groups, kind: ArrangeKind, name: string): GroupEdit {
  const n = name.trim();
  if (n === "") return { ok: false, error: "a group needs a name" };
  if (g[kind].some((x) => fold(x) === fold(n))) return { ok: false, error: `“${n}” is already a row` };
  return { ok: true, groups: withKind(g, kind, [...g[kind], n]) };
}

export function renameGroup(g: Groups, kind: ArrangeKind, from: string, to: string): GroupEdit {
  const n = to.trim();
  if (n === "") return { ok: false, error: "a group needs a name" };
  if (!g[kind].includes(from)) return { ok: false, error: `“${from}” is not a row` };
  if (g[kind].some((x) => x !== from && fold(x) === fold(n))) return { ok: false, error: `“${n}” is already a row` };
  return { ok: true, groups: withKind(g, kind, g[kind].map((x) => (x === from ? n : x))) };
}

export function moveGroup(g: Groups, kind: ArrangeKind, name: string, by: -1 | 1): GroupEdit {
  const list = [...g[kind]];
  const i = list.indexOf(name);
  const a = list[i];
  const b = list[i + by];
  if (i < 0 || a === undefined || b === undefined) return { ok: false, error: "already at the edge" };
  list[i] = b;
  list[i + by] = a;
  return { ok: true, groups: withKind(g, kind, list) };
}

export function deleteGroup(g: Groups, kind: ArrangeKind, name: string, stacks: readonly Stack[]): GroupEdit {
  if (!g[kind].includes(name)) return { ok: false, error: `“${name}” is not a row` };
  const held = stacks.filter((s) => s.head.group === name).length;
  if (held > 0) return { ok: false, error: `“${name}” holds ${held} card${held === 1 ? "" : "s"}` };
  return { ok: true, groups: withKind(g, kind, g[kind].filter((x) => x !== name)) };
}

/** The rows' new list for an op (the carried takes are the caller's: `carriedBy`). */
export function applyGroupOp(g: Groups, kind: ArrangeKind, op: GroupOp, stacks: readonly Stack[]): GroupEdit {
  switch (op.op) {
    case "add":
      return addGroup(g, kind, op.name);
    case "adopt":
      // An orphan spelled in another case than a declared row is that row: adopting it merges.
      return declaredAs(g[kind], op.name) === null ? addGroup(g, kind, op.name) : { ok: true, groups: g };
    case "rename":
      return renameGroup(g, kind, op.from, op.to);
    case "move":
      return moveGroup(g, kind, op.name, op.by);
    case "delete":
      return deleteGroup(g, kind, op.name, stacks);
  }
}

/** The values a head files under: its genres for music, its category for an effect. */
const valuesOf = (t: ArrangeTake, kind: ArrangeKind): readonly string[] => (kind === "sfx" ? (t.terms.sfxCategory === null ? [] : [t.terms.sfxCategory]) : t.terms.genre);

/** Ungrouped heads that carry `name` - what adopting the suggestion files into the new row. */
export function matchesSuggestion(s: Stack, name: string, kind: ArrangeKind): boolean {
  return s.head.group === null && valuesOf(s.head, kind).some((v) => fold(v) === fold(name));
}

/**
 * The takes an op re-files, by id, with the group each takes: a rename carries EVERY take of the
 * kind under the old name, older versions too, so a stack never straddles two names; an adopt
 * files the ungrouped heads that carry the suggestion; an adopt of a case variant of a declared
 * row (`declared`, the file's list before the op) files the takes under that spelling instead.
 */
export function carriedBy<T extends ArrangeTake>(op: GroupOp, kind: ArrangeKind, takes: readonly T[], stacks: readonly Stack<T>[], declared: readonly string[] = []): readonly { readonly id: string; readonly group: string }[] {
  if (op.op === "rename") return takes.filter((t) => t.kind === kind && t.group === op.from).map((t) => ({ id: t.id, group: op.to.trim() }));
  if (op.op === "adopt") {
    const into = declaredAs(declared, op.name);
    if (into !== null) return takes.filter((t) => t.kind === kind && t.group === op.name).map((t) => ({ id: t.id, group: into }));
  }
  if (op.op === "adopt") return stacks.filter((s) => matchesSuggestion(s, op.name, kind)).map((s) => ({ id: s.head.id, group: op.name.trim() }));
  return [];
}

export type Suggestion = { readonly name: string; readonly n: number };

/** Rows worth creating: the genres (music) or categories (effects) ungrouped heads carry, minus
 *  the rows that exist, by how many cards each would collect, then by name. */
export function seedSuggestions(stacks: readonly Stack[], declared: readonly string[], kind: ArrangeKind): Suggestion[] {
  const have = new Set(declared.map(fold));
  const n = new Map<string, { name: string; n: number }>();
  for (const s of stacks) {
    if (s.head.group !== null) continue;
    const seen = new Set<string>();
    for (const v of valuesOf(s.head, kind)) {
      const k = fold(v);
      if (k === "" || have.has(k) || seen.has(k)) continue;
      seen.add(k);
      const cur = n.get(k);
      if (cur === undefined) n.set(k, { name: v.trim(), n: 1 });
      else cur.n += 1;
    }
  }
  return [...n.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
