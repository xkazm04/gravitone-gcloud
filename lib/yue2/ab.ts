import "server-only";

import { createHash, randomInt } from "node:crypto";

import { AB_QUEUE_EVENT, AB_VOTE_EVENT, AB_WINDOW_S, abQueueKey, abVoteKey, YUE2_RECIPE } from "@gt/domain/audio.yue2";
import type { AbPair, AbSide, AbSource, AbVote, SongScores, Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { parseAbPair, parseAbVote } from "@gt/domain/audio.yue2.schema";
import type { Actor } from "@gt/domain/event";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import { EVENT_COLUMNS, rowToEvent } from "@gt/kernel/events";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store, Tx } from "@gt/kernel/store";

import { readTakes } from "../sound/store.ts";
import { DEFECTS, type SoundTake } from "../sound/types.ts";
import {
  conditionKey,
  foldEarAgreement,
  foldJudgedPairs,
  foldWinRates,
  listAbTakes,
  readAbLedger,
  scoresByTake,
  songEvalMean,
  type AbFoldPorts,
  type AbTake,
  type EarAgreement,
  type FactsMap,
  type JudgedPair,
  type WinRate,
} from "./abFolds.ts";
import { allYue2Facts, readYue2Facts } from "./facts.ts";
import { readSongScores } from "./scores.ts";
import { takeSha } from "./sha.ts";

export { conditionKey, songEvalMean, type AbFoldPorts, type AbTake, type EarAgreement, type JudgedPair, type WinRate } from "./abFolds.ts";

// THE BLIND DESK'S LEDGER (spark yue2-song-lab, WP0 stub -> WP4). A pair is queued as an
// `audio.ab.queue` event and judged as an `audio.ab.vote` event (appendOnce, lane `audio`). The side
// map (which take plays as A) never leaves the server before the vote. A `neither` answer names a
// defect from lib/sound/types DEFECTS. best-of-n and across-conditions pair only takes that passed
// the lyric gate (YUE2_RECIPE.gateWer on the newest score).
//
// THE SIDE is drawn at queue time: a proposal's `side` is a placeholder the queue ignores, so a caller
// that saw the proposal (an agent over MCP) never learns which take plays as A. The same pair queued
// again is a no-op whoever queues it; the same key over other takes or another window is a conflict
// (the taste writer's rule, app/(studio)/audio/studio/_live/taste.ts).
//
// THE PORTS are injected (abDesk) so the desk is tested over fakes. The folds (judged pairs, win
// rates, ear agreement) live in ./abFolds.ts and are re-exported here.

/** A queued pair as the desk may show it BEFORE the vote: no side, no take ids. */
export type BlindArm = { readonly arm: "a" | "b"; readonly src: string };
export type PendingPair = {
  readonly pairId: string;
  readonly source: AbSource;
  readonly windowS: readonly [number, number];
  readonly arms: readonly [BlindArm, BlindArm];
  readonly queuedAt: string;
};

/** The folds' ports plus allFacts = facts.ts allYue2Facts (the lab's listing) and side = the draw. */
export type AbDeps<T extends AbTake = SoundTake> = AbFoldPorts<T> & {
  readonly allFacts: () => Promise<Result<FactsMap>>;
  readonly side: () => AbSide;
};

export const AB_LANE = "audio" as const;
const PAIR_SUBJECT = "ab-pair" as const;
const PLACEHOLDER_WINDOW: readonly [number, number] = [0, AB_WINDOW_S];
const DEFECT_SET: ReadonlySet<string> = new Set(DEFECTS);

const takeSet = (a: string, b: string): string => [a, b].sort().join("|");

/** The first 16 hex of sha1 over `source|sorted takes|start-end`: one pair, one id. */
export function abPairId(source: AbSource, takeA: string, takeB: string, windowS: readonly [number, number]): string {
  return createHash("sha1").update(`${source}|${takeSet(takeA, takeB)}|${windowS.join("-")}`).digest("hex").slice(0, 16);
}

/** The pair queued under `key`, read inside the vote's own transaction. */
function queuedIn(t: Tx, key: string): AbPair | undefined {
  const row = t.get(`SELECT ${EVENT_COLUMNS} FROM events WHERE key = ?`, key);
  const e = row === undefined ? undefined : rowToEvent(row);
  const p = e?.ok === true ? parseAbPair(e.value.data) : undefined;
  return p?.ok === true ? p.value : undefined;
}

type Lab = { readonly id: string; readonly facts: Yue2TakeFacts; readonly scores: SongScores | undefined };
type Proposal = { readonly cond: string; readonly takeA: string; readonly takeB: string };

const condOf = (t: Lab): string => conditionKey(t.facts.condition);
const meanOf = (t: Lab): number | undefined => (t.scores === undefined ? undefined : songEvalMean(t.scores));

/** Lyric-gated seeds (no post variant) with a SongEval mean, best first; a tie falls to the take id. */
function ranked(takes: readonly Lab[]): Lab[] {
  const gated = takes.filter((t) => t.facts.lineage.sourceTakeId === undefined && t.scores?.wer !== undefined && t.scores.wer <= YUE2_RECIPE.gateWer && meanOf(t) !== undefined);
  return gated.sort((a, b) => (meanOf(b) ?? 0) - (meanOf(a) ?? 0) || a.id.localeCompare(b.id));
}

function groupBy(takes: readonly Lab[], keyOf: (t: Lab) => string): Map<string, Lab[]> {
  const out = new Map<string, Lab[]>();
  for (const t of takes) out.set(keyOf(t), [...(out.get(keyOf(t)) ?? []), t]);
  return out;
}

function candidates(source: AbSource, lab: readonly Lab[]): Proposal[] {
  const byId = new Map(lab.map((t) => [t.id, t]));
  const out: Proposal[] = [];
  if (source === "post-variant") {
    for (const t of lab) {
      const from = t.facts.lineage.sourceTakeId === undefined ? undefined : byId.get(t.facts.lineage.sourceTakeId);
      if (from !== undefined && t.scores !== undefined && from.scores !== undefined) out.push({ cond: condOf(from), takeA: from.id, takeB: t.id });
    }
  } else if (source === "best-of-n") {
    for (const group of groupBy(lab, (t) => `${t.facts.lyricsDigest} ${condOf(t)}`).values()) {
      const [best, ...rest] = ranked(group);
      if (best !== undefined) for (const other of rest.slice(0, 2)) out.push({ cond: condOf(best), takeA: best.id, takeB: other.id });
    }
  } else {
    for (const sheet of groupBy(lab, (t) => t.facts.lyricsDigest).values()) {
      const bests = [...groupBy(ranked(sheet), condOf).values()].flatMap((ts) => ts.slice(0, 1)).sort((a, b) => condOf(a).localeCompare(condOf(b)));
      bests.forEach((x, i) => {
        for (const y of bests.slice(i + 1)) out.push({ cond: condOf(x), takeA: x.id, takeB: y.id });
      });
    }
  }
  return out.sort((a, b) => a.cond.localeCompare(b.cond) || a.takeA.localeCompare(b.takeA) || a.takeB.localeCompare(b.takeB));
}

/** The desk over its ports; the exported functions below are this desk over the real ones. */
export function abDesk<T extends AbTake>(deps: AbDeps<T>) {
  async function proposePairs(store: Store, source: AbSource, limit: number): Promise<Result<readonly AbPair[]>> {
    // A knockout pair is a match of a draw (lib/yue2/draw.ts bookNext); every other read treats it like any pair.
    if (source === "knockout") return err("invalid", "knockout pairs are booked by a draw");
    if (!Number.isInteger(limit) || limit < 0) return err("invalid", `yue2: a proposal limit is a whole number, not ${limit}`);
    const facts = await deps.allFacts();
    if (!facts.ok) return facts;
    const listed = await listAbTakes(deps);
    if (!listed.ok) return listed;
    const takes = listed.value.filter((t) => t.file !== null && t.use !== "reference" && facts.value[t.id] !== undefined);
    const scores = await scoresByTake(deps, store, takes);
    if (!scores.ok) return scores;
    const ledger = readAbLedger(store);
    if (!ledger.ok) return ledger;
    const queued = new Set(ledger.value.queued.map((q) => takeSet(q.pair.takeA, q.pair.takeB)));
    const lab = takes.flatMap(({ id }): Lab[] => {
      const f = facts.value[id];
      return f === undefined ? [] : [{ id, facts: f, scores: scores.value.get(id) }];
    });
    const out: AbPair[] = [];
    for (const c of candidates(source, lab)) {
      if (out.length >= limit) break;
      if (queued.has(takeSet(c.takeA, c.takeB))) continue;
      queued.add(takeSet(c.takeA, c.takeB));
      const pair = parseAbPair({ pairId: abPairId(source, c.takeA, c.takeB, PLACEHOLDER_WINDOW), source, takeA: c.takeA, takeB: c.takeB, windowS: [...PLACEHOLDER_WINDOW], side: "ab" });
      if (!pair.ok) return pair;
      out.push(pair.value);
    }
    return ok(out);
  }

  function queuePairs(store: Store, pairs: readonly AbPair[], actor: Actor, at: string): Result<readonly string[]> {
    void at; // the event's instant is the store transaction's own
    const parsed: AbPair[] = [];
    for (const input of pairs) {
      const p = parseAbPair({ ...input, side: deps.side() });
      if (!p.ok) return p;
      const want = abPairId(p.value.source, p.value.takeA, p.value.takeB, p.value.windowS);
      if (p.value.pairId !== want) return err("invalid", `yue2: pair ${p.value.pairId} is not the id of its takes, source and window (${want})`);
      parsed.push(p.value);
    }
    return store.tx((t) =>
      parsed.map((pair) => {
        const key = abQueueKey(pair.pairId);
        const data = { ...pair, windowS: [...pair.windowS] };
        const a = appendOnce(t, { actor, type: AB_QUEUE_EVENT, lane: AB_LANE, key, subject: { kind: PAIR_SUBJECT, id: pair.pairId }, data });
        if (a.same) return pair.pairId;
        const held = parseAbPair(a.event.data);
        const sameWords = held.ok && held.value.source === pair.source && takeSet(held.value.takeA, held.value.takeB) === takeSet(pair.takeA, pair.takeB) && held.value.windowS.join("-") === pair.windowS.join("-");
        if (!sameWords) throw new AppError("conflict", `${AB_QUEUE_EVENT}: ${key} is already in the ledger with other words`);
        return pair.pairId;
      }),
    );
  }

  function voteAb(store: Store, vote: AbVote, actor: Actor, at: string): Result<JudgedPair> {
    void at; // the event's instant is the store transaction's own
    const v = parseAbVote(vote);
    if (!v.ok) return v;
    if (v.value.defect !== undefined && !DEFECT_SET.has(v.value.defect)) return err("invalid", `yue2: "${v.value.defect}" is not a defect in the taxonomy`);
    return store.tx((t) => {
      const pair = queuedIn(t, abQueueKey(v.value.pairId));
      if (pair === undefined) throw new AppError("not-found", `yue2: no queued pair ${v.value.pairId}`);
      const key = abVoteKey(v.value.pairId);
      const data = { ...v.value, answers: { ...v.value.answers } };
      const a = appendOnce(t, { actor, type: AB_VOTE_EVENT, lane: AB_LANE, key, subject: { kind: PAIR_SUBJECT, id: v.value.pairId }, data });
      if (!a.same) throw new AppError("conflict", `${AB_VOTE_EVENT}: ${key} is already in the ledger with other words`);
      const held = parseAbVote(a.event.data);
      if (!held.ok) throw held.error;
      return { pair, vote: held.value, votedAt: a.event.at };
    });
  }

  function pendingPairs(store: Store): Result<readonly PendingPair[]> {
    const l = readAbLedger(store);
    if (!l.ok) return l;
    const arm = (pairId: string, a: "a" | "b"): BlindArm => ({ arm: a, src: `/api/sound/ab/${pairId}/${a}` });
    const pending = l.value.queued.filter((q) => !l.value.votes.has(q.pair.pairId));
    return ok(
      pending.map(({ pair, at }) => ({
        pairId: pair.pairId,
        source: pair.source,
        windowS: [pair.windowS[0], pair.windowS[1]] as const,
        arms: [arm(pair.pairId, "a"), arm(pair.pairId, "b")] as const,
        queuedAt: at,
      })),
    );
  }

  return {
    proposePairs,
    queuePairs,
    voteAb,
    pendingPairs,
    judgedPairs: (store: Store): Result<readonly JudgedPair[]> => foldJudgedPairs(store),
    winRates: (store: Store): Promise<Result<readonly WinRate[]>> => foldWinRates(deps, store),
    earAgreement: (store: Store): Promise<Result<readonly EarAgreement[]>> => foldEarAgreement(deps, store),
  };
}

const desk = abDesk<SoundTake>({
  allFacts: allYue2Facts,
  facts: readYue2Facts,
  takes: async () => (await readTakes()).takes,
  sha: takeSha,
  scores: readSongScores,
  side: () => (randomInt(2) === 0 ? "ab" : "ba"),
});

/** Propose pairs of one source from the lab's current takes (no write). */
export async function proposePairs(store: Store, source: AbSource, limit: number): Promise<Result<readonly AbPair[]>> {
  return desk.proposePairs(store, source, limit);
}

/** Queue pairs (one `audio.ab.queue` event each; re-queueing the same pair is a no-op). */
export function queuePairs(store: Store, pairs: readonly AbPair[], actor: Actor, at: string): Result<readonly string[]> {
  return desk.queuePairs(store, pairs, actor, at);
}

/** Record a vote (refused without a defect on `neither`; another vote on a judged pair is a conflict). */
export function voteAb(store: Store, vote: AbVote, actor: Actor, at: string): Result<JudgedPair> {
  return desk.voteAb(store, vote, actor, at);
}

export function pendingPairs(store: Store): Result<readonly PendingPair[]> {
  return desk.pendingPairs(store);
}

export function judgedPairs(store: Store): Result<readonly JudgedPair[]> {
  return desk.judgedPairs(store);
}

/** Wins per condition key (e.g. `cot=off cfg=1.5`) over every judged pair, on the `release` question. */
export async function winRates(store: Store): Promise<Result<readonly WinRate[]>> {
  return desk.winRates(store);
}

/** For each score metric: how often the arm that scored higher was the one the owner chose. */
export async function earAgreement(store: Store): Promise<Result<readonly EarAgreement[]>> {
  return desk.earAgreement(store);
}
