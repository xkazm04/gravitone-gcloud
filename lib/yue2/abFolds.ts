import "server-only";

import { AB_QUEUE_EVENT, AB_VOTE_EVENT } from "@gt/domain/audio.yue2";
import type { AbPair, AbVote, SongScores, Yue2Condition, Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { parseAbPair, parseAbVote } from "@gt/domain/audio.yue2.schema";
import type { Event } from "@gt/domain/event";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import type { Store } from "@gt/kernel/store";

// THE BLIND DESK'S FOLDS (spark yue2-song-lab WP4): the `audio.ab.*` ledger read back - every queued
// pair and vote through its door - and the judged pairs folded into win rates per condition and the
// ear's agreement with each score metric. Split out of ./ab.ts (the writes and the proposals), which
// re-exports every name here. The ports are injected (./ab.ts abDesk) so the folds run over fakes:
// the facts are lib/yue2/facts.ts's, a take's sha is lib/yue2/sha.ts takeSha (sha256 of the stored
// bytes, the key yue2-score writes scores under), the scores are lib/yue2/scores.ts's.

/** A judged pair, revealed. */
export type JudgedPair = { readonly pair: AbPair; readonly vote: AbVote; readonly votedAt: string };

export type WinRate = { readonly condition: string; readonly votes: number; readonly wins: number };
export type EarAgreement = { readonly metric: string; readonly votes: number; readonly agreed: number };

export type FactsMap = Readonly<Record<string, Yue2TakeFacts>>;

/** What the desk needs of a listed take: it exists, has bytes, and is not a reference upload. */
export type AbTake = { readonly id: string; readonly file: unknown; readonly use?: string | null | undefined };

/** The folds' ports: facts = facts.ts readYue2Facts, takes = the sound store's listing, sha = sha.ts
 *  takeSha, scores = scores.ts readSongScores. */
export type AbFoldPorts<T extends AbTake> = {
  readonly facts: (takeIds: readonly string[]) => Promise<Result<FactsMap>>;
  readonly takes: () => Promise<readonly T[]>;
  readonly sha: (take: T) => Promise<Result<string>>;
  readonly scores: (store: Store, shas: readonly string[]) => Result<Readonly<Record<string, SongScores>>>;
};

/** `cot=off cfg=1.5`, `cot=full cfg=def`, `cot=off cfg=1.5 lora-a@0.8`. */
export function conditionKey(c: Yue2Condition): string {
  const base = `cot=${c.cot} cfg=${c.cfg ?? "def"}`;
  return c.adapter === undefined ? base : `${base} ${c.adapter}@${c.adapterStrength ?? "def"}`;
}

/** The mean of SongEval's five dimensions; absent when SongEval was not computed. */
export function songEvalMean(s: SongScores): number | undefined {
  const e = s.songEval;
  return e === undefined ? undefined : (e.coherence + e.musicality + e.memorability + e.clarity + e.naturalness) / 5;
}

function eventsOf(store: Store, type: string): Result<readonly Event[]> {
  const out: Event[] = [];
  let after: number | undefined;
  for (;;) {
    const page = queryEvents(store, { type: [type], by: "seq", order: "asc", limit: 1000, ...(after === undefined ? {} : { after }) });
    if (!page.ok) return page;
    out.push(...page.value.events);
    if (!page.value.capped || page.value.next === undefined) return ok(out);
    after = page.value.next;
  }
}

export type AbLedger = {
  readonly queued: readonly { readonly pair: AbPair; readonly at: string }[];
  readonly votes: ReadonlyMap<string, { readonly vote: AbVote; readonly at: string }>;
};

/** Every queued pair and every vote, each through its door; an event its door refuses is not folded. */
export function readAbLedger(store: Store): Result<AbLedger> {
  const q = eventsOf(store, AB_QUEUE_EVENT);
  if (!q.ok) return q;
  const v = eventsOf(store, AB_VOTE_EVENT);
  if (!v.ok) return v;
  const queued = q.value.flatMap((e) => {
    const p = parseAbPair(e.data);
    return p.ok ? [{ pair: p.value, at: e.at }] : [];
  });
  const votes = new Map<string, { vote: AbVote; at: string }>();
  for (const e of v.value) {
    const p = parseAbVote(e.data);
    if (p.ok && !votes.has(p.value.pairId)) votes.set(p.value.pairId, { vote: p.value, at: e.at });
  }
  return ok({ queued, votes });
}

/** The listing, a throw answered as `unavailable`. */
export async function listAbTakes<T extends AbTake>(ports: AbFoldPorts<T>): Promise<Result<readonly T[]>> {
  return ports.takes().then(ok, (e: unknown) => err<readonly T[]>("unavailable", `sound store: ${errorMessage(e)}`));
}

/** The newest scores of the given takes by their bytes' sha. A take whose bytes cannot be read, or that
 *  was never scored, is absent (it reads as unscored, never as a failure of the whole read). */
export async function scoresByTake<T extends AbTake>(ports: AbFoldPorts<T>, store: Store, takes: readonly T[]): Promise<Result<ReadonlyMap<string, SongScores>>> {
  const shas = await Promise.all(takes.map(async (t) => ({ id: t.id, sha: await ports.sha(t) })));
  const known = shas.flatMap((s) => (s.sha.ok ? [{ id: s.id, sha: s.sha.value }] : []));
  const rows = ports.scores(store, [...new Set(known.map((k) => k.sha))]);
  if (!rows.ok) return rows;
  const out = new Map<string, SongScores>();
  for (const k of known) {
    const row = rows.value[k.sha];
    if (row !== undefined) out.set(k.id, row);
  }
  return ok(out);
}

/** The take an arm plays: side `ab` = takeA is arm A. */
const takeOf = (p: AbPair, arm: "a" | "b"): string => ((arm === "a") === (p.side === "ab") ? p.takeA : p.takeB);

/** The take the `release` answer chose; undefined for `neither`. */
const releaseWinner = (j: JudgedPair): string | undefined => (j.vote.answers.release === "neither" ? undefined : takeOf(j.pair, j.vote.answers.release));

type Metric = { readonly name: string; readonly of: (s: SongScores) => number | undefined; readonly lowerIsBetter: boolean };
const METRICS: readonly Metric[] = [
  { name: "wer", of: (s) => s.wer, lowerIsBetter: true },
  { name: "songEval", of: songEvalMean, lowerIsBetter: false },
  { name: "aesthetics.ce", of: (s) => s.aesthetics?.ce, lowerIsBetter: false },
  { name: "buzzIdx", of: (s) => s.buzzIdx, lowerIsBetter: true },
];

/** Every voted pair, revealed, in vote order. */
export function foldJudgedPairs(store: Store): Result<readonly JudgedPair[]> {
  const l = readAbLedger(store);
  if (!l.ok) return l;
  const out = l.value.queued.flatMap(({ pair }): JudgedPair[] => {
    const v = l.value.votes.get(pair.pairId);
    return v === undefined ? [] : [{ pair, vote: v.vote, votedAt: v.at }];
  });
  return ok(out.sort((a, b) => a.votedAt.localeCompare(b.votedAt) || a.pair.pairId.localeCompare(b.pair.pairId)));
}

const takeIdsOf = (judged: readonly JudgedPair[]): string[] => [...new Set(judged.flatMap((j) => [j.pair.takeA, j.pair.takeB]))];

/** A judged pair is one vote for each distinct condition its arms carry, and a win for the one the release answer chose. */
export async function foldWinRates<T extends AbTake>(ports: AbFoldPorts<T>, store: Store): Promise<Result<readonly WinRate[]>> {
  const judged = foldJudgedPairs(store);
  if (!judged.ok) return judged;
  const facts = await ports.facts(takeIdsOf(judged.value));
  if (!facts.ok) return facts;
  const cond = (take: string | undefined): string | undefined => {
    const f = take === undefined ? undefined : facts.value[take];
    return f === undefined ? undefined : conditionKey(f.condition);
  };
  const tally = new Map<string, { votes: number; wins: number }>();
  for (const j of judged.value) {
    const won = cond(releaseWinner(j));
    for (const c of new Set([cond(j.pair.takeA), cond(j.pair.takeB)])) {
      if (c === undefined) continue;
      const row = tally.get(c) ?? { votes: 0, wins: 0 };
      tally.set(c, { votes: row.votes + 1, wins: row.wins + (won === c ? 1 : 0) });
    }
  }
  return ok([...tally].sort(([a], [b]) => a.localeCompare(b)).map(([condition, r]) => ({ condition, ...r })));
}

/** A vote counts for a metric when both arms carry it and the release answer chose an arm; a tie is never agreed. */
export async function foldEarAgreement<T extends AbTake>(ports: AbFoldPorts<T>, store: Store): Promise<Result<readonly EarAgreement[]>> {
  const judged = foldJudgedPairs(store);
  if (!judged.ok) return judged;
  const listed = await listAbTakes(ports);
  if (!listed.ok) return listed;
  const wanted = new Set(takeIdsOf(judged.value));
  const scores = await scoresByTake(ports, store, listed.value.filter((t) => wanted.has(t.id)));
  if (!scores.ok) return scores;
  const valueOf = (m: Metric, take: string): number | undefined => {
    const s = scores.value.get(take);
    return s === undefined ? undefined : m.of(s);
  };
  return ok(
    METRICS.map((m) => {
      let votes = 0;
      let agreed = 0;
      for (const j of judged.value) {
        const winner = releaseWinner(j);
        const a = valueOf(m, j.pair.takeA);
        const b = valueOf(m, j.pair.takeB);
        if (winner === undefined || a === undefined || b === undefined) continue;
        votes++;
        if (a !== b && winner === ((a < b) === m.lowerIsBetter ? j.pair.takeA : j.pair.takeB)) agreed++;
      }
      return { metric: m.name, votes, agreed };
    }),
  );
}
