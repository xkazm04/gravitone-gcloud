// THE CHECKLIST'S ITEM (prototype dock-package, round 2, variant "checklist"): a step is a short list of items - a
// field group with one preview of its value and ONE mark - and everything a row shows is derived from the release,
// its problems and the agent's pending proposals each render, never stored. A proposal belongs to every item whose
// value it would change: the page applies it to a copy (`applyLocal`, the same zod-free copy the session accepts
// with) and compares the item's fields before and after, so a suggestion lands where it would land.
import type { Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { applyLocal } from "../../../../../_release/applyLocal.ts";

/** One mark per row, one per rail step: what the item asks of the person, in this order. */
export type Mark = "need" | "agent" | "todo" | "warn" | "done" | "idle";
export const MARK_RANK: Readonly<Record<Mark, number>> = { need: 0, agent: 1, todo: 2, warn: 3, done: 4, idle: 5 };
/** The accessible word for each mark (the mark itself is a shape and a colour). */
export const MARK_WORD: Readonly<Record<Mark, string>> = { need: "needs you", agent: "agent suggests", todo: "ready for you", warn: "warning", done: "done", idle: "not set" };
/** A mark that makes its row the step's lead when it is the first such row. */
export const LEADS: ReadonlySet<Mark> = new Set<Mark>(["need", "agent", "todo"]);

export type EditorKey =
  | "title" | "artist" | "genre" | "date" | "songwriters" | "credits" | "lyrics"
  | "ai" | "persona" | "licence" | "tier" | "generator" | "provenance"
  | "track" | "shelf" | "sleeve" | "prompt" | "channel" | "stores" | "previews" | "splits"
  | "blocks" | "warnings" | "suggestions" | "slots" | "schedule";

/** What the lead row's one visible action does. */
export type LeadAct = "accept" | "open" | "go" | "schedule" | "pick";

export interface Item {
  readonly id: string;
  readonly label: string;
  /** The value in one short preview; a blank is "—". */
  readonly value: string;
  readonly mark: Mark;
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  /** The preview with the item's pending proposals accepted. */
  readonly suggested: string | null;
  readonly editor: EditorKey;
  /** Edited one track at a time: the dialog picks the track. */
  readonly perTrack: boolean;
  /** A row that IS one track or one channel. */
  readonly track: number | null;
  readonly ref: string | null;
  readonly act: LeadAct;
  readonly verb: string;
}

export const BLANK = "—";

/** One item's definition: which fields it reads, how it previews them, which problem codes are its own. */
export interface ItemDef {
  readonly id: string;
  readonly label: string;
  readonly editor: EditorKey;
  readonly codes: readonly ProblemCode[];
  /** Release-level, every track, or one track (its index). */
  readonly scope: "release" | "tracks" | number;
  /** The item's fields, compared before and after a proposal. `i` is the track index (-1 at release scope). */
  readonly pick: (r: Release, i: number) => unknown;
  readonly show: (r: Release, i: number) => string;
  readonly verb?: string;
}

const indicesOf = (def: ItemDef, r: Release): readonly number[] => (def.scope === "release" ? [-1] : def.scope === "tracks" ? r.tracks.map((_, i) => i) : [def.scope]);

/** Several tracks' previews as one: the value when they agree, else the commonest value and how many others. */
export function aggregate(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (top === undefined) return BLANK;
  return ranked.length === 1 ? top[0] : `${top[0]} +${ranked.length - 1}`;
}

function ownProblem(def: ItemDef, p: ReleaseProblem, idx: readonly number[]): boolean {
  if (!def.codes.includes(p.code)) return false;
  if (def.scope === "release") return !p.at.startsWith("track:");
  return idx.some((i) => p.at === `track:${i + 1}`);
}

export function markOf(problems: readonly ReleaseProblem[], pending: number, value: string): Mark {
  if (problems.some((p) => p.severity === "block")) return "need";
  if (pending > 0) return "agent";
  if (problems.length > 0) return "warn";
  return value === BLANK ? "idle" : "done";
}

export function buildItem(def: ItemDef, r: Release, problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[]): Item {
  const idx = indicesOf(def, r);
  const key = (x: Release) => JSON.stringify(idx.map((i) => def.pick(x, i)));
  const view = (x: Release) => aggregate(idx.map((i) => def.show(x, i)));
  const before = key(r);
  const mine = pending.filter((p) => {
    const after = applyLocal(r, p.path, p.value);
    return after !== null && after.tracks.length === r.tracks.length && key(after) !== before;
  });
  const accepted = mine.reduce<Release>((x, p) => applyLocal(x, p.path, p.value) ?? x, r);
  const own = problems.filter((p) => ownProblem(def, p, idx));
  const value = view(r);
  const mark = markOf(own, mine.length, value);
  return {
    id: def.id,
    label: def.label,
    value,
    mark,
    problems: own,
    pending: mine,
    suggested: mine.length === 0 ? null : view(accepted),
    editor: def.editor,
    perTrack: def.scope === "tracks",
    track: typeof def.scope === "number" ? def.scope : null,
    ref: null,
    act: mine.length > 0 ? "accept" : "open",
    verb: def.verb ?? "Fix",
  };
}

/** The rows in the order the person meets them: what needs them first, quiet rows last; stable within a mark. */
export const sorted = (items: readonly Item[]): Item[] => items.map((it, i) => ({ it, i })).sort((a, b) => MARK_RANK[a.it.mark] - MARK_RANK[b.it.mark] || a.i - b.i).map((x) => x.it);

/** The step's lead: the first row that asks something of the person, or none. */
export const leadOf = (rows: readonly Item[]): Item | null => rows.find((x) => LEADS.has(x.mark)) ?? null;

/** A step's one rail mark: its worst row; a clean step the person has not opened is not started. */
export function stepMark(items: readonly Item[], seen: boolean): Mark {
  const worst = items.reduce<Mark>((m, x) => (MARK_RANK[x.mark] < MARK_RANK[m] ? x.mark : m), "idle");
  if (worst === "need" || worst === "agent" || worst === "warn" || worst === "todo") return worst;
  return seen ? "done" : "idle";
}
