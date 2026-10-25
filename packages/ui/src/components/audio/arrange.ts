// THE ARRANGE BOARD, AS DATA - where a kept take sits and whether it may move, pure, so the
// card's gesture (a drag, ⇧arrow), the server's door (lib/sound/arrange.ts) and the tests all
// ask ONE copy of the rules.
//
// Absorbed from v1 lib/sound/arrangeModel.ts (round 4, WP3), whose reasons stand:
//   · two axes over the KEPT takes of one kind: stages across (pending · remaster · edit ·
//     finalized; remaster and edit are manual, done in Suno's studio) and groups down (a genre
//     row for music, an sfx category for effects, then the row for no group);
//   · a card is a VERSION STACK - a take and every take naming it, transitively, as its parent;
//     the deepest version is the head, which sits, moves and is finalized. Order is the chain,
//     not the clock: a migrated parent keeps the time it was made, so a return filed today can
//     carry the EARLIER createdAt (found on the real routes 2026-10-05);
//   · finalized needs a library label (the engine answers 409 without one, and the label is
//     what agents select by), asked for BEFORE the write rather than learned from a refusal;
//   · a group the takes carry that the file does not list is drawn as an orphan row, never
//     folded silently into "ungrouped".
// Upgraded:
//   · `admitMove` is the door's half: the server re-resolves the take and judges the move
//     against the CURRENT store, not the gesture's snapshot (drag-drop ownership-boundaries:
//     validation at the authority's door) - a card that moved since it was picked up, or is no
//     longer its stack's head because a return was filed, is refused with that sentence;
//   · generic over the take's shape, so the kit holds the rules without importing v1's store
//     types; lib/sound's SoundTake satisfies `ArrangeTake` as it stands.
// The group edits live beside this file (./arrangeGroups.ts); the row-name folding both share is
// ./arrangeNames.ts.
import { err, ok, type Result } from "@gt/domain/errors";
import { declaredAs } from "./arrangeNames.ts";

export const STAGES = ["pending", "remaster", "edit", "finalized"] as const;
export type Stage = (typeof STAGES)[number];
export type ArrangeKind = "music" | "sfx";

/** What the board reads of a take (lib/sound/types.ts SoundTake carries all of it). */
export type ArrangeTake = {
  readonly id: string;
  readonly title: string;
  readonly kind: ArrangeKind;
  readonly stage: Stage | null;
  readonly group: string | null;
  readonly label: string | null;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly loop: boolean | null;
  readonly terms: { readonly genre: readonly string[]; readonly mood: readonly string[]; readonly instrument: readonly string[]; readonly sfxCategory: string | null };
};

export type Stack<T extends ArrangeTake = ArrangeTake> = {
  /** The newest version: where the card sits, what moves, what is finalized. */
  readonly head: T;
  /** Every version, head first. */
  readonly versions: readonly T[];
  /** The chain's first take - stable across new versions, so it keys the card. */
  readonly rootId: string;
};

const newestFirst = (a: ArrangeTake, b: ArrangeTake): number => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1);

/**
 * Fold takes into version stacks. A take's root is found by walking `parentId` while the parent
 * is among the takes given; a parent that is not (rejected, another kind) ends the walk, so the
 * take roots its own stack rather than vanishing, and a cycle (a hand-edited takes.json) ends
 * it at the first repeat. The deeper version is the newer; createdAt only breaks a tie between
 * two returns of the same parent.
 */
export function stackVersions<T extends ArrangeTake>(takes: readonly T[]): Stack<T>[] {
  const byId = new Map(takes.map((t) => [t.id, t] as const));
  const chains = new Map<string, { t: T; depth: number }[]>();
  for (const t of takes) {
    const seen = new Set<string>([t.id]);
    let cur = t;
    let depth = 0;
    for (let up = cur.parentId === null ? undefined : byId.get(cur.parentId); up !== undefined && !seen.has(up.id); up = cur.parentId === null ? undefined : byId.get(cur.parentId)) {
      cur = up;
      seen.add(cur.id);
      depth += 1;
    }
    const list = chains.get(cur.id) ?? [];
    list.push({ t, depth });
    chains.set(cur.id, list);
  }
  const stacks: Stack<T>[] = [];
  for (const [rootId, list] of chains) {
    const versions = [...list].sort((a, b) => b.depth - a.depth || newestFirst(a.t, b.t)).map((x) => x.t);
    const head = versions[0];
    if (head !== undefined) stacks.push({ head, versions, rootId });
  }
  return stacks.sort((a, b) => newestFirst(a.head, b.head));
}

/** 1-based version number of a take inside its stack (the oldest is v1), or null. */
export function versionNumber(s: Stack, id: string): number | null {
  const i = s.versions.findIndex((v) => v.id === id);
  return i < 0 ? null : s.versions.length - i;
}

/* ── rows and cells ────────────────────────────────────────────────────── */

/** `into`: for an orphan spelled in another case than a declared row, that row's spelling. */
export type Row = { readonly key: string; readonly name: string | null; readonly orphan: boolean; readonly into: string | null };

export const UNGROUPED_KEY = "∅";
export const rowKey = (name: string | null): string => (name === null ? UNGROUPED_KEY : `g:${name}`);

/** Declared groups in their saved order, then the groups heads carry that the file does not
 *  list, then the row for no group - always last, always present. */
export function rowsFor(declared: readonly string[], stacks: readonly Stack[]): Row[] {
  const known = new Set(declared);
  const orphans = [...new Set(stacks.flatMap((s) => (s.head.group !== null && !known.has(s.head.group) ? [s.head.group] : [])))].sort((a, b) => a.localeCompare(b));
  return [
    ...declared.map((name) => ({ key: rowKey(name), name, orphan: false, into: null })),
    ...orphans.map((name) => ({ key: rowKey(name), name, orphan: true, into: declaredAs(declared, name) })),
    { key: UNGROUPED_KEY, name: null, orphan: false, into: null },
  ];
}

export type Cell = { readonly stage: Stage; readonly group: string | null };

export const cellKey = (c: Cell): string => `${c.stage}|${rowKey(c.group)}`;
/** A kept take with no stage yet is pending (the store sets that on keep; older rows lack it). */
export const cellOf = (s: Stack): Cell => ({ stage: s.head.stage ?? "pending", group: s.head.group });
export const sameCell = (a: Cell, b: Cell): boolean => a.stage === b.stage && a.group === b.group;

/** Every stack placed in its cell; empty cells are present as empty lists. */
export function buildBoard<T extends ArrangeTake>(stacks: readonly Stack<T>[], rows: readonly Row[]): Map<string, Stack<T>[]> {
  const board = new Map<string, Stack<T>[]>();
  for (const r of rows) for (const stage of STAGES) board.set(cellKey({ stage, group: r.name }), []);
  for (const s of stacks) board.get(cellKey(cellOf(s)))?.push(s);
  return board;
}

export function stageCounts(stacks: readonly Stack[]): Record<Stage, number> {
  const n: Record<Stage, number> = { pending: 0, remaster: 0, edit: 0, finalized: 0 };
  for (const s of stacks) n[cellOf(s).stage] += 1;
  return n;
}

/* ── moving ────────────────────────────────────────────────────────────── */

export type MovePatch = { readonly stage: Stage; readonly group: string | null; readonly label?: string };
export type MoveRefusal = "same-cell" | "needs-label" | "unknown-row";
export type MoveCheck = { readonly ok: true; readonly patch: MovePatch } | { readonly ok: false; readonly reason: MoveRefusal };

const trimmed = (v: string | null | undefined): string | null => {
  const t = v?.trim() ?? "";
  return t === "" ? null : t;
};

/**
 * Whether a stack may go to a cell, and the patch that puts it there. A head that already
 * carries a label (finalized once, came back) keeps it unless a new one is given; a label given
 * on the same cell is a relabel, not a no-op.
 */
export function checkMove(s: Stack, to: Cell, rows: readonly Row[], label?: string | null): MoveCheck {
  if (!rows.some((r) => r.name === to.group)) return { ok: false, reason: "unknown-row" };
  const given = trimmed(label);
  if (sameCell(cellOf(s), to) && given === null) return { ok: false, reason: "same-cell" };
  if (to.stage === "finalized" && given === null && trimmed(s.head.label) === null) return { ok: false, reason: "needs-label" };
  return { ok: true, patch: { stage: to.stage, group: to.group, ...(given === null ? {} : { label: given }) } };
}

/** What a refusal says to the operator, in the work's words. */
export const REFUSAL_WORDS: Readonly<Record<MoveRefusal, string>> = {
  "same-cell": "already there",
  "needs-label": "a finalized take needs a library label",
  "unknown-row": "that row is not on the board",
};

export type MoveRequest = { readonly id: string; readonly from: Cell; readonly to: Cell; readonly label?: string };

/**
 * THE DOOR'S JUDGEMENT over the store as it is now. `takes` is every take of the store (any
 * verdict, any kind); `declared` the groups file's rows for the take's kind. Returns the patch,
 * or a refusal whose words reach the operator verbatim. A request whose take already sits in
 * `to` with the label asked is an ANSWERED retry, `ok` with `already: true`, so a redelivered
 * move writes nothing and still lands its ledger event once.
 */
export function admitMove<T extends ArrangeTake & { readonly verdict: string }>(takes: readonly T[], declared: readonly string[], req: MoveRequest): Result<{ readonly patch: MovePatch; readonly already: boolean; readonly title: string }> {
  const take = takes.find((t) => t.id === req.id);
  if (take === undefined) return err("not-found", `no take ${req.id} in the sound store`);
  if (take.verdict !== "kept") return err("refused", `${take.title} is ${take.verdict}; only kept takes are arranged`);
  const kin = takes.filter((t) => t.kind === take.kind && t.verdict === "kept");
  const stacks = stackVersions(kin);
  const stack = stacks.find((s) => s.versions.some((v) => v.id === take.id));
  if (stack === undefined) return err("internal", `take ${take.id} is in no stack`);
  if (stack.head.id !== take.id) return err("conflict", `${take.title} is no longer the card's head: v${stack.versions.length} was filed since`);
  const now = cellOf(stack);
  const label = trimmed(req.label);
  if (sameCell(now, req.to) && (label === null || label === trimmed(take.label))) return ok({ patch: { stage: req.to.stage, group: req.to.group }, already: true, title: take.title });
  if (!sameCell(now, req.from)) return err("conflict", `${take.title} moved since it was picked up: it is in ${cellWords(now)}`);
  const c = checkMove(stack, req.to, rowsFor(declared, stacks), label);
  return c.ok ? ok({ patch: c.patch, already: false, title: take.title }) : err(c.reason === "needs-label" ? "refused" : "invalid", REFUSAL_WORDS[c.reason]);
}

export type Dir = "left" | "right" | "up" | "down";

/** The neighbouring cell in a direction, or null at the board's edge. */
export function step(from: Cell, dir: Dir, rows: readonly Row[]): Cell | null {
  if (dir === "left" || dir === "right") {
    const stage = STAGES[STAGES.indexOf(from.stage) + (dir === "right" ? 1 : -1)];
    return stage === undefined ? null : { stage, group: from.group };
  }
  const row = rows[rows.findIndex((x) => x.name === from.group) + (dir === "down" ? 1 : -1)];
  return row === undefined ? null : { stage: from.stage, group: row.name };
}

/**
 * The card focus walks to from `at` in a direction: the nearest card in the next non-empty cell
 * that way (v1 Board.tsx's arrow walk), keeping the column (or row) when it can. Null at the edge.
 */
export function walk(board: ReadonlyMap<string, readonly Stack[]>, rows: readonly Row[], at: Cell, index: number, dir: Dir): { readonly cell: Cell; readonly index: number } | null {
  const here = board.get(cellKey(at)) ?? [];
  if (dir === "down" && index + 1 < here.length) return { cell: at, index: index + 1 };
  if (dir === "up" && index > 0) return { cell: at, index: index - 1 };
  for (let c = step(at, dir, rows); c !== null; c = step(c, dir, rows)) {
    const list = board.get(cellKey(c)) ?? [];
    if (list.length > 0) return { cell: c, index: dir === "up" ? list.length - 1 : dir === "down" ? 0 : Math.min(index, list.length - 1) };
  }
  return null;
}

export const nextStage = (s: Stage): Stage | null => STAGES[STAGES.indexOf(s) + 1] ?? null;

/* ── words ─────────────────────────────────────────────────────────────── */

export const rowWord = (group: string | null): string => group ?? "ungrouped";
export const cellWords = (c: Cell): string => `${c.stage} · ${rowWord(c.group)}`;
/** The live region's sentence for a move - the work, said once. */
export const movedSentence = (title: string, to: Cell): string => `${title} → ${cellWords(to)}`;

const cap = (s: string): string => (s === "" ? s : `${s.slice(0, 1).toUpperCase()}${s.slice(1)}`);

/**
 * The library label offered at finalize: the row's group, then the take's strongest terms - two
 * moods and one instrument for music; for an effect its category, first mood and "loop" when it
 * is one. Case-folded duplicates are dropped ("Ambient · ambient" never). It only saves typing.
 */
export function suggestLabel(t: ArrangeTake, group: string | null): string {
  const lead = group ?? (t.kind === "sfx" ? t.terms.sfxCategory : t.terms.genre[0]) ?? t.title;
  const parts: string[] = [cap(lead.trim())];
  const add = (v: string | null | undefined): void => {
    const x = v?.trim() ?? "";
    if (x !== "" && !parts.some((p) => p.toLowerCase() === x.toLowerCase())) parts.push(x.toLowerCase());
  };
  if (t.kind === "sfx") {
    add(t.terms.sfxCategory);
    add(t.terms.mood[0]);
    if (t.loop === true) add("loop");
  } else {
    for (const m of t.terms.mood.slice(0, 2)) add(m);
    add(t.terms.instrument[0]);
  }
  return parts.slice(0, 4).join(" · ");
}

/** The line an agent runs to pick from a finalized row (pipeline/sound.mts `finalized`). */
export function agentLine(kind: ArrangeKind, group: string | null): string {
  const g = group === null ? "" : ` --group "${group.replace(/(["\\$`])/g, "\\$1")}"`;
  return `npx tsx pipeline/sound.mts finalized --kind ${kind}${g} --json`;
}
