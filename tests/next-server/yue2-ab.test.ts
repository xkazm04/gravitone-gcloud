// THE BLIND DESK'S LEDGER (spark yue2-song-lab WP4): pairs proposed from YuE2 takes (facts + scores),
// queued and judged as `audio.ab.*` ledger events, folded into the pending queue (blind), the judged
// list (revealed), win rates per condition and the ear's agreement with each score metric (async:
// facts and shas are read from the sound store). The facts, scores, take listing, sha and side draw are
// fakes injected through abDesk; the kernel is a temp file store.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AB_QUEUE_EVENT, AB_VOTE_EVENT, type AbPair, type AbSide, type AbSource, type AbVote, type SongScores, type Yue2Condition, type Yue2TakeFacts, YUE2_RIGHTS } from "@gt/domain/audio.yue2";
import { parseAbPair } from "@gt/domain/audio.yue2.schema";
import type { Actor } from "@gt/domain/event";
import { err, ok } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { abDesk, abPairId, type AbTake } from "../../lib/yue2/ab.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AT = "2026-11-04T10:00:00.000Z";
const SHEET = "aaaaaaaaaaaaaaaa";
const OFF: Omit<Yue2Condition, "seed"> = { cot: "off", cfg: 1.5 };
const FULL: Omit<Yue2Condition, "seed"> = { cot: "full" };

const shaOf = (id: string) => createHash("sha256").update(id).digest("hex");

function facts(cond: Omit<Yue2Condition, "seed">, seed: number, sourceTakeId?: string): Yue2TakeFacts {
  return {
    engine: "yue2",
    condition: { ...cond, seed },
    style: "dream pop",
    lyrics: "la la",
    lyricsDigest: SHEET,
    durationS: 120,
    rights: YUE2_RIGHTS,
    lineage: sourceTakeId === undefined ? { postStages: [] } : { sourceTakeId, postStages: ["master"] },
  };
}

type Score = { wer?: number; se?: number; ce?: number; buzz?: number };
function score(id: string, s: Score): SongScores {
  const se = s.se;
  return {
    sha: shaOf(id),
    scorerVersion: 1,
    scoredAt: AT,
    ...(s.wer === undefined ? {} : { wer: s.wer }),
    ...(se === undefined ? {} : { songEval: { coherence: se, musicality: se, memorability: se, clarity: se, naturalness: se } }),
    ...(s.ce === undefined ? {} : { aesthetics: { ce: s.ce, cu: 5, pc: 5, pq: 5 } }),
    ...(s.buzz === undefined ? {} : { buzzIdx: s.buzz }),
  };
}

type Fixture = { readonly facts: Record<string, Yue2TakeFacts>; readonly scores: Record<string, Score>; readonly sides?: AbSide[]; readonly unreadable?: readonly string[] };

function deskOver(f: Fixture) {
  const sides = [...(f.sides ?? [])];
  const takes: AbTake[] = Object.keys(f.facts).map((id) => ({ id, file: { path: `${id}.wav` } }));
  const rows: Record<string, SongScores> = {};
  for (const [id, s] of Object.entries(f.scores)) rows[shaOf(id)] = score(id, s);
  return abDesk<AbTake>({
    allFacts: async () => ok(f.facts),
    facts: async (ids) => ok(Object.fromEntries(ids.flatMap((id) => (f.facts[id] === undefined ? [] : [[id, f.facts[id]]])))),
    takes: async () => takes,
    // The bytes' sha (lib/yue2/sha.ts takeSha); a take whose bytes cannot be read answers an error.
    sha: async (t) => (f.unreadable?.includes(t.id) ? err("not-found", `no bytes for ${t.id}`) : ok(shaOf(t.id))),
    scores: (_store, shas) => ok(Object.fromEntries(shas.flatMap((s) => (rows[s] === undefined ? [] : [[s, rows[s]]])))),
    side: () => sides.shift() ?? "ab",
  });
}

// The proposal fixture: one lyrics sheet, two conditions, a post variant of the best seed.
const LAB: Fixture = {
  facts: {
    "st-r1": facts(OFF, 1),
    "st-r2": facts(OFF, 2),
    "st-r3": facts(OFF, 3),
    "st-r4": facts(OFF, 4), // fails the lyric gate (wer 0.30) though it has the best SongEval
    "st-r5": facts(OFF, 5), // unscored
    "st-f1": facts(FULL, 1),
    "st-f2": facts(FULL, 2),
    "st-p1": facts(OFF, 1, "st-r1"), // master of r1, scored
    "st-p2": facts(OFF, 5, "st-r5"), // its source is unscored
    "st-p3": facts(OFF, 2, "st-r2"), // unscored itself
  },
  scores: {
    "st-r1": { wer: 0.05, se: 8 },
    "st-r2": { wer: 0.08, se: 7 },
    "st-r3": { wer: 0.02, se: 6 },
    "st-r4": { wer: 0.3, se: 9 },
    "st-f1": { wer: 0.09, se: 5 },
    "st-f2": { wer: 0.01, se: 7.5 },
    "st-p1": { wer: 0.06, se: 8.2 },
  },
};

let dir: string;
let kernel: Kernel;

beforeAll(() => {
  const env = mkdtempSync(path.join(tmpdir(), "gt-yue2-ab-env-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(env, "gravitone.sqlite");
  process.env["SOUND_STORE_DIR"] = path.join(env, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(env, "ledger.json");
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-yue2-ab-"));
  const k = openKernel(path.join(dir, "kernel.sqlite"));
  if (!k.ok) throw k.error;
  kernel = k.value;
});

afterEach(() => {
  kernel.close();
  rmSync(dir, { recursive: true, force: true });
});

const takePairs = (r: { ok: boolean; value?: readonly AbPair[] }) => (r.ok && r.value !== undefined ? r.value.map((p) => [p.takeA, p.takeB]) : r);
const eventsOf = (type: string) => {
  const r = queryEvents(kernel.store, { type: [type], order: "asc", limit: 100 });
  if (!r.ok) throw r.error;
  return r.value.events;
};
const pairOf = (source: AbSource, takeA: string, takeB: string): AbPair => ({ pairId: abPairId(source, takeA, takeB, [0, 25]), source, takeA, takeB, windowS: [0, 25], side: "ab" });

describe("yue2 a/b: proposals", () => {
  it("post-variant pairs each scored variant with its scored source", async () => {
    expect(takePairs(await deskOver(LAB).proposePairs(kernel.store, "post-variant", 10))).toEqual([["st-r1", "st-p1"]]);
  });

  it("best-of-n pairs the top two gated seeds of a condition, and the best against the third", async () => {
    // full: f2 (7.5) > f1 (5); off: r1 (8) > r2 (7) > r3 (6); r4 is ungated, r5 unscored, p1 a variant.
    expect(takePairs(await deskOver(LAB).proposePairs(kernel.store, "best-of-n", 10))).toEqual([
      ["st-f2", "st-f1"],
      ["st-r1", "st-r2"],
      ["st-r1", "st-r3"],
    ]);
  });

  it("across-conditions pairs the best gated take of each condition of one sheet", async () => {
    expect(takePairs(await deskOver(LAB).proposePairs(kernel.store, "across-conditions", 10))).toEqual([["st-f2", "st-r1"]]);
  });

  it("returns at most the limit, with the placeholder window, door-valid", async () => {
    const r = await deskOver(LAB).proposePairs(kernel.store, "best-of-n", 2);
    expect(takePairs(r)).toEqual([
      ["st-f2", "st-f1"],
      ["st-r1", "st-r2"],
    ]);
    for (const p of r.ok ? r.value : []) {
      expect(p.windowS).toEqual([0, 25]);
      expect(parseAbPair(p).ok).toBe(true);
    }
  });

  it("a take whose bytes cannot be read reads as unscored, not as a failed proposal", async () => {
    expect(takePairs(await deskOver({ ...LAB, unreadable: ["st-p1"] }).proposePairs(kernel.store, "post-variant", 10))).toEqual([]);
  });

  it("skips a pair already queued under any source", async () => {
    const desk = deskOver(LAB);
    expect(desk.queuePairs(kernel.store, [pairOf("across-conditions", "st-r2", "st-r1")], OPERATOR, AT).ok).toBe(true);
    expect(takePairs(await desk.proposePairs(kernel.store, "best-of-n", 10))).toEqual([
      ["st-f2", "st-f1"],
      ["st-r1", "st-r3"],
    ]);
  });
});

describe("yue2 a/b: queue and vote", () => {
  it("the pairId is stable: sha1 of source|sorted takes|window, first 16 hex, whatever the take order", () => {
    expect(abPairId("best-of-n", "st-a", "st-b", [0, 25])).toBe("518f7ceafaa6eb09");
    expect(abPairId("best-of-n", "st-b", "st-a", [0, 25])).toBe("518f7ceafaa6eb09");
    expect(abPairId("post-variant", "st-a", "st-b", [0, 25])).not.toBe("518f7ceafaa6eb09");
    expect(abPairId("best-of-n", "st-a", "st-b", [3.5, 28.5])).not.toBe("518f7ceafaa6eb09");
  });

  it("queueing the same pair twice files one event, on the ab-pair subject in lane audio; the side is drawn at queue time", () => {
    const desk = deskOver({ ...LAB, sides: ["ba", "ab"] });
    const pair = pairOf("best-of-n", "st-r1", "st-r2");
    expect(desk.queuePairs(kernel.store, [pair], OPERATOR, AT)).toEqual({ ok: true, value: [pair.pairId] });
    expect(desk.queuePairs(kernel.store, [pair], { kind: "agent", id: "studio" }, AT)).toEqual({ ok: true, value: [pair.pairId] });
    const evs = eventsOf(AB_QUEUE_EVENT);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ lane: "audio", key: `audio-ab-queue:${pair.pairId}`, subject: { kind: "ab-pair", id: pair.pairId }, data: { ...pair, side: "ba" } });
  });

  it("refuses a pair whose id is not its own", () => {
    const r = deskOver(LAB).queuePairs(kernel.store, [{ ...pairOf("best-of-n", "st-r1", "st-r2"), pairId: "0000000000000000" }], OPERATOR, AT);
    expect(!r.ok && r.error.code).toBe("invalid");
  });

  it("pending hides the take ids and the side; the arms are opaque srcs", () => {
    const desk = deskOver(LAB);
    const pair = pairOf("best-of-n", "st-r1", "st-r2");
    desk.queuePairs(kernel.store, [pair], OPERATOR, AT);
    const pending = desk.pendingPairs(kernel.store);
    expect(pending.ok && pending.value).toEqual([
      {
        pairId: pair.pairId,
        source: "best-of-n",
        windowS: [0, 25],
        arms: [
          { arm: "a", src: `/api/sound/ab/${pair.pairId}/a` },
          { arm: "b", src: `/api/sound/ab/${pair.pairId}/b` },
        ],
        queuedAt: expect.any(String),
      },
    ]);
    const wire = JSON.stringify(pending);
    expect(wire).not.toContain("st-r1");
    expect(wire).not.toContain("st-r2");
    expect(wire).not.toContain("side");
  });

  it("a vote leaves pending and comes back revealed; the same vote again is a no-op", () => {
    const desk = deskOver({ ...LAB, sides: ["ba"] });
    const pair = pairOf("best-of-n", "st-r1", "st-r2");
    desk.queuePairs(kernel.store, [pair], OPERATOR, AT);
    const vote: AbVote = { pairId: pair.pairId, answers: { lyrics: "a", vocal: "b", release: "a" } };
    const judged = desk.voteAb(kernel.store, vote, OPERATOR, AT);
    expect(judged.ok && judged.value).toMatchObject({ pair: { ...pair, side: "ba" }, vote });
    expect(desk.voteAb(kernel.store, vote, OPERATOR, AT).ok).toBe(true);
    expect(eventsOf(AB_VOTE_EVENT)).toHaveLength(1);
    expect(eventsOf(AB_VOTE_EVENT)[0]).toMatchObject({ lane: "audio", key: `audio-ab-vote:${pair.pairId}`, subject: { kind: "ab-pair", id: pair.pairId } });
    expect(desk.pendingPairs(kernel.store)).toEqual({ ok: true, value: [] });
    const all = desk.judgedPairs(kernel.store);
    expect(all.ok && all.value.map((j) => j.pair.side)).toEqual(["ba"]);
  });

  it("refuses a neither without a defect, an unknown defect, an unqueued pair, and a conflicting re-vote", () => {
    const desk = deskOver(LAB);
    const pair = pairOf("best-of-n", "st-r1", "st-r2");
    desk.queuePairs(kernel.store, [pair], OPERATOR, AT);
    const neither = desk.voteAb(kernel.store, { pairId: pair.pairId, answers: { lyrics: "neither", vocal: "a", release: "a" } }, OPERATOR, AT);
    expect(!neither.ok && neither.error.code).toBe("invalid");
    const unknown = desk.voteAb(kernel.store, { pairId: pair.pairId, answers: { lyrics: "neither", vocal: "a", release: "a" }, defect: "too-loud-ish" }, OPERATOR, AT);
    expect(!unknown.ok && unknown.error.code).toBe("invalid");
    const missing = desk.voteAb(kernel.store, { pairId: "0123456789abcdef", answers: { lyrics: "a", vocal: "a", release: "a" } }, OPERATOR, AT);
    expect(!missing.ok && missing.error.code).toBe("not-found");
    expect(eventsOf(AB_VOTE_EVENT)).toHaveLength(0);
    expect(desk.voteAb(kernel.store, { pairId: pair.pairId, answers: { lyrics: "neither", vocal: "a", release: "a" }, defect: "vocal-garble" }, OPERATOR, AT).ok).toBe(true);
    const again = desk.voteAb(kernel.store, { pairId: pair.pairId, answers: { lyrics: "a", vocal: "a", release: "b" } }, OPERATOR, AT);
    expect(!again.ok && again.error.code).toBe("conflict");
    expect(eventsOf(AB_VOTE_EVENT)).toHaveLength(1);
  });
});

describe("yue2 a/b: folds over four hand-built votes", () => {
  // X* are cot=off cfg=1.5 takes, Y* are cot=full (cfg default) takes.
  const FOLD: Fixture = {
    facts: {
      "st-x1": facts(OFF, 1),
      "st-x2": facts(OFF, 2),
      "st-x3": facts(OFF, 3),
      "st-x4": facts(OFF, 4),
      "st-x5": facts(OFF, 5),
      "st-y1": facts(FULL, 1),
      "st-y2": facts(FULL, 2),
      "st-y3": facts(FULL, 3),
    },
    scores: {
      "st-x1": { wer: 0.05, se: 8, ce: 7, buzz: 1 },
      "st-y1": { wer: 0.1, se: 7, ce: 7.5 },
      "st-x2": { wer: 0.02, se: 6, ce: 6, buzz: 2 },
      "st-y2": { wer: 0.04, se: 6.5, ce: 6.5, buzz: 3 },
      "st-x3": { wer: 0.07, se: 5, buzz: 4 },
      "st-y3": { wer: 0.07, se: 6, ce: 8, buzz: 1 },
      "st-x4": { wer: 0.01, se: 9, ce: 9, buzz: 0 },
      "st-x5": { wer: 0.5, se: 1, ce: 1, buzz: 9 },
    },
    // P1 ab, P2 ba, P3 ab, P4 ba (queued in this order).
    sides: ["ab", "ba", "ab", "ba"],
  };

  function judge() {
    const desk = deskOver(FOLD);
    const p1 = pairOf("across-conditions", "st-x1", "st-y1");
    const p2 = pairOf("across-conditions", "st-x2", "st-y2");
    const p3 = pairOf("across-conditions", "st-x3", "st-y3");
    const p4 = pairOf("best-of-n", "st-x4", "st-x5");
    expect(desk.queuePairs(kernel.store, [p1, p2, p3, p4], OPERATOR, AT).ok).toBe(true);
    const vote = (pairId: string, release: "a" | "b" | "neither") => {
      const r = desk.voteAb(kernel.store, { pairId, answers: { lyrics: "a", vocal: "a", release }, ...(release === "neither" ? { defect: "vocal-garble" } : {}) }, OPERATOR, AT);
      expect(r.ok).toBe(true);
    };
    vote(p1.pairId, "a"); // side ab: arm a = x1 -> x1 (off) wins
    vote(p2.pairId, "a"); // side ba: arm a = y2 -> y2 (full) wins
    vote(p3.pairId, "b"); // side ab: arm b = y3 -> y3 (full) wins
    vote(p4.pairId, "neither"); // x4 vs x5, both off: a vote with no win
    return desk;
  }

  it("winRates: one vote per distinct condition in a pair, a win for the release answer's condition", async () => {
    // full: P1, P2, P3 = 3 votes; wins P2, P3 = 2.
    // off:  P1, P2, P3, P4 = 4 votes (P4 counts once, both arms are off); wins P1 = 1 (P4 is neither).
    expect(await judge().winRates(kernel.store)).toEqual({
      ok: true,
      value: [
        { condition: "cot=full cfg=def", votes: 3, wins: 2 },
        { condition: "cot=off cfg=1.5", votes: 4, wins: 1 },
      ],
    });
  });

  it("earAgreement: votes where both arms carry the metric and release chose an arm; agreed where the better arm won", async () => {
    // P4 is neither: no metric counts it.
    // wer (lower better): P1 x1 .05 < y1 .10, x1 won -> agreed; P2 x2 .02 < y2 .04, y2 won -> not; P3 tie .07 -> vote, not agreed. 3 / 1.
    // songEval (higher better): P1 x1 8 > 7, x1 won; P2 y2 6.5 > 6, y2 won; P3 y3 6 > 5, y3 won. 3 / 3.
    // aesthetics.ce (higher better): P1 y1 7.5 > 7, x1 won -> not; P2 y2 6.5 > 6, y2 won -> agreed; P3 x3 has none -> no vote. 2 / 1.
    // buzzIdx (lower better): P1 y1 has none -> no vote; P2 x2 2 < 3, y2 won -> not; P3 y3 1 < 4, y3 won -> agreed. 2 / 1.
    expect(await judge().earAgreement(kernel.store)).toEqual({
      ok: true,
      value: [
        { metric: "wer", votes: 3, agreed: 1 },
        { metric: "songEval", votes: 3, agreed: 3 },
        { metric: "aesthetics.ce", votes: 2, agreed: 1 },
        { metric: "buzzIdx", votes: 2, agreed: 1 },
      ],
    });
  });
});
