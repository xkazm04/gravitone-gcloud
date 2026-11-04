import "server-only";

import { createHash } from "node:crypto";

import { AB_WINDOW_S, YUE2_RECIPE, type AbPair, type SongScores, type Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { AB_DRAW_EVENT, abDrawKey, DRAW_ROUNDS, DRAW_SUBJECT_KIND, type Draw, type DrawEntrant, type DrawField, type DrawSize, type LabMetric, type LabRule, type Match } from "@gt/domain/audio.yue2.lab";
import { parseDraw } from "@gt/domain/audio.yue2.lab.schema";
import { parseAbPair } from "@gt/domain/audio.yue2.schema";
import type { Actor, Event } from "@gt/domain/event";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import { queryEvents, type EventQuery } from "@gt/kernel/events-query";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

import { readTakes } from "../sound/store.ts";
import type { SoundTake } from "../sound/types.ts";
import { abPairId, AB_LANE, queuePairs, songEvalMean } from "./ab.ts";
import { listAbTakes, readAbLedger, scoresByTake, type AbFoldPorts, type AbLedger, type AbTake, type FactsMap } from "./abFolds.ts";
import { allYue2Facts, readYue2Facts } from "./facts.ts";
import { queueBlindPairs, REFERENCE_USE } from "./lab.ts";
import { readSongScores } from "./scores.ts";
import { takeSha } from "./sha.ts";

// THE KNOCKOUT DRAW (spark yue2-song-lab S2, WP-A). A draw is a ledger record: one `audio.ab.draw`
// event per version (subject `ab-draw`, lane `audio`, key `audio-ab-draw:<drawId>:<version>`). Its
// matches are S1 blind pairs of AbSource `knockout`, booked round by round through lab.ts
// queueBlindPairs (the pair, then its two `yue2-post` ab-window jobs). Who advances is a fold over the
// draw's newest version, the queued pairs and the votes: the `release` answer decides; `neither` knocks
// out both and the next opponent walks over; the lower seed winning is an upset. A missing seed is a
// bye: its opponent advances by walkover in the fold, never through a pair.
//
// A MATCH FINDS ITS PAIR by its two takes: the knockout pair over the same two takes (any window) IS
// the match. The draw door is strict and AbPair is unchanged, so no side map is written; the match is
// derived from the draw plus the pair's takes. Two consequences, both intended: a reseed whose match
// meets the same two takes is decided by the vote already cast, and the same two takes meeting in
// another draw reuse the owner's blind judgement instead of asking it twice.
//
// A RESEED is a new version with the new rules. When the size holds, every entrant of a match the ear
// decided (won / upset / neither) keeps its seed while both are still drawn, so the match stays decided;
// the other entrants fill the free seeds by the new ranking. `cut` names every take the version dropped.
//
// THE PORTS are injected (drawDesk), as ./ab.ts abDesk does, so the draw is tested over fakes.

/** A whole bracket as the desk reads it. */
export type Bracket = {
  readonly draw: Draw;
  readonly matches: readonly Match[];
  /** The match the owner judges next, if one is booked and undecided. */
  readonly current?: Match;
  /** The tournament's winner, once the final is decided. */
  readonly champion?: string;
};

/** The folds' ports plus allFacts (facts.ts allYue2Facts) and book: queue knockout pairs and cut their windows. */
export type DrawDeps<T extends AbTake = SoundTake> = AbFoldPorts<T> & {
  readonly allFacts: () => Promise<Result<FactsMap>>;
  readonly book: (store: Store, pairs: readonly AbPair[], actor: Actor) => Promise<Result<readonly string[]>>;
};

const WINDOW: readonly [number, number] = [0, AB_WINDOW_S];

/** Standard bracket seeding: first-round slot s meets ORDER[2s-2] against ORDER[2s-1]. */
const ORDER: Readonly<Record<DrawSize, readonly number[]>> = {
  8: [1, 8, 4, 5, 2, 7, 3, 6],
  16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
};
const roundsOf = (size: DrawSize) => (size === 16 ? DRAW_ROUNDS : DRAW_ROUNDS.slice(1));

type MetricOf = { readonly of: (s: SongScores) => number | undefined; readonly lowerIsBetter: boolean };
const METRIC: Readonly<Record<LabMetric, MetricOf>> = {
  wer: { of: (s) => s.wer, lowerIsBetter: true },
  werSd: { of: (s) => s.werSd, lowerIsBetter: true },
  songEval: { of: songEvalMean, lowerIsBetter: false },
  ce: { of: (s) => s.aesthetics?.ce, lowerIsBetter: false },
  buzzIdx: { of: (s) => s.buzzIdx, lowerIsBetter: true },
};

const takeSet = (a: string, b: string): string => [a, b].sort().join("|");
/** The take an arm plays: side `ab` = takeA is arm A. */
const armTake = (p: AbPair, arm: "a" | "b"): string => ((arm === "a") === (p.side === "ab") ? p.takeA : p.takeB);

/* ── the field and its rules ─────────────────────────────────────────────── */

type Entry = { readonly id: string; readonly facts: Yue2TakeFacts; readonly scores?: SongScores };

const valueOf = (e: Entry, m: LabMetric): number | undefined => (e.scores === undefined ? undefined : METRIC[m].of(e.scores));

/** Rules in order: `only` filters by condition; `exclude` drops a take whose metric is `op` the value (an
 *  absent metric stays: it is not 0); `seed-by` and `size` set the ranking and the bracket (last wins). */
function shape(entries: readonly Entry[], rules: readonly LabRule[]): { readonly ranked: readonly Entry[]; readonly size: DrawSize } {
  let kept = [...entries];
  let seedBy: LabMetric = "songEval";
  let size: DrawSize | undefined;
  for (const r of rules) {
    if (r.kind === "only") {
      const c = r.condition;
      kept = kept.filter((e) => (c.cot === undefined || e.facts.condition.cot === c.cot) && (c.cfg === undefined || e.facts.condition.cfg === c.cfg) && (c.adapter === undefined || e.facts.condition.adapter === c.adapter));
    } else if (r.kind === "exclude") {
      kept = kept.filter((e) => {
        const v = valueOf(e, r.metric);
        return v === undefined || !(r.op === "gt" ? v > r.value : v < r.value);
      });
    } else if (r.kind === "seed-by") seedBy = r.metric;
    else size = r.size;
  }
  const m = METRIC[seedBy];
  const ranked = kept.sort((a, b) => {
    const va = valueOf(a, seedBy);
    const vb = valueOf(b, seedBy);
    if (va === undefined || vb === undefined) return (va === undefined ? 1 : 0) - (vb === undefined ? 1 : 0) || a.id.localeCompare(b.id);
    return (m.lowerIsBetter ? va - vb : vb - va) || a.id.localeCompare(b.id);
  });
  const drawn: DrawSize = size ?? (ranked.length >= 9 ? 16 : 8);
  return { ranked: ranked.slice(0, drawn), size: drawn };
}

/* ── the fold ────────────────────────────────────────────────────────────── */

type Seat = { readonly kind: "take"; readonly id: string } | { readonly kind: "out" } | { readonly kind: "open" };
const OUT: Seat = { kind: "out" };
const OPEN: Seat = { kind: "open" };

/** The bracket of one draw version over the A/B ledger (pure). */
function foldBracket(draw: Draw, ledger: AbLedger): Bracket {
  const seedOf = new Map(draw.entrants.map((e) => [e.takeId, e.seed]));
  const bySeed = new Map(draw.entrants.map((e) => [e.seed, e.takeId]));
  const pairs = new Map<string, { readonly pair: AbPair; readonly at: string }>();
  for (const q of ledger.queued) if (q.pair.source === "knockout" && !pairs.has(takeSet(q.pair.takeA, q.pair.takeB))) pairs.set(takeSet(q.pair.takeA, q.pair.takeB), q);
  const matches: Match[] = [];
  const booked: { readonly match: Match; readonly at: string }[] = [];
  let feed: Seat[] = ORDER[draw.size].map((seed): Seat => {
    const id = bySeed.get(seed);
    return id === undefined ? OUT : { kind: "take", id };
  });
  for (const round of roundsOf(draw.size)) {
    const next: Seat[] = [];
    for (let i = 0; i + 1 < feed.length; i += 2) {
      const a = feed[i]!;
      const b = feed[i + 1]!;
      const base: Match = { drawId: draw.drawId, round, slot: i / 2 + 1, ...(a.kind === "take" ? { takeA: a.id } : {}), ...(b.kind === "take" ? { takeB: b.id } : {}) };
      const settle = (m: Match, seat: Seat) => {
        matches.push(m);
        next.push(seat);
      };
      if (a.kind === "open" || b.kind === "open") settle(base, OPEN);
      else if (a.kind === "out" || b.kind === "out") {
        const w = a.kind === "take" ? a : b.kind === "take" ? b : undefined;
        settle(w === undefined ? base : { ...base, winner: w.id, outcome: "walkover" }, w ?? OUT);
      } else {
        const q = pairs.get(takeSet(a.id, b.id));
        const vote = q === undefined ? undefined : ledger.votes.get(q.pair.pairId);
        if (q === undefined) settle(base, OPEN);
        else if (vote === undefined) {
          const m: Match = { ...base, pairId: q.pair.pairId };
          booked.push({ match: m, at: q.at });
          settle(m, OPEN);
        } else if (vote.vote.answers.release === "neither") settle({ ...base, pairId: q.pair.pairId, outcome: "neither" }, OUT);
        else {
          const winner = armTake(q.pair, vote.vote.answers.release);
          const loser = winner === a.id ? b.id : a.id;
          const outcome = (seedOf.get(winner) ?? 99) < (seedOf.get(loser) ?? 99) ? "won" : "upset";
          settle({ ...base, pairId: q.pair.pairId, winner, outcome }, { kind: "take", id: winner });
        }
      }
    }
    feed = next;
  }
  const current = [...booked].sort((x, y) => x.at.localeCompare(y.at))[0]?.match;
  const champion = matches.at(-1)?.winner;
  return { draw, matches, ...(current === undefined ? {} : { current }), ...(champion === undefined ? {} : { champion }) };
}

/* ── the ledger ──────────────────────────────────────────────────────────── */

type Version = { readonly draw: Draw; readonly at: string; readonly seq: number };

function drawEvents(store: Store, subject?: string): Result<readonly Event[]> {
  const out: Event[] = [];
  let after: number | undefined;
  for (;;) {
    const q: EventQuery = { type: [AB_DRAW_EVENT], by: "seq", order: "asc", limit: 1000, ...(subject === undefined ? {} : { subject: { kind: DRAW_SUBJECT_KIND, id: subject } }), ...(after === undefined ? {} : { after }) };
    const page = queryEvents(store, q);
    if (!page.ok) return page;
    out.push(...page.value.events);
    if (!page.value.capped || page.value.next === undefined) return ok(out);
    after = page.value.next;
  }
}

/** Every version the door reads, grouped by draw id, in ledger order. */
function versionsOf(events: readonly Event[]): Map<string, Version[]> {
  const out = new Map<string, Version[]>();
  for (const e of events) {
    const d = parseDraw(e.data);
    if (d.ok) out.set(d.value.drawId, [...(out.get(d.value.drawId) ?? []), { draw: d.value, at: e.at, seq: e.seq }]);
  }
  return out;
}

const newest = (vs: readonly Version[]): Version => vs.reduce((x, y) => (y.draw.version > x.draw.version ? y : x));

function newestDraw(store: Store, drawId: string): Result<Draw> {
  const evs = drawEvents(store, drawId);
  if (!evs.ok) return evs;
  const vs = versionsOf(evs.value).get(drawId);
  return vs === undefined ? err("not-found", `yue2: no draw ${drawId}`) : ok(newest(vs).draw);
}

/** Write one draw version through its door (appendOnce: the same version again is a no-op, other words a conflict). */
function writeVersion(store: Store, build: (at: string) => Draw, actor: Actor): Result<Draw> {
  return store.tx((t) => {
    const d = parseDraw(build(t.at));
    if (!d.ok) throw d.error;
    const v = d.value;
    const data = { ...v, entrants: v.entrants.map((e) => ({ ...e })), rules: v.rules.map((r) => structuredClone(r)), ...(v.cut === undefined ? {} : { cut: [...v.cut] }) };
    const key = abDrawKey(v.drawId, v.version);
    const a = appendOnce(t, { actor, type: AB_DRAW_EVENT, lane: AB_LANE, key, subject: { kind: DRAW_SUBJECT_KIND, id: v.drawId }, data });
    if (!a.same) throw new AppError("conflict", `${AB_DRAW_EVENT}: ${key} is already in the ledger with other words`);
    return v;
  });
}

/* ── the desk ────────────────────────────────────────────────────────────── */

/** The draw over its ports; the exported functions below are this desk over the real ones. */
export function drawDesk<T extends AbTake>(deps: DrawDeps<T>) {
  /** The field's takes with their newest scores: `main` = lyric-gated seeds; `post:<id>` = that raw take and its variants. */
  async function fieldOf(store: Store, field: DrawField): Promise<Result<readonly Entry[]>> {
    const facts = await deps.allFacts();
    if (!facts.ok) return facts;
    const listed = await listAbTakes(deps);
    if (!listed.ok) return listed;
    const held = listed.value.filter((t) => t.file !== null && t.use !== REFERENCE_USE && facts.value[t.id] !== undefined);
    const raw = field === "main" ? undefined : field.slice("post:".length);
    if (raw !== undefined) {
      const f = held.some((t) => t.id === raw) ? facts.value[raw] : undefined;
      if (f === undefined) return err("not-found", `yue2: no YuE2 take ${raw} to draw a post field over`);
      if (f.lineage.sourceTakeId !== undefined) return err("invalid", `yue2: ${raw} is a post variant; a post field is drawn over its raw take ${f.lineage.sourceTakeId}`);
    }
    const inField = held.filter((t) => {
      const src = facts.value[t.id]!.lineage.sourceTakeId;
      return raw === undefined ? src === undefined : t.id === raw || src === raw;
    });
    const scores = await scoresByTake(deps, store, inField);
    if (!scores.ok) return scores;
    const entries = inField.map((t): Entry => {
      const s = scores.value.get(t.id);
      return { id: t.id, facts: facts.value[t.id]!, ...(s === undefined ? {} : { scores: s }) };
    });
    return ok(raw === undefined ? entries.filter((e) => e.scores?.wer !== undefined && e.scores.wer <= YUE2_RECIPE.gateWer) : entries);
  }

  async function shaped(store: Store, field: DrawField, rules: readonly LabRule[]): Promise<Result<{ readonly ranked: readonly Entry[]; readonly size: DrawSize }>> {
    const entries = await fieldOf(store, field);
    if (!entries.ok) return entries;
    const s = shape(entries.value, rules);
    if (s.ranked.length < 2) return err("invalid", `yue2: a draw needs two entrants; the ${field} field under these rules holds ${s.ranked.length}`);
    return ok(s);
  }

  function bracketNow(store: Store, drawId: string): Result<Bracket> {
    const d = newestDraw(store, drawId);
    if (!d.ok) return d;
    const l = readAbLedger(store);
    return l.ok ? ok(foldBracket(d.value, l.value)) : l;
  }

  async function bookNext(store: Store, drawId: string, actor: Actor): Promise<Result<readonly string[]>> {
    const b = bracketNow(store, drawId);
    if (!b.ok) return b;
    const pairs: AbPair[] = [];
    for (const m of b.value.matches) {
      if (m.takeA === undefined || m.takeB === undefined || m.pairId !== undefined || m.outcome !== undefined) continue;
      const p = parseAbPair({ pairId: abPairId("knockout", m.takeA, m.takeB, WINDOW), source: "knockout", takeA: m.takeA, takeB: m.takeB, windowS: [...WINDOW], side: "ab" });
      if (!p.ok) return p;
      pairs.push(p.value);
    }
    return pairs.length === 0 ? ok([]) : deps.book(store, pairs, actor);
  }

  /** Write a version, then book its next matches; a failed booking names the draw it left recorded. */
  async function recordAndBook(store: Store, build: (at: string) => Draw, actor: Actor): Promise<Result<Draw>> {
    const w = writeVersion(store, build, actor);
    if (!w.ok) return w;
    const booked = await bookNext(store, w.value.drawId, actor);
    return booked.ok ? w : err(booked.error.code, `yue2: draw ${w.value.drawId} v${w.value.version} is recorded, but its matches were not booked (${booked.error.message})`);
  }

  async function drawFor(store: Store, field: DrawField, rules: readonly LabRule[], actor: Actor): Promise<Result<Draw>> {
    const s = await shaped(store, field, rules);
    if (!s.ok) return s;
    const entrants = s.value.ranked.map((e, i): DrawEntrant => ({ takeId: e.id, seed: i + 1 }));
    const build = (at: string): Draw => ({ drawId: createHash("sha1").update(`${field}|${at}`).digest("hex").slice(0, 12), version: 1, field, size: s.value.size, entrants, rules: [...rules] });
    return recordAndBook(store, build, actor);
  }

  async function reseed(store: Store, drawId: string, rules: readonly LabRule[], actor: Actor): Promise<Result<Draw>> {
    const before = bracketNow(store, drawId);
    if (!before.ok) return before;
    const prev = before.value.draw;
    const s = await shaped(store, prev.field, rules);
    if (!s.ok) return s;
    const kept = new Set(s.value.ranked.map((e) => e.id));
    const oldSeed = new Map(prev.entrants.map((e) => [e.takeId, e.seed]));
    // Pin both entrants of every match the ear decided, while both are still drawn and the bracket keeps its size.
    const pinned = new Map<string, number>();
    if (s.value.size === prev.size) {
      for (const m of before.value.matches) {
        if (m.pairId === undefined || m.outcome === undefined || m.takeA === undefined || m.takeB === undefined) continue;
        if (!kept.has(m.takeA) || !kept.has(m.takeB)) continue;
        for (const id of [m.takeA, m.takeB]) pinned.set(id, oldSeed.get(id)!);
      }
    }
    const taken = new Set(pinned.values());
    const free = Array.from({ length: s.value.size }, (_, i) => i + 1).filter((seed) => !taken.has(seed));
    const rest = s.value.ranked.filter((e) => !pinned.has(e.id));
    const entrants = [...[...pinned].map(([takeId, seed]) => ({ takeId, seed })), ...rest.map((e, i) => ({ takeId: e.id, seed: free[i]! }))].sort((a, b) => a.seed - b.seed);
    const cut = prev.entrants.map((e) => e.takeId).filter((id) => !kept.has(id));
    return recordAndBook(store, () => ({ drawId, version: prev.version + 1, field: prev.field, size: s.value.size, entrants, rules: [...rules], cut }), actor);
  }

  function draws(store: Store): Result<readonly Draw[]> {
    const evs = drawEvents(store);
    if (!evs.ok) return evs;
    // Newest draw first: by the ledger order of its first version.
    const all = [...versionsOf(evs.value).values()].map((vs) => ({ first: vs[0]!.seq, draw: newest(vs).draw }));
    return ok(all.sort((a, b) => b.first - a.first).map((x) => x.draw));
  }

  return { drawFor, reseed, bookNext, bracketOf: async (store: Store, drawId: string) => bracketNow(store, drawId), draws };
}

const desk = drawDesk<SoundTake>({
  allFacts: allYue2Facts,
  facts: readYue2Facts,
  takes: async () => (await readTakes()).takes,
  sha: takeSha,
  scores: readSongScores,
  // lab.ts queueBlindPairs over these pairs: the pair is queued (its side drawn there), then its two ab-window jobs.
  book: async (store, pairs, actor) => {
    const q = await queueBlindPairs(store, "knockout", pairs.length, actor, new Date(), { propose: async () => ok(pairs), queue: queuePairs });
    return q.ok ? ok(q.value.map((b) => b.pairId)) : q;
  },
});

/** Draw a new bracket over a field (entrants: the lyric-gate passers, seeded by the rules). */
export async function drawFor(store: Store, field: DrawField, rules: readonly LabRule[], actor: Actor): Promise<Result<Draw>> {
  return desk.drawFor(store, field, rules, actor);
}

/** A new version of a draw under other rules; decided matches stay; returns the new version. */
export async function reseed(store: Store, drawId: string, rules: readonly LabRule[], actor: Actor): Promise<Result<Draw>> {
  return desk.reseed(store, drawId, rules, actor);
}

/** Queue every match whose two entrants are known and that has no pair yet; returns the pair ids queued. */
export async function bookNext(store: Store, drawId: string, actor: Actor): Promise<Result<readonly string[]>> {
  return desk.bookNext(store, drawId, actor);
}

/** The bracket of a draw's newest version, folded with its pairs and votes. */
export async function bracketOf(store: Store, drawId: string): Promise<Result<Bracket>> {
  return desk.bracketOf(store, drawId);
}

/** Every draw's newest version, newest first. */
export function draws(store: Store): Result<readonly Draw[]> {
  return desk.draws(store);
}
