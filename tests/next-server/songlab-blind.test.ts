// THE BLIND HOLDS IN THE PAYLOAD (spark yue2-song-lab S2 WP-D): what the song lab's port hands the browser
// before a vote carries neither take id of the match waiting for the ear nor which take plays as A.
// Asserted on the serialized read, both sides:
//   live    - WP-A's real draw (drawDesk over injected facts/scores, a temp kernel store, S1's pair queue)
//             folded by the desk (app/(studio)/audio/_songlab/_port/build.ts deskOf), drawn once with every
//             pair's side `ab` and once with `ba`: the two payloads must be byte-identical, and hold no take id;
//             after a vote the reveal names the arms, and the next waiting match is still blind;
//   fixture - the scripted port's whole read, serialized.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { type SongScores, type Yue2TakeFacts, YUE2_RIGHTS } from "@gt/domain/audio.yue2";
import type { Actor } from "@gt/domain/event";
import { ok } from "@gt/domain/errors";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { deskOf, matchId, type Judged } from "../../app/(studio)/audio/_songlab/_port/build.ts";
import { fixturePort, fixtureVote, resetFixture } from "../../app/(studio)/audio/_songlab/_port/fixture.ts";
import { fixtureTakes } from "../../app/(studio)/audio/_songlab/_port/fixtureData.ts";
import type { LabEntry } from "../../app/(studio)/audio/_songlab/_port/words.ts";
import { abDesk, type AbTake } from "../../lib/yue2/ab.ts";
import { drawDesk, type Bracket } from "../../lib/yue2/draw.ts";
import { queueBlindPairs } from "../../lib/yue2/lab.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AT = "2026-11-04T10:00:00.000Z";
const sha = (id: string) => createHash("sha256").update(id).digest("hex");
const id = (n: number) => `st-blind-${String(n).padStart(2, "0")}`;
const N = 16;

function factsOf(seed: number): Yue2TakeFacts {
  return { engine: "yue2", condition: { cot: "off", cfg: 1.5, seed }, style: "boom-bap", lyrics: "la", lyricsDigest: "aaaaaaaaaaaaaaaa", durationS: 60, rights: YUE2_RIGHTS, lineage: { postStages: [] } };
}
function scoreOf(n: number): SongScores {
  const se = 4.2 - n * 0.05;
  return { sha: sha(id(n)), scorerVersion: 1, scoredAt: AT, wer: 0.05, werSd: 0.02, songEval: { coherence: se, musicality: se, memorability: se, clarity: se, naturalness: se }, buzzIdx: 5 };
}

const FACTS: Record<string, Yue2TakeFacts> = Object.fromEntries(Array.from({ length: N }, (_, i) => [id(i + 1), factsOf(i + 1)]));
const ROWS: Record<string, SongScores> = Object.fromEntries(Array.from({ length: N }, (_, i) => [sha(id(i + 1)), scoreOf(i + 1)]));
const TAKES = new Map<string, LabEntry>(Object.entries(FACTS).map(([t, f]) => [t, { takeId: t, title: t, facts: f, scores: ROWS[sha(t)]!, durationS: 60 }]));

function desks(side: "ab" | "ba") {
  const takes: AbTake[] = Object.keys(FACTS).map((t) => ({ id: t, file: { path: `${t}.wav` } }));
  const ports = {
    allFacts: async () => ok(FACTS),
    facts: async (ids: readonly string[]) => ok(Object.fromEntries(ids.flatMap((t) => (FACTS[t] === undefined ? [] : [[t, FACTS[t]!]])))),
    takes: async () => takes,
    sha: async (t: AbTake) => ok(sha(t.id)),
    scores: (_s: unknown, shas: readonly string[]) => ok(Object.fromEntries(shas.flatMap((s) => (ROWS[s] === undefined ? [] : [[s, ROWS[s]!]])))),
  };
  const ab = abDesk<AbTake>({ ...ports, side: () => side });
  const draw = drawDesk<AbTake>({
    ...ports,
    book: async (store, pairs, actor) => {
      const q = await queueBlindPairs(store, "knockout", pairs.length, actor, new Date(AT), { propose: async () => ok(pairs), queue: ab.queuePairs });
      return q.ok ? ok(q.value.map((b) => b.pairId)) : q;
    },
  });
  return { ab, draw };
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}

let dir: string;
let kernels: Kernel[] = [];
const fresh = (): Kernel => {
  const k = openKernel(path.join(dir, `kernel-${kernels.length}.sqlite`));
  if (!k.ok) throw k.error;
  kernels.push(k.value);
  return k.value;
};

beforeAll(() => {
  const env = mkdtempSync(path.join(tmpdir(), "gt-songlab-blind-env-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(env, "gravitone.sqlite");
  process.env["SOUND_STORE_DIR"] = path.join(env, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(env, "ledger.json");
});
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-songlab-blind-"));
  kernels = [];
});
afterEach(() => {
  for (const k of kernels) k.close();
  rmSync(dir, { recursive: true, force: true });
});

const payload = (b: Bracket, judged: ReadonlyMap<string, Judged> = new Map(), selected?: string): string =>
  JSON.stringify(deskOf({ bracket: b, drawName: "main draw", takes: TAKES, judged, windowCut: () => true, ...(selected === undefined ? {} : { selected }) }));

describe("song lab: the blind holds in the payload", () => {
  it("live: before a vote the payload holds no take id, no side, and is the same whichever take plays as A", async () => {
    const reads: string[] = [];
    for (const side of ["ab", "ba"] as const) {
      const k = fresh();
      const d = desks(side);
      const draw = must(await d.draw.drawFor(k.store, "main", [], OPERATOR));
      const b = must(await d.draw.bracketOf(k.store, draw.drawId));
      expect(b.current?.pairId).toEqual(expect.any(String));
      // The draw id hashes the instant it was drawn: the one field that differs between the two stores.
      reads.push(payload(b).split(draw.drawId).join("<draw>"));
    }
    const [ab, ba] = reads;
    for (const t of TAKES.keys()) expect(ab).not.toContain(t);
    expect(ab).not.toMatch(/"side"|"takeA"|"takeB"/);
    expect(ab).toContain('"match":{');
    expect(ab).toBe(ba);
  });

  it("live: a vote unmasks that match only; the next match waiting stays blind", async () => {
    const k = fresh();
    const d = desks("ba");
    const draw = must(await d.draw.drawFor(k.store, "main", [], OPERATOR));
    const b0 = must(await d.draw.bracketOf(k.store, draw.drawId));
    const cur = b0.current!;
    const voted = must(d.ab.voteAb(k.store, { pairId: cur.pairId!, answers: { lyrics: "b", vocal: "b", release: "b" } }, OPERATOR, AT));
    const b1 = must(await d.draw.bracketOf(k.store, draw.drawId));
    const judged = new Map<string, Judged>([[voted.pair.pairId, { pair: voted.pair, vote: voted.vote }]]);

    const revealed = deskOf({ bracket: b1, drawName: "main draw", takes: TAKES, judged, windowCut: () => true, selected: matchId(cur) });
    expect(revealed.reveal?.winnerArm).toBe("b");
    // side "ba": arm A played the pair's takeB.
    expect(revealed.reveal?.arms[0].entrant.seed).toBe(b1.draw.entrants.find((e) => e.takeId === voted.pair.takeB)?.seed);

    const next = payload(b1, judged);
    expect(JSON.parse(next).match.matchId).not.toBe(matchId(cur));
    for (const t of TAKES.keys()) expect(next).not.toContain(t);
    expect(next).not.toMatch(/"side"|"takeA"|"takeB"|"reveal"/);
  });

  it("fixture: the scripted read holds no take id and no side; a fixture vote reveals and advances", async () => {
    resetFixture();
    const ids = fixtureTakes().map((t) => t.takeId);
    const read = await fixturePort.read({ source: "fixture", field: true });
    const text = JSON.stringify(read);
    for (const t of ids) expect(text).not.toContain(t);
    expect(text).not.toMatch(/"side"|"takeA"|"takeB"|"reveal"/);
    expect(read.match?.window).toBe("cut");

    const m = read.match!;
    must(fixtureVote({ pairId: m.pairId, answers: { lyrics: "a", vocal: "a", release: "a" } }));
    const after = await fixturePort.read({ source: "fixture", field: false, match: m.matchId });
    expect(after.reveal?.matchId).toBe(m.matchId);
    expect(after.bracket?.decided).toBe(1);
    expect(after.director.line?.text).toMatch(/^(Upset in the R16|Seed \d+ holds)/);
    expect(after.glow).not.toBe(m.matchId);
    const again = fixtureVote({ pairId: m.pairId, answers: { lyrics: "a", vocal: "a", release: "a" } });
    expect(!again.ok && again.error.code).toBe("conflict");
  });
});
