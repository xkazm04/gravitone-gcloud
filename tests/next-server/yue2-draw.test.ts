// THE KNOCKOUT DRAW (spark yue2-song-lab S2 WP-A): a draw version as an `audio.ab.draw` ledger event,
// its matches booked as S1 blind pairs of AbSource `knockout` (lab.ts queueBlindPairs: the pair, then
// its two ab-window jobs), and the bracket folded from the newest version, the pairs and the votes.
// The facts, scores, take listing and side draw are fakes injected through drawDesk / abDesk; the kernel
// is a temp file store.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AB_QUEUE_EVENT, type SongScores, type Yue2Condition, type Yue2TakeFacts, YUE2_RIGHTS } from "@gt/domain/audio.yue2";
import { AB_DRAW_EVENT, type Draw, type LabRule } from "@gt/domain/audio.yue2.lab";
import type { Actor } from "@gt/domain/event";
import { ok } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { abDesk, type AbTake } from "../../lib/yue2/ab.ts";
import { drawDesk, type Bracket } from "../../lib/yue2/draw.ts";
import { queueBlindPairs } from "../../lib/yue2/lab.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AT = "2026-11-04T10:00:00.000Z";
const OFF: Omit<Yue2Condition, "seed"> = { cot: "off", cfg: 1.5 };
const FULL: Omit<Yue2Condition, "seed"> = { cot: "full" };

const shaOf = (id: string) => createHash("sha256").update(id).digest("hex");

function facts(cond: Omit<Yue2Condition, "seed">, seed: number, sourceTakeId?: string): Yue2TakeFacts {
  return {
    engine: "yue2",
    condition: { ...cond, seed },
    style: "dream pop",
    lyrics: "la la",
    lyricsDigest: "aaaaaaaaaaaaaaaa",
    durationS: 120,
    rights: YUE2_RIGHTS,
    lineage: sourceTakeId === undefined ? { postStages: [] } : { sourceTakeId, postStages: ["master"] },
  };
}

type Score = { wer?: number; werSd?: number; se?: number; ce?: number; buzz?: number };
function score(id: string, s: Score): SongScores {
  const se = s.se;
  return {
    sha: shaOf(id),
    scorerVersion: 1,
    scoredAt: AT,
    ...(s.wer === undefined ? {} : { wer: s.wer }),
    ...(s.werSd === undefined ? {} : { werSd: s.werSd }),
    ...(se === undefined ? {} : { songEval: { coherence: se, musicality: se, memorability: se, clarity: se, naturalness: se } }),
    ...(s.ce === undefined ? {} : { aesthetics: { ce: s.ce, cu: 5, pc: 5, pq: 5 } }),
    ...(s.buzz === undefined ? {} : { buzzIdx: s.buzz }),
  };
}

type Fixture = { readonly facts: Record<string, Yue2TakeFacts>; readonly scores: Record<string, Score> };

const id = (n: number) => `st-${String(n).padStart(2, "0")}`;

/** n gated seeds st-01..st-nn, SongEval falling with the number (st-01 is the best), plus the extras. */
function field(n: number, extra: Partial<Fixture> = {}): Fixture {
  const f: Record<string, Yue2TakeFacts> = {};
  const s: Record<string, Score> = {};
  for (let i = 1; i <= n; i++) {
    f[id(i)] = facts(OFF, i);
    s[id(i)] = { wer: 0.05, se: 9 - i * 0.1 };
  }
  return { facts: { ...f, ...extra.facts }, scores: { ...s, ...extra.scores } };
}

/** Takes the main field never draws: an ungated seed, an unscored seed, a post variant of st-01. */
const NOISE: Partial<Fixture> = {
  facts: { "st-gx": facts(OFF, 90), "st-un": facts(OFF, 91), "st-v1": facts(OFF, 1, "st-01") },
  scores: { "st-gx": { wer: 0.3, se: 9.9 }, "st-v1": { wer: 0.3, se: 9.8 } },
};

function desks(f: Fixture) {
  const takes: AbTake[] = Object.keys(f.facts).map((t) => ({ id: t, file: { path: `${t}.wav` } }));
  const rows: Record<string, SongScores> = {};
  for (const [t, s] of Object.entries(f.scores)) rows[shaOf(t)] = score(t, s);
  const ports = {
    allFacts: async () => ok(f.facts),
    facts: async (ids: readonly string[]) => ok(Object.fromEntries(ids.flatMap((t) => (f.facts[t] === undefined ? [] : [[t, f.facts[t]!]])))),
    takes: async () => takes,
    sha: async (t: AbTake) => ok(shaOf(t.id)),
    scores: (_store: unknown, shas: readonly string[]) => ok(Object.fromEntries(shas.flatMap((s) => (rows[s] === undefined ? [] : [[s, rows[s]!]])))),
  };
  // Side `ab` always: arm A plays the pair's takeA, which is the match's top entrant.
  const ab = abDesk<AbTake>({ ...ports, side: () => "ab" });
  const draw = drawDesk<AbTake>({
    ...ports,
    book: async (store, pairs, actor) => {
      const q = await queueBlindPairs(store, "knockout", pairs.length, actor, new Date(AT), { propose: async () => ok(pairs), queue: ab.queuePairs });
      return q.ok ? ok(q.value.map((b) => b.pairId)) : q;
    },
  });
  return { ab, draw };
}

let dir: string;
let kernel: Kernel;

beforeAll(() => {
  const env = mkdtempSync(path.join(tmpdir(), "gt-yue2-draw-env-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(env, "gravitone.sqlite");
  process.env["SOUND_STORE_DIR"] = path.join(env, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(env, "ledger.json");
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-yue2-draw-"));
  const k = openKernel(path.join(dir, "kernel.sqlite"));
  if (!k.ok) throw k.error;
  kernel = k.value;
});

afterEach(() => {
  kernel.close();
  rmSync(dir, { recursive: true, force: true });
});

const eventsOf = (type: string) => {
  const r = queryEvents(kernel.store, { type: [type], order: "asc", limit: 1000 });
  if (!r.ok) throw r.error;
  return r.value.events;
};
const jobCount = (): number => {
  const r = kernel.store.read((x) => x.get("SELECT count(*) AS c FROM jobs WHERE id LIKE '%ab-%'") as { c: number });
  if (!r.ok) throw r.error;
  return r.value.c;
};
function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}

type Desks = ReturnType<typeof desks>;
const bracket = async (d: Desks, drawId: string): Promise<Bracket> => must(await d.draw.bracketOf(kernel.store, drawId));
const seedsOf = (b: Bracket, round: string) => {
  const seed = new Map(b.draw.entrants.map((e) => [e.takeId, e.seed]));
  return b.matches.filter((m) => m.round === round).map((m) => [m.takeA === undefined ? 0 : seed.get(m.takeA), m.takeB === undefined ? 0 : seed.get(m.takeB)]);
};
const matchOf = (b: Bracket, round: string, slot: number) => b.matches.find((m) => m.round === round && m.slot === slot)!;
/** Vote the `release` answer of a booked match (lyrics/vocal follow it). */
function vote(d: Desks, b: Bracket, round: string, slot: number, release: "a" | "b" | "neither") {
  const pairId = matchOf(b, round, slot).pairId!;
  const answers = { lyrics: release, vocal: release, release };
  must(d.ab.voteAb(kernel.store, { pairId, answers, ...(release === "neither" ? { defect: "vocal-garble" } : {}) }, OPERATOR, AT));
}
const drawn = async (d: Desks, rules: readonly LabRule[] = [], f: "main" | `post:${string}` = "main"): Promise<Draw> => must(await d.draw.drawFor(kernel.store, f, rules, OPERATOR));

describe("yue2 draw: seeding", () => {
  it("16 entrants: the lyric-gate seeds only, standard seeding, every R16 match booked with its two ab-window jobs", async () => {
    const d = desks(field(16, NOISE));
    const draw = await drawn(d);
    expect(draw).toMatchObject({ version: 1, field: "main", size: 16, rules: [] });
    expect(draw.entrants).toEqual(Array.from({ length: 16 }, (_, i) => ({ takeId: id(i + 1), seed: i + 1 })));
    const [ev] = eventsOf(AB_DRAW_EVENT);
    expect(ev).toMatchObject({ lane: "audio", key: `audio-ab-draw:${draw.drawId}:1`, subject: { kind: "ab-draw", id: draw.drawId } });
    expect(draw.drawId).toBe(createHash("sha1").update(`main|${ev!.at}`).digest("hex").slice(0, 12));
    const b = await bracket(d, draw.drawId);
    expect(seedsOf(b, "R16")).toEqual([[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]]);
    expect(b.matches.map((m) => m.round)).toEqual([...Array(8).fill("R16"), ...Array(4).fill("QF"), "SF", "SF", "F"]);
    expect(b.matches.filter((m) => m.round === "R16").every((m) => m.pairId !== undefined)).toBe(true);
    expect(eventsOf(AB_QUEUE_EVENT).map((e) => (e.data as { source: string }).source)).toEqual(Array(8).fill("knockout"));
    expect(jobCount()).toBe(16);
    expect(b.current).toEqual(matchOf(b, "R16", 1));
    expect(b.champion).toBeUndefined();
  });

  it("11 entrants: a 16 bracket whose missing seeds are byes, walked over in the fold and never paired", async () => {
    const d = desks(field(11));
    const draw = await drawn(d);
    expect(draw.size).toBe(16);
    const b = await bracket(d, draw.drawId);
    expect(seedsOf(b, "R16")).toEqual([[1, 0], [8, 9], [4, 0], [5, 0], [2, 0], [7, 10], [3, 0], [6, 11]]);
    for (const slot of [1, 3, 4, 5, 7]) {
      const m = matchOf(b, "R16", slot);
      expect(m).toEqual({ drawId: draw.drawId, round: "R16", slot, takeA: m.takeA, winner: m.takeA, outcome: "walkover" });
    }
    const queued = eventsOf(AB_QUEUE_EVENT).map((e) => [(e.data as { takeA: string }).takeA, (e.data as { takeB: string }).takeB]);
    // The three played R16 matches and QF 2 (4 v 5, both through on byes); no pair holds a bye.
    expect(queued).toEqual([[id(8), id(9)], [id(7), id(10)], [id(6), id(11)], [id(4), id(5)]]);
    // QF 1 is seed 1 (walked over) against the undecided 8 v 9: one entrant known, no pair yet.
    expect(matchOf(b, "QF", 1)).toEqual({ drawId: draw.drawId, round: "QF", slot: 1, takeA: id(1) });
    // QF 2 is 4 v 5, both walked over: booked at once.
    expect(matchOf(b, "QF", 2)).toMatchObject({ takeA: id(4), takeB: id(5), pairId: expect.any(String) });
  });

  it("8 or fewer entrants draw an 8 bracket (QF, SF, F); fewer than two is refused", async () => {
    const d = desks(field(8));
    const b = await bracket(d, (await drawn(d)).drawId);
    expect(seedsOf(b, "QF")).toEqual([[1, 8], [4, 5], [2, 7], [3, 6]]);
    const one = await desks(field(1)).draw.drawFor(kernel.store, "main", [], OPERATOR);
    expect(!one.ok && one.error.code).toBe("invalid");
  });
});

describe("yue2 draw: rules", () => {
  const mixed: Fixture = {
    facts: { "st-a": facts(OFF, 1), "st-b": facts(OFF, 2), "st-c": facts(FULL, 3), "st-d": facts(OFF, 4), "st-e": facts(FULL, 5) },
    scores: {
      "st-a": { wer: 0.08, werSd: 0.01, se: 8, buzz: 3 },
      "st-b": { wer: 0.02, werSd: 0.05, se: 7 }, // no buzz: never treated as 0
      "st-c": { wer: 0.05, werSd: 0.02, se: 9, buzz: 1 },
      "st-d": { wer: 0.01, se: 6, buzz: 9 },
      "st-e": { wer: 0.09, werSd: 0.03, se: 5, buzz: 2 },
    },
  };
  const order = async (rules: readonly LabRule[]) => (await drawn(desks(mixed), rules)).entrants.map((e) => e.takeId);

  it("default: seeded by the SongEval mean, best first", async () => {
    expect(await order([])).toEqual(["st-c", "st-a", "st-b", "st-d", "st-e"]);
  });

  it("only filters by condition", async () => {
    expect(await order([{ kind: "only", condition: { cot: "full" } }])).toEqual(["st-c", "st-e"]);
    expect(await order([{ kind: "only", condition: { cot: "off", cfg: 1.5 } }])).toEqual(["st-a", "st-b", "st-d"]);
  });

  it("exclude drops by metric; a take without the metric stays", async () => {
    expect(await order([{ kind: "exclude", metric: "buzzIdx", op: "gt", value: 2.5 }])).toEqual(["st-c", "st-b", "st-e"]);
    expect(await order([{ kind: "exclude", metric: "buzzIdx", op: "lt", value: 2.5 }])).toEqual(["st-a", "st-b", "st-d"]);
  });

  it("seed-by sets the seeding metric (lower is better for wer, werSd, buzzIdx); an absent metric seeds last", async () => {
    expect(await order([{ kind: "seed-by", metric: "wer" }])).toEqual(["st-d", "st-b", "st-c", "st-a", "st-e"]);
    expect(await order([{ kind: "seed-by", metric: "buzzIdx" }])).toEqual(["st-c", "st-e", "st-a", "st-d", "st-b"]);
    expect(await order([{ kind: "seed-by", metric: "werSd" }])).toEqual(["st-a", "st-c", "st-e", "st-b", "st-d"]);
  });

  it("size sets the bracket and cuts the field to it; ties fall to the take id", async () => {
    const d = desks(field(12));
    const eight = await drawn(d, [{ kind: "size", size: 8 }]);
    expect([eight.size, eight.entrants.length, eight.entrants.at(-1)]).toEqual([8, 8, { takeId: id(8), seed: 8 }]);
    const sixteen = await drawn(desks(field(3)), [{ kind: "size", size: 16 }]);
    expect(sixteen.size).toBe(16);
    const tie: Fixture = { facts: { "st-y": facts(OFF, 1), "st-x": facts(OFF, 2) }, scores: { "st-y": { wer: 0, se: 5 }, "st-x": { wer: 0, se: 5 } } };
    expect((await drawn(desks(tie))).entrants.map((e) => e.takeId)).toEqual(["st-x", "st-y"]);
  });

  it("a post field is that raw take and its variants, gate not applied; a variant or an unknown take is refused", async () => {
    const d = desks(field(4, NOISE));
    expect((await drawn(d, [], "post:st-01")).entrants.map((e) => e.takeId)).toEqual(["st-v1", "st-01"]);
    const variant = await d.draw.drawFor(kernel.store, "post:st-v1", [], OPERATOR);
    expect(!variant.ok && variant.error.code).toBe("invalid");
    const unknown = await d.draw.drawFor(kernel.store, "post:st-zz", [], OPERATOR);
    expect(!unknown.ok && unknown.error.code).toBe("not-found");
  });
});

describe("yue2 draw: the fold", () => {
  it("advances round by round to the champion; each round is booked once its feeders are decided", async () => {
    const d = desks(field(8));
    const { drawId } = await drawn(d);
    let b = await bracket(d, drawId);
    for (const slot of [1, 2, 3, 4]) vote(d, b, "QF", slot, "a");
    expect(must(await d.draw.bookNext(kernel.store, drawId, OPERATOR))).toHaveLength(2);
    b = await bracket(d, drawId);
    expect(b.matches.filter((m) => m.round === "QF").map((m) => m.outcome)).toEqual(["won", "won", "won", "won"]);
    expect(seedsOf(b, "SF")).toEqual([[1, 4], [2, 3]]);
    expect(b.current).toEqual(matchOf(b, "SF", 1));
    vote(d, b, "SF", 1, "a");
    vote(d, b, "SF", 2, "a");
    must(await d.draw.bookNext(kernel.store, drawId, OPERATOR));
    b = await bracket(d, drawId);
    expect(seedsOf(b, "F")).toEqual([[1, 2]]);
    vote(d, b, "F", 1, "b");
    b = await bracket(d, drawId);
    expect(matchOf(b, "F", 1)).toMatchObject({ winner: id(2), outcome: "upset" });
    expect(b.champion).toBe(id(2));
    expect(b.current).toBeUndefined();
  });

  it("an upset: the lower seed wins", async () => {
    const d = desks(field(8));
    const { drawId } = await drawn(d);
    vote(d, await bracket(d, drawId), "QF", 1, "b");
    expect(matchOf(await bracket(d, drawId), "QF", 1)).toMatchObject({ takeA: id(1), takeB: id(8), winner: id(8), outcome: "upset" });
  });

  it("neither knocks out both, and the next round's opponent walks over without a pair", async () => {
    const d = desks(field(8));
    const { drawId } = await drawn(d);
    let b = await bracket(d, drawId);
    vote(d, b, "QF", 1, "neither");
    vote(d, b, "QF", 2, "a");
    expect(must(await d.draw.bookNext(kernel.store, drawId, OPERATOR))).toEqual([]);
    b = await bracket(d, drawId);
    expect(matchOf(b, "QF", 1)).toMatchObject({ outcome: "neither" });
    expect(matchOf(b, "QF", 1).winner).toBeUndefined();
    expect(matchOf(b, "SF", 1)).toEqual({ drawId, round: "SF", slot: 1, takeB: id(4), winner: id(4), outcome: "walkover" });
    expect(eventsOf(AB_QUEUE_EVENT)).toHaveLength(4);
  });

  it("bookNext is idempotent: no second pair, event or job", async () => {
    const d = desks(field(8));
    const { drawId } = await drawn(d);
    expect([eventsOf(AB_QUEUE_EVENT).length, jobCount()]).toEqual([4, 8]);
    expect(must(await d.draw.bookNext(kernel.store, drawId, OPERATOR))).toEqual([]);
    expect(must(await d.draw.bookNext(kernel.store, drawId, OPERATOR))).toEqual([]);
    expect([eventsOf(AB_QUEUE_EVENT).length, jobCount()]).toEqual([4, 8]);
  });
});

describe("yue2 draw: reseed and the list", () => {
  it("a reseed is a new version: decided matches stay, cut names the dropped takes, free seeds fill by the new ranking", async () => {
    const f = field(8);
    f.scores[id(6)] = { ...f.scores[id(6)], buzz: 9 };
    const d = desks(f);
    const { drawId } = await drawn(d);
    const b1 = await bracket(d, drawId);
    vote(d, b1, "QF", 1, "a"); // 1 beats 8
    vote(d, b1, "QF", 2, "b"); // 5 upsets 4
    const v2 = must(await d.draw.reseed(kernel.store, drawId, [{ kind: "exclude", metric: "buzzIdx", op: "gt", value: 5 }], OPERATOR));
    expect(v2).toMatchObject({ drawId, version: 2, size: 8, cut: [id(6)] });
    // Pinned 1, 8, 4, 5; the rest (2, 3, 7) take the free seeds 2, 3, 6; seed 7 is a bye.
    expect(v2.entrants).toEqual([
      { takeId: id(1), seed: 1 },
      { takeId: id(2), seed: 2 },
      { takeId: id(3), seed: 3 },
      { takeId: id(4), seed: 4 },
      { takeId: id(5), seed: 5 },
      { takeId: id(7), seed: 6 },
      { takeId: id(8), seed: 8 },
    ]);
    const b2 = await bracket(d, drawId);
    expect(b2.draw.version).toBe(2);
    expect(matchOf(b2, "QF", 1)).toEqual({ ...matchOf(b1, "QF", 1), winner: id(1), outcome: "won" });
    expect(matchOf(b2, "QF", 2)).toMatchObject({ winner: id(5), outcome: "upset" });
    expect(matchOf(b2, "QF", 3)).toMatchObject({ takeA: id(2), winner: id(2), outcome: "walkover" });
    expect(matchOf(b2, "QF", 4)).toMatchObject({ takeA: id(3), takeB: id(7), pairId: expect.any(String) });
    // The reseed booked SF 1 (1 v 5) as well as the new QF 4.
    expect(matchOf(b2, "SF", 1)).toMatchObject({ takeA: id(1), takeB: id(5), pairId: expect.any(String) });
    expect(eventsOf(AB_DRAW_EVENT).map((e) => e.key)).toEqual([`audio-ab-draw:${drawId}:1`, `audio-ab-draw:${drawId}:2`]);
  });

  it("draws lists each draw's newest version, newest draw first", async () => {
    const d = desks(field(8));
    const first = await drawn(d);
    await new Promise((r) => setTimeout(r, 5));
    const second = await drawn(d, [{ kind: "size", size: 16 }]);
    must(await d.draw.reseed(kernel.store, first.drawId, [{ kind: "seed-by", metric: "wer" }], OPERATOR));
    expect(must(d.draw.draws(kernel.store)).map((x) => [x.drawId, x.version])).toEqual([
      [second.drawId, 1],
      [first.drawId, 2],
    ]);
    const missing = await d.draw.bracketOf(kernel.store, "000000000000");
    expect(!missing.ok && missing.error.code).toBe("not-found");
  });
});

describe("yue2 draw: the blind desk around it", () => {
  it("a knockout proposal is refused: knockout pairs are booked by a draw", async () => {
    const r = await desks(field(8)).ab.proposePairs(kernel.store, "knockout", 5);
    expect(!r.ok && [r.error.code, r.error.message]).toEqual(["invalid", "knockout pairs are booked by a draw"]);
  });

  it("winRates and earAgreement count a judged knockout pair like any pair", async () => {
    const d = desks(field(8));
    const { drawId } = await drawn(d);
    vote(d, await bracket(d, drawId), "QF", 1, "a");
    expect(must(await d.ab.winRates(kernel.store))).toEqual([{ condition: "cot=off cfg=1.5", votes: 1, wins: 1 }]);
    expect(must(await d.ab.earAgreement(kernel.store)).find((e) => e.metric === "songEval")).toEqual({ metric: "songEval", votes: 1, agreed: 1 });
  });
});
