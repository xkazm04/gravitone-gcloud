// THE ARRANGEMENT BOARD, AS DATA — every rule the board obeys, with no React
// and no fetch, so tests/golden-path/sound-arrange.probe.spec.ts can hold each
// one without a browser (round 4, platform-consolidation, WP3).
//
// The board is two axes over the KEPT takes of one kind:
//
//   x — the stage (lib/sound/types.ts STAGES): pending · remaster · edit ·
//       finalized. Remaster and edit are manual today: the take leaves for
//       Suno's studio and comes back as a new file.
//   y — the group (lib/sound/types.ts SoundGroups[kind]): a genre group for
//       music, an sfx category for effects, plus the row for no group at all.
//
// A card is not a take, it is a VERSION STACK: a take and every take that
// names it (transitively) as its parent. A Suno return is filed with
// `parentId` = the card it answers, so the card's newest version is the one
// that sits on the board, moves, and is finalized; the older ones ride under
// it to be compared. This is why a cell holds stacks and every move patches
// the head alone.

import { STAGES, type SoundGroups, type SoundKind, type SoundTake, type Stage, type TakePatch } from "@/lib/sound/types";

/* ── the version stack ─────────────────────────────────────────────────── */

export interface Stack {
  /** The newest version: where the card sits, what moves, what is finalized. */
  head: SoundTake;
  /** Every version, newest first; `versions[0] === head`. */
  versions: SoundTake[];
  /** The first take of the chain — stable across new versions, so it keys the card. */
  rootId: string;
}

const newestFirst = (a: SoundTake, b: SoundTake) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1;

/**
 * Fold takes into version stacks. A take's root is found by walking `parentId`
 * while the parent is among the takes given; a parent that is not (rejected,
 * another kind, deleted) ends the walk, so that take roots its own stack rather
 * than vanishing. A cycle (which the store never writes, but a hand-edited
 * takes.json could) also ends the walk at the first repeat.
 *
 * ORDER IS THE CHAIN, NOT THE CLOCK. A return is later than the version it
 * answers by construction, whatever its timestamp says — and timestamps do
 * disagree: a migrated row keeps the time it was first made (lib/sound/takes.ts
 * createTake, "a migrated row keeps the time it was made"), so a Suno return
 * filed today onto an imported parent can carry the EARLIER createdAt. Found on
 * the real routes (2026-10-05): ordered by createdAt, the fresh return sat
 * under its parent and the card stayed in the column it had just left. So a
 * version's depth in the chain decides; createdAt only breaks a tie between two
 * returns of the same parent.
 */
export function stackVersions(takes: readonly SoundTake[]): Stack[] {
  const byId = new Map(takes.map((t) => [t.id, t]));
  const walk = (t: SoundTake) => {
    const seen = new Set<string>([t.id]);
    let cur = t;
    let depth = 0;
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
      cur = byId.get(cur.parentId)!;
      seen.add(cur.id);
      depth += 1;
    }
    return { root: cur.id, depth };
  };
  const chains = new Map<string, { t: SoundTake; depth: number }[]>();
  for (const t of takes) {
    const w = walk(t);
    const list = chains.get(w.root);
    if (list) list.push({ t, depth: w.depth });
    else chains.set(w.root, [{ t, depth: w.depth }]);
  }
  const stacks: Stack[] = [];
  for (const [rootId, list] of chains) {
    const versions = [...list].sort((a, b) => b.depth - a.depth || newestFirst(a.t, b.t)).map((x) => x.t);
    stacks.push({ head: versions[0], versions, rootId });
  }
  return stacks.sort((a, b) => newestFirst(a.head, b.head));
}

/** 1-based version number of a take inside its stack (oldest = v1). */
export const versionNumber = (s: Stack, id: string) => {
  const i = s.versions.findIndex((v) => v.id === id);
  return i < 0 ? null : s.versions.length - i;
};

/* ── rows and cells ────────────────────────────────────────────────────── */

/** A row of the board. `name: null` is the row for takes with no group. */
export interface Row {
  key: string;
  name: string | null;
  /** A group the takes carry but the groups file does not list — drawn, and
   *  adoptable, never silently folded into "ungrouped". */
  orphan: boolean;
}

export const UNGROUPED_KEY = "∅";
export const rowKey = (name: string | null) => (name === null ? UNGROUPED_KEY : `g:${name}`);

/** Declared groups in their saved order, then any group a head names that the
 *  file does not, then the row for no group — always last, always present. */
export function rowsFor(declared: readonly string[], stacks: readonly Stack[]): Row[] {
  const known = new Set(declared);
  const orphans: string[] = [];
  for (const s of stacks) {
    const g = s.head.group;
    if (g !== null && !known.has(g) && !orphans.includes(g)) orphans.push(g);
  }
  orphans.sort((a, b) => a.localeCompare(b));
  return [
    ...declared.map((name) => ({ key: rowKey(name), name, orphan: false })),
    ...orphans.map((name) => ({ key: rowKey(name), name, orphan: true })),
    { key: UNGROUPED_KEY, name: null, orphan: false },
  ];
}

export interface Cell {
  stage: Stage;
  group: string | null;
}

export const cellKey = (c: Cell) => `${c.stage}|${rowKey(c.group)}`;

/** Where a stack sits: its head's stage (a kept take with no stage yet is
 *  pending — the store sets that on keep, but a row written before it is not
 *  lost) and its head's group. */
export const cellOf = (s: Stack): Cell => ({ stage: s.head.stage ?? "pending", group: s.head.group });

export const sameCell = (a: Cell, b: Cell) => a.stage === b.stage && a.group === b.group;

/** Every stack placed in its cell; empty cells are present as empty arrays. */
export function buildBoard(stacks: readonly Stack[], rows: readonly Row[]): Map<string, Stack[]> {
  const board = new Map<string, Stack[]>();
  for (const r of rows) for (const stage of STAGES) board.set(cellKey({ stage, group: r.name }), []);
  for (const s of stacks) board.get(cellKey(cellOf(s)))?.push(s);
  return board;
}

/** Per-stage head counts — the column tallies. */
export function stageCounts(stacks: readonly Stack[]): Record<Stage, number> {
  const n: Record<Stage, number> = { pending: 0, remaster: 0, edit: 0, finalized: 0 };
  for (const s of stacks) n[cellOf(s).stage] += 1;
  return n;
}

/* ── moving ────────────────────────────────────────────────────────────── */

export type MoveCheck =
  | { ok: true; patch: TakePatch }
  | { ok: false; reason: "same-cell" | "needs-label" | "unknown-row" };

/**
 * Whether a stack may go to a cell, and the patch that puts it there.
 *
 * Finalized needs a library label — the engine answers 409 without one
 * (brief: PATCH stage "finalized" requires a label), and the label is what
 * agents select by, so the board asks for it BEFORE the request rather than
 * learning it from a refusal. A head that already carries a label (it was
 * finalized once and came back) keeps it unless a new one is given.
 */
export function checkMove(s: Stack, to: Cell, rows: readonly Row[], label?: string | null): MoveCheck {
  if (!rows.some((r) => r.name === to.group)) return { ok: false, reason: "unknown-row" };
  const given = label?.trim() || null;
  const from = cellOf(s);
  if (sameCell(from, to) && !given) return { ok: false, reason: "same-cell" };
  if (to.stage === "finalized" && !given && !s.head.label?.trim()) return { ok: false, reason: "needs-label" };
  const patch: TakePatch = { stage: to.stage, group: to.group };
  if (given) patch.label = given;
  return { ok: true, patch };
}

export type Dir = "left" | "right" | "up" | "down";

/** The neighbouring cell in a direction, or null at the board's edge. */
export function step(from: Cell, dir: Dir, rows: readonly Row[]): Cell | null {
  if (dir === "left" || dir === "right") {
    const i = STAGES.indexOf(from.stage) + (dir === "right" ? 1 : -1);
    return i < 0 || i >= STAGES.length ? null : { stage: STAGES[i], group: from.group };
  }
  const r = rows.findIndex((x) => x.name === from.group) + (dir === "down" ? 1 : -1);
  return r < 0 || r >= rows.length ? null : { stage: from.stage, group: rows[r].name };
}

export const nextStage = (s: Stage): Stage | null => STAGES[STAGES.indexOf(s) + 1] ?? null;

/* ── the label ─────────────────────────────────────────────────────────── */

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The library label offered when a card is finalized: the row's group, then the
 * take's strongest terms — up to two moods and one instrument for music; for an
 * effect, its category, its first mood and "loop" when it is one. Case-folded
 * duplicates are dropped, so a group "ambient" over a take tagged "Ambient"
 * does not read "Ambient · ambient". The operator edits it; this only saves the
 * typing.
 */
export function suggestLabel(t: SoundTake, group: string | null): string {
  const lead = group ?? (t.kind === "sfx" ? t.terms.sfxCategory : t.terms.genre[0]) ?? t.title;
  const parts: string[] = [cap(lead.trim())];
  const add = (v: string | null | undefined) => {
    const x = v?.trim();
    if (x && !parts.some((p) => p.toLowerCase() === x.toLowerCase())) parts.push(x.toLowerCase());
  };
  if (t.kind === "sfx") {
    add(t.terms.sfxCategory);
    add(t.terms.mood[0]);
    if (t.loop) add("loop");
  } else {
    t.terms.mood.slice(0, 2).forEach(add);
    add(t.terms.instrument[0]);
  }
  return parts.slice(0, 4).join(" · ");
}

/** The line an agent runs to pick from a finalized row (pipeline/sound.mts,
 *  brief: `finalized [--kind] [--group] [--label] --json`). Shown as data. */
export function agentLine(kind: SoundKind, group: string | null): string {
  const g = group === null ? "" : ` --group "${group.replace(/(["\\$`])/g, "\\$1")}"`;
  return `npx tsx pipeline/sound.mts finalized --kind ${kind}${g} --json`;
}

/* ── groups ────────────────────────────────────────────────────────────── */

const fold = (s: string) => s.trim().toLowerCase();

export interface Suggestion {
  name: string;
  /** Ungrouped heads that carry it — what filing the row would move. */
  n: number;
}

/**
 * Rows worth creating: the genres (music) or sfx categories (effects) carried
 * by heads that sit in no group, minus the groups that already exist. Ordered
 * by how many cards each would collect, then by name.
 */
export function seedSuggestions(stacks: readonly Stack[], declared: readonly string[], kind: SoundKind): Suggestion[] {
  const have = new Set(declared.map(fold));
  const n = new Map<string, Suggestion>();
  for (const s of stacks) {
    if (s.head.group !== null) continue;
    const vals = kind === "sfx" ? [s.head.terms.sfxCategory] : s.head.terms.genre;
    const seen = new Set<string>();
    for (const v of vals) {
      const k = v ? fold(v) : "";
      if (!k || have.has(k) || seen.has(k)) continue;
      seen.add(k);
      const cur = n.get(k);
      if (cur) cur.n += 1;
      else n.set(k, { name: v!.trim(), n: 1 });
    }
  }
  return [...n.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** The ungrouped heads a suggestion would file into its new row. */
export function matchesSuggestion(s: Stack, name: string, kind: SoundKind): boolean {
  if (s.head.group !== null) return false;
  const vals = kind === "sfx" ? [s.head.terms.sfxCategory] : s.head.terms.genre;
  return vals.some((v) => !!v && fold(v) === fold(name));
}

export type GroupEdit = { ok: true; groups: SoundGroups } | { ok: false; error: string };

const withKind = (g: SoundGroups, kind: SoundKind, list: string[]): SoundGroups => ({ ...g, [kind]: list });

export function addGroup(g: SoundGroups, kind: SoundKind, name: string): GroupEdit {
  const n = name.trim();
  if (!n) return { ok: false, error: "a group needs a name" };
  if (g[kind].some((x) => fold(x) === fold(n))) return { ok: false, error: `“${n}” is already a row` };
  return { ok: true, groups: withKind(g, kind, [...g[kind], n]) };
}

export function renameGroup(g: SoundGroups, kind: SoundKind, from: string, to: string): GroupEdit {
  const n = to.trim();
  if (!n) return { ok: false, error: "a group needs a name" };
  if (!g[kind].includes(from)) return { ok: false, error: `“${from}” is not a row` };
  if (g[kind].some((x) => x !== from && fold(x) === fold(n))) return { ok: false, error: `“${n}” is already a row` };
  return { ok: true, groups: withKind(g, kind, g[kind].map((x) => (x === from ? n : x))) };
}

export function moveGroup(g: SoundGroups, kind: SoundKind, name: string, by: -1 | 1): GroupEdit {
  const list = [...g[kind]];
  const i = list.indexOf(name);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return { ok: false, error: "already at the edge" };
  [list[i], list[j]] = [list[j], list[i]];
  return { ok: true, groups: withKind(g, kind, list) };
}

/** Deleting is for an EMPTY row only: a row with cards in it is the operator's
 *  arrangement, and removing it would silently drop them into "ungrouped". */
export function deleteGroup(g: SoundGroups, kind: SoundKind, name: string, stacks: readonly Stack[]): GroupEdit {
  if (!g[kind].includes(name)) return { ok: false, error: `“${name}” is not a row` };
  const held = stacks.filter((s) => s.head.group === name).length;
  if (held) return { ok: false, error: `“${name}” holds ${held} card${held === 1 ? "" : "s"}` };
  return { ok: true, groups: withKind(g, kind, g[kind].filter((x) => x !== name)) };
}

/* ── words ─────────────────────────────────────────────────────────────── */

export const STAGE_WORD: Record<Stage, string> = {
  pending: "pending",
  remaster: "remaster",
  edit: "edit",
  finalized: "finalized",
};

export const rowWord = (group: string | null) => group ?? "ungrouped";

/** The aria-live sentence for a move — the work, said once. */
export const movedSentence = (title: string, to: Cell) => `${title} → ${STAGE_WORD[to.stage]} · ${rowWord(to.group)}`;
