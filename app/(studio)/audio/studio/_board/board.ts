// THE TAKES BOARD'S ARRANGEMENT (spark suno-advisor S1, composition c), pure so it is tested without a
// DOM. The one fold (../_host/suno.ts sunoVersions) arranged as a board: one row per generation, newest
// at the top, each row a prompt and its three columns - the local sketch, take a, take b. A take lands
// in the column its clip names (the verdict's or the facts'); a take that names no clip fills the first
// empty column, and anything past two is the row's `extra`. A verdict shows in the column it is about,
// `both` in both. The taste strip's proposals come from every `taste` piece shown, newest wording of a
// line wins, and each keeps the turn that proposed it (keepTaste records it).
import type { StudioTakeFacts, StudioTasteLine, TasteLean } from "@gt/domain/audio.suno";

import type { SunoVerdict, SunoVersion } from "../_host/suno.ts";
import type { ParsedTurn } from "../_host/types.ts";

export const CLIPS = ["a", "b"] as const;
export type Clip = (typeof CLIPS)[number];

export type PlacedTake = { readonly takeId: string; readonly turnId: string; readonly facts?: StudioTakeFacts };

export type TakeSlot = {
  readonly clip: Clip;
  readonly take?: PlacedTake;
  /** The verdicts about this clip (its own and `both`), oldest first. */
  readonly verdicts: readonly SunoVerdict[];
};

export type BoardRow = {
  /** The generation's number, 1 for the first version shown. */
  readonly n: number;
  readonly version: SunoVersion;
  readonly slots: readonly [TakeSlot, TakeSlot];
  /** Takes past the two columns (a third upload, or a second for a clip already filled). */
  readonly extra: readonly PlacedTake[];
  /** The versions made from this one (their `parent` is this promptId), in the order shown. */
  readonly children: readonly string[];
  /** The newest verdict's keep/drop on this version; undefined when no verdict decided either. */
  readonly kept?: boolean;
};

/** Every version as a board row, newest first. */
export function boardRows(versions: readonly SunoVersion[], facts: Readonly<Record<string, StudioTakeFacts>>): readonly BoardRow[] {
  const rows = versions.map((version, i): BoardRow => {
    const slot: Partial<Record<Clip, PlacedTake>> = {};
    const loose: PlacedTake[] = [];
    const extra: PlacedTake[] = [];
    for (const t of version.takes) {
      const f = facts[t.takeId];
      const placed: PlacedTake = { takeId: t.takeId, turnId: t.turnId, ...(f !== undefined ? { facts: f } : {}) };
      const clip = t.clip ?? f?.clip;
      if (clip === undefined) loose.push(placed);
      else if (slot[clip] === undefined) slot[clip] = placed;
      else extra.push(placed);
    }
    for (const t of loose) {
      const free = CLIPS.find((c) => slot[c] === undefined);
      if (free === undefined) extra.push(t);
      else slot[free] = t;
    }
    const about = (c: Clip): readonly SunoVerdict[] => version.verdicts.filter((v) => v.verdict.clip === c || v.verdict.clip === "both");
    const at = (c: Clip): TakeSlot => {
      const take = slot[c];
      return { clip: c, ...(take !== undefined ? { take } : {}), verdicts: about(c) };
    };
    const decided = [...version.verdicts].reverse().find((v) => v.verdict.keep !== undefined);
    return {
      n: i + 1,
      version,
      slots: [at("a"), at("b")],
      extra,
      children: versions.filter((o) => o.node.parent === version.promptId).map((o) => o.promptId),
      ...(decided?.verdict.keep !== undefined ? { kept: decided.verdict.keep } : {}),
    };
  });
  return rows.reverse();
}

/** The fields a version changed against its parent, each once, with how many changes touched it, in the order first changed. */
export function changedFields(version: SunoVersion): readonly { readonly field: string; readonly n: number }[] {
  const out: { field: string; n: number }[] = [];
  for (const c of version.node.changes ?? []) {
    const had = out.find((x) => x.field === c.field);
    if (had === undefined) out.push({ field: c.field, n: 1 });
    else had.n += 1;
  }
  return out;
}

/** The style prompt's first line, trimmed (a style is usually one line; lyrics never show here). */
export const styleHead = (style: string): string => (style.split(/\r?\n/).find((l) => l.trim() !== "") ?? "").trim();

export type Proposal = { readonly id: string; readonly line: string; readonly lean: TasteLean; readonly turnId: string };

const norm = (line: string): string => line.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Every taste line proposed in the conversation and not already kept, newest proposal first; a line
 * proposed twice (any case) is one proposal, with the newest wording and turn. Ids are made unique
 * across turns (`<turnId>:<row id>`): two turns may both call a row `t1`.
 */
export function openProposals(turns: readonly ParsedTurn[], kept: readonly StudioTasteLine[]): readonly Proposal[] {
  const keptLines = new Set(kept.map((k) => norm(k.line)));
  const seen = new Set<string>();
  const out: Proposal[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]?.turn;
    if (turn === undefined || turn.from !== "agent") continue;
    for (const node of turn.show) {
      if (node.kind !== "taste") continue;
      for (const r of node.rows) {
        const k = norm(r.line);
        if (k === "" || seen.has(k) || keptLines.has(k)) continue;
        seen.add(k);
        out.push({ id: `${turn.id}:${r.id}`, line: r.line, lean: r.lean, turnId: turn.id });
      }
    }
  }
  return out;
}

/** The turn that proposed a line (for keepTaste's record); undefined when no shown proposal has it. */
export const proposedIn = (proposals: readonly Proposal[], line: string): string | undefined => proposals.find((p) => norm(p.line) === norm(line))?.turnId;

/** A generation row's element id (the board scrolls a new one into view). */
export const rowId = (promptId: string): string => `board-row-${promptId}`;

/** The transport key a take's own audio plays under (not a turn's piece: a take may have no track node). */
export const takeSoundKey = (takeId: string): string => `suno-take/${takeId}`;
