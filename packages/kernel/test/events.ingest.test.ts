import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { EventInput } from "@gt/domain/event";
import { canonical, chainHash } from "../src/canonical.ts";
import { append, eventsMigrations, verify } from "../src/events.ts";
import { appendOnce, claimState, finishClaim, recordSourceOutcome, sourceHealth, takeClaim } from "../src/ingest.ts";
import { openKernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store, type Tx } from "../src/store.ts";
import { must, scratch, steppingClock } from "./helpers.ts";

// The v1 projection's kernel half: two clocks on an event, a natural key the
// STORE keeps unique, and the sync's claim. The invariants a projection leans
// on, each with the break that would hide it.

const tmp = scratch("ingest");
afterAll(() => tmp.dispose());
let n = 0;
const file = (): string => path.join(tmp.dir, `i-${++n}.sqlite`);

const kernelAt = (loc: string, clock: () => Date = steppingClock()) => must(openKernel(loc, { clock, snapshotDir: tmp.dir }));

const fact = (key: string, over: Partial<EventInput> = {}): EventInput & { key: string } => ({
  actor: { kind: "machine", id: "forge" },
  type: "run.start",
  subject: { kind: "run", id: "r1" },
  data: { src: "fixture", runId: "r1" },
  occurredAt: "2026-08-26T12:00:00.000Z",
  atSrc: "recorded",
  ...over,
  key,
});

/** What `append` wrote before events v3, verbatim: thirteen columns and the
 *  v2 hash input. The upgrade must leave these rows verifying as they are. */
function appendV2(t: Tx, seq: number, prevHash: string, e: { type: string; id: string; lane: string; data: Record<string, number> }): string {
  const body = { seq, at: t.at, actor: { kind: "operator", id: "op" }, type: e.type, subject: { kind: "run", id: e.id }, data: e.data, prevHash, lane: e.lane };
  const hash = chainHash(prevHash, body);
  t.run(
    "INSERT INTO events (seq, at, actor_kind, actor_id, type, subject_kind, subject_id, lane, cost_usd, cost_src, data, prev_hash, hash) VALUES (?, ?, 'operator', 'op', ?, 'run', ?, ?, NULL, NULL, ?, ?, ?)",
    seq, t.at, e.type, e.id, e.lane, canonical(e.data), prevHash, hash,
  );
  return hash;
}

const keyed = (s: Store): number => must(s.read((r) => Number(r.get("SELECT count(*) AS n FROM events WHERE key IS NOT NULL")?.["n"])));

describe("events v3: the second clock and the key", () => {
  it("a chain written under v2 verifies unchanged after the upgrade, and keeps verifying as v3 rows join it", () => {
    const loc = file();
    const old = must(openStore(loc, { clock: steppingClock() }));
    must(migrate(old, [{ module: "events", steps: eventsMigrations.steps.slice(0, 2) }], { snapshotDir: tmp.dir }));
    let prev = "0".repeat(64);
    for (const i of [1, 2, 3]) prev = must(old.tx((t) => appendV2(t, i, prev, { type: "commit", id: `r${i}`, lane: "gpu.local", data: { i, ratio: i / 3 } })));
    old.close();

    const k = kernelAt(loc);
    expect(k.migrated.applied).toContainEqual({ module: "events", version: 3 });
    // Same rows, same hashes: absent fields stay out of the canonical body.
    const before = must(verify(k.store));
    expect(before).toEqual({ state: "intact", count: 3, head: { seq: 3, hash: prev } });
    must(k.store.tx((t) => appendOnce(t, fact("forge:r1:run.start"))));
    must(k.store.tx((t) => append(t, { actor: { kind: "agent", id: "a" }, type: "judge.pick", subject: { kind: "pair", id: "p" }, data: {} })));
    expect(must(verify(k.store))).toMatchObject({ state: "intact", count: 5 });
    k.close();
  });

  it("a v3 field edited after the fact breaks the chain - the new fields are covered by the hash", () => {
    const k = kernelAt(file());
    must(k.store.tx((t) => appendOnce(t, fact("forge:r1:run.start"))));
    must(k.store.tx((t) => t.exec("DROP TRIGGER events_no_update; UPDATE events SET occurred_at = '2026-08-27T12:00:00.000Z' WHERE seq = 1;")));
    expect(must(verify(k.store))).toMatchObject({ state: "tampered", seq: 1 });
    k.close();
  });

  it("the door refuses a clock without its source, and a stamp that would sort wrongly", () => {
    const k = kernelAt(file());
    const { atSrc: _drop, ...noSrc } = fact("forge:r1:run.start");
    const lone = k.store.tx((t) => append(t, noSrc));
    expect(!lone.ok && lone.error.code).toBe("invalid");
    // "…00Z" sorts after "…00.500Z"; only toISOString's shape may be stored.
    const coarse = k.store.tx((t) => append(t, fact("forge:r1:x", { occurredAt: "2026-08-26T12:00:00Z" })));
    expect(!coarse.ok && coarse.error.code).toBe("invalid");
    const offset = k.store.tx((t) => append(t, fact("forge:r1:y", { occurredAt: "2026-08-26T12:00:00.000+00:00" })));
    expect(!offset.ok && offset.error.code).toBe("invalid");
    k.close();
  });
});

describe("appendOnce", () => {
  it("appends a key once; the second call returns the stored event and writes nothing", () => {
    const k = kernelAt(file());
    const a = must(k.store.tx((t) => appendOnce(t, fact("forge:r1:run.start"))));
    const b = must(k.store.tx((t) => appendOnce(t, fact("forge:r1:run.start"))));
    expect(a).toMatchObject({ appended: true, same: true });
    expect(b).toEqual({ event: a.event, appended: false, same: true });
    expect(a.event).toMatchObject({ occurredAt: "2026-08-26T12:00:00.000Z", atSrc: "recorded", key: "forge:r1:run.start" });
    expect(keyed(k.store)).toBe(1);
    k.close();
  });

  it("reports a key whose content moved, except a derived instant, which is the sync's own clock", () => {
    const k = kernelAt(file());
    must(k.store.tx((t) => appendOnce(t, fact("forge:r1:status.done", { atSrc: "derived", occurredAt: "2026-10-01T00:00:00.000Z" }))));
    const later = must(k.store.tx((t) => appendOnce(t, fact("forge:r1:status.done", { atSrc: "derived", occurredAt: "2026-10-02T00:00:00.000Z" }))));
    expect(later).toMatchObject({ appended: false, same: true });
    const moved = must(k.store.tx((t) => appendOnce(t, fact("forge:r1:status.done", { atSrc: "derived", occurredAt: "2026-10-02T00:00:00.000Z", data: { src: "fixture", note: "edited" } }))));
    expect(moved).toMatchObject({ appended: false, same: false });
    k.close();
  });

  it("two processes on one file append each key once, whoever gets there first", () => {
    const loc = file();
    kernelAt(loc).close();
    const one = must(openStore(loc));
    const two = must(openStore(loc));
    const keys = Array.from({ length: 40 }, (_, i) => `forge:r${i % 10}:log.${i}`);
    // Interleaved, each handle taking the full list in its own order: every
    // key is offered twice, from two connections that share no memory.
    for (let i = 0; i < keys.length; i++) {
      const a = keys[i] ?? "";
      const b = keys[keys.length - 1 - i] ?? "";
      must(one.tx((t) => appendOnce(t, fact(a))));
      must(two.tx((t) => appendOnce(t, fact(b))));
    }
    expect(keyed(one)).toBe(40);
    expect(must(verify(one))).toMatchObject({ state: "intact", count: 40 });
    one.close();
    two.close();
  });

  it("the uniqueness is the store's: a writer that skips the check is refused, not doubled", () => {
    const k = kernelAt(file());
    must(k.store.tx((t) => append(t, fact("forge:r1:run.start"))));
    const twice = k.store.tx((t) => append(t, fact("forge:r1:run.start")));
    expect(!twice.ok && twice.error.code).toBe("conflict");
    expect(keyed(k.store)).toBe(1);
    // Kernel-made events carry no key, and any number of them coexist.
    must(k.store.tx((t) => [1, 2].map(() => append(t, { actor: { kind: "operator", id: "op" }, type: "commit", subject: { kind: "run", id: "r" }, data: {} }))));
    k.close();
  });
});

describe("the sync claim", () => {
  it("one claimant at a time, then none until the interval after the finish has passed", () => {
    let now = Date.parse("2026-10-15T12:00:00.000Z");
    const clock = () => new Date(now);
    const loc = file();
    kernelAt(loc).close();
    const a = must(openStore(loc, { clock }));
    const b = must(openStore(loc, { clock }));
    expect(must(takeClaim(a, "v1", "a", 120_000))).toEqual({ won: true });
    expect(must(takeClaim(b, "v1", "b", 120_000))).toMatchObject({ won: false, owner: "a" });
    now += 5_000;
    expect(must(finishClaim(a, "v1", "a", 30_000, { appended: 3 }))).toBe(true);
    now += 29_000;
    expect(must(takeClaim(b, "v1", "b", 120_000))).toMatchObject({ won: false, nextAt: "2026-10-15T12:00:35.000Z" });
    now += 1_000;
    expect(must(takeClaim(b, "v1", "b", 120_000))).toEqual({ won: true });
    expect(must(claimState(b, "v1"))).toMatchObject({ owner: "b", finished_at: null });
    a.close();
    b.close();
  });

  it("a claimant that died is replaced after its TTL, and its late finish changes nothing", () => {
    let now = Date.parse("2026-10-15T12:00:00.000Z");
    const k = kernelAt(file(), () => new Date(now));
    expect(must(takeClaim(k.store, "v1", "dead", 60_000))).toEqual({ won: true });
    now += 59_999;
    expect(must(takeClaim(k.store, "v1", "next", 60_000)).won).toBe(false);
    now += 1;
    expect(must(takeClaim(k.store, "v1", "next", 60_000)).won).toBe(true);
    expect(must(finishClaim(k.store, "v1", "dead", 1, {}))).toBe(false);
    k.close();
  });

  it("counts a source's consecutive failures and clears them on the next success", () => {
    const k = kernelAt(file());
    expect(must(recordSourceOutcome(k.store, "forge", "ENOENT"))).toBe(1);
    expect(must(recordSourceOutcome(k.store, "forge", "ENOENT"))).toBe(2);
    expect(must(recordSourceOutcome(k.store, "extract", null))).toBe(0);
    expect(must(sourceHealth(k.store)).map((h) => [h.source, h.fail_streak, h.last_error])).toEqual([
      ["extract", 0, null],
      ["forge", 2, "ENOENT"],
    ]);
    expect(must(recordSourceOutcome(k.store, "forge", null))).toBe(0);
    k.close();
  });
});
