// THE PROMPT SHEET'S ARITHMETIC (spark suno-advisor S1, composition b), pure so it is tested without a
// DOM. The sheet pins ONE prompt version and arranges what the thread's one fold (../_host/suno.ts
// `sunoVersions`) already holds around it; nothing here re-derives a version, a verdict or a take:
//   pinnedOf      which version is pinned - the person's pick, until the conversation moves on
//   sketchOf      the sketch that speaks for a version: its own, else the nearest ancestor's (a tweak
//                 after a verdict comes without a sketch; the direction it tweaks has one)
//   changedFields the fields a version changed against its parent, each once, in Suno's form order
//   verdictMark   a verdict as a mark: which take, keep / drop, the axes said to be off
//   takeTrack     the agent's track that plays an uploaded take (`answers.as: "suno"`), when there is one
//   takeMeasures  the newest measures piece a turn showed for a take
//   tasteRows     every taste line proposed in the conversation, each once (the newest proposal of a
//                 line wins), with the turn that proposed it - a keep is filed against that turn
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { SUNO_FIELDS, type SunoField, type TasteLean } from "@gt/domain/audio.suno";

import type { SunoVerdict, SunoVersion } from "../_host/suno.ts";
import type { ParsedTurn } from "../_host/types.ts";

/** The person's pick in the rail, with how many turns the conversation had when they picked. */
export type SheetPick = { readonly promptId: string; readonly seen: number };

/**
 * The pinned version: the pick while the conversation holds the turns it had then, else the newest
 * (a verdict sent or an answer landed speaks for the newest version, as the dock's verdict row does);
 * null when there is no version.
 */
export function pinnedOf(versions: readonly SunoVersion[], pick: SheetPick | null, turns: number): SunoVersion | null {
  const newest = versions[versions.length - 1] ?? null;
  if (pick === null || turns > pick.seen) return newest;
  return versions.find((v) => v.promptId === pick.promptId) ?? newest;
}

export type SheetSketch = { readonly sketch: NonNullable<SunoVersion["sketch"]>; readonly from?: string };

/** A version's sketch, or the nearest ancestor's with `from` naming it; null when no version in the line has one. */
export function sketchOf(versions: readonly SunoVersion[], promptId: string): SheetSketch | null {
  const by = new Map(versions.map((v) => [v.promptId, v]));
  const walked = new Set<string>();
  let at = by.get(promptId);
  while (at !== undefined && !walked.has(at.promptId)) {
    walked.add(at.promptId);
    if (at.sketch !== undefined) return at.promptId === promptId ? { sketch: at.sketch } : { sketch: at.sketch, from: at.promptId };
    at = at.node.parent === undefined ? undefined : by.get(at.node.parent);
  }
  return null;
}

export type FieldChange = { readonly field: SunoField; readonly n: number };

/** The fields a version changed, each once with how many changes touched it, in Suno's form order. */
export function changedFields(node: StudioNodeOf<"suno_prompt">): readonly FieldChange[] {
  const n = new Map<SunoField, number>();
  for (const c of node.changes ?? []) n.set(c.field, (n.get(c.field) ?? 0) + 1);
  return SUNO_FIELDS.flatMap((field) => {
    const k = n.get(field);
    return k === undefined ? [] : [{ field, n: k }];
  });
}

export type VerdictMark = { readonly take: string; readonly call: "keep" | "drop" | null; readonly off: readonly string[] };

/** A verdict as a mark: "take a" / "both takes", keep or drop (null when undecided), the off axes. */
export function verdictMark(v: SunoVerdict): VerdictMark {
  const take = v.verdict.clip === "both" ? "both takes" : `take ${v.verdict.clip}`;
  const call = v.verdict.keep === undefined ? null : v.verdict.keep ? "keep" : "drop";
  return { take, call, off: v.verdict.off ?? [] };
}

/** The verdict that stands for a version in the rail: its newest; null before one. */
export const lastVerdict = (v: SunoVersion): SunoVerdict | null => v.verdicts[v.verdicts.length - 1] ?? null;

/** The newest agent track that plays this uploaded take, with its turn. */
export function takeTrack(turns: readonly ParsedTurn[], takeId: string): { readonly turnId: string; readonly node: StudioNodeOf<"track"> } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    if (t === undefined || t.from !== "agent") continue;
    const n = t.show.find((x): x is StudioNodeOf<"track"> => x.kind === "track" && x.takeId === takeId && x.answers?.as === "suno");
    if (n !== undefined) return { turnId: t.id, node: n };
  }
  return null;
}

/** The newest measures piece about this take. */
export function takeMeasures(turns: readonly ParsedTurn[], takeId: string): StudioNodeOf<"measures"> | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    if (t === undefined || t.from !== "agent") continue;
    const n = t.show.find((x): x is StudioNodeOf<"measures"> => x.kind === "measures" && x.takeId === takeId);
    if (n !== undefined) return n;
  }
  return null;
}

export type SheetTasteRow = { readonly id: string; readonly line: string; readonly lean: TasteLean; readonly turnId: string };

const norm = (line: string): string => line.trim().toLowerCase();

/** Every proposed taste line, each once by its lower-cased words (the newest proposal wins), first-proposed order. */
export function tasteRows(turns: readonly ParsedTurn[]): readonly SheetTasteRow[] {
  const order: string[] = [];
  const by = new Map<string, SheetTasteRow>();
  for (const { turn } of turns) {
    if (turn.from !== "agent") continue;
    for (const n of turn.show) {
      if (n.kind !== "taste") continue;
      for (const r of n.rows) {
        const k = norm(r.line);
        if (k === "") continue;
        if (!by.has(k)) order.push(k);
        by.set(k, { id: `${turn.id}:${r.id}`, line: r.line, lean: r.lean, turnId: turn.id });
      }
    }
  }
  return order.flatMap((k) => {
    const r = by.get(k);
    return r === undefined ? [] : [r];
  });
}

/** The turn a taste line was proposed in (a keep is filed against it); undefined when not proposed here. */
export function tasteTurn(rows: readonly SheetTasteRow[], line: string): string | undefined {
  return rows.find((r) => norm(r.line) === norm(line))?.turnId;
}
