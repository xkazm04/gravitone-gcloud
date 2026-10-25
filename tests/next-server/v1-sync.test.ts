import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The registry's adapters import v1 readers whose chain needs the app's `@/`
// alias; these tests drive the sync with sources of their own.
vi.mock("../../lib/ledger/v1/sources.ts", () => ({ V1_SOURCES: [] }));

import { err, ok } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { claimState } from "@gt/kernel/ingest";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { facts, liveCtx } from "../../lib/ledger/v1/facts.ts";
import { BATCH, liveJobs, readAll, reconcile, syncSoon, syncV1, SYNC_CLAIM } from "../../lib/ledger/v1/sync.ts";
import type { IngestEvent, ProjectCtx, Projection, Source } from "../../lib/ledger/v1/types.ts";

// The sync driver over sources made here: what it appends, what it refuses to
// append twice, how one broken source is reported without stopping the rest,
// and how a reader's request for a fresh ledger never waits for the sync.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "fixture" });
const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
const store = () => {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  open.push(k.value);
  return k.value.store;
};

/** A source of `n` log facts on one record, its tally counting `tallied` of them. */
function logs(id: string, n: number, opts: { tallied?: number; note?: string; skipped?: Projection["skipped"] } = {}): Source<number> {
  return {
    id,
    read: async () => ok(n),
    project(count, c): Projection {
      const f = facts(id, c);
      const log = Array.from({ length: count }, (_, i) => ({ at: `2026-08-26T12:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`, msg: `${opts.note ?? "line"} ${i}` }));
      const events: IngestEvent[] = f.logged("r1", log, { actor: { kind: "machine", id }, subject: { kind: "run", id: "r1" } });
      return { events, live: [], weir: [], tally: { records: { "run.done": 1 }, facts: { "run.log": opts.tallied ?? count } }, skipped: opts.skipped ?? [] };
    },
  };
}
const broken = (id: string, words: string): Source<number> => ({ id, read: async () => err("unavailable", words), project: () => ({ events: [], live: [], weir: [], tally: { records: {}, facts: {} }, skipped: [] }) });
const ofType = (s: ReturnType<typeof store>, type: string) => {
  const p = queryEvents(s, { type: [type], limit: 100 });
  if (!p.ok) throw p.error;
  return p.value.events;
};

describe("liveJobs", () => {
  it("projects no log facts for Runs' render-time read, and the sync still does", async () => {
    const seen: number[] = [];
    const src: Source<number> = { ...logs("forge", 4), project: (n, c) => { const p = logs("forge", 4).project(n, c); seen.push(p.events.length); return p; } };
    await liveJobs([src], ctx());
    expect(seen).toEqual([0]);
    await readAll([src], ctx());
    expect(seen).toEqual([0, 4]);
  });

  it("a live-only context leaves a record's own facts and its tally alone", () => {
    const base = logs("forge", 3).project(3, ctx());
    const live = logs("forge", 3).project(3, liveCtx(ctx()));
    expect(live.tally).toEqual(base.tally);
    expect(base.events).toHaveLength(3);
  });
});

describe("syncV1", () => {
  it("appends each source's facts once; the second sync appends nothing", async () => {
    const s = store();
    const sources = [logs("forge", 3), logs("extract", 2)];
    const first = await syncV1(s, sources, ctx());
    expect(first.ok && first.value.sources.map((r) => [r.source, r.appended, r.existing])).toEqual([
      ["forge", 3, 0],
      ["extract", 2, 0],
    ]);
    const again = await syncV1(s, sources, ctx("2026-10-15T12:05:00.000Z"));
    expect(again.ok && again.value).toMatchObject({ appended: 0, failed: 0 });
    expect(again.ok && again.value.sources.map((r) => r.existing)).toEqual([3, 2]);
  });

  it("one unreadable source is reported in its own words and the others still sync", async () => {
    const s = store();
    const sources = [broken("strips", "ENOENT: no such file or directory, scandir 'foundry-out/strips'"), logs("forge", 2)];
    const r = await syncV1(s, sources, ctx());
    if (!r.ok) throw r.error;
    expect(r.value.sources[0]).toMatchObject({ source: "strips", appended: 0, streak: 1, failed: { class: "read", error: "ENOENT: no such file or directory, scandir 'foundry-out/strips'" } });
    expect(r.value.sources[1]).toMatchObject({ source: "forge", appended: 2 });
    expect(ofType(s, "ingest.fail").map((e) => e.data)).toEqual([{ class: "read", error: "ENOENT: no such file or directory, scandir 'foundry-out/strips'", src: "fixture" }]);
  });

  it("a failure that persists is one event and a growing streak; a new failure is a new event", async () => {
    const s = store();
    await syncV1(s, [broken("strips", "EACCES")], ctx());
    const second = await syncV1(s, [broken("strips", "EACCES")], ctx("2026-10-15T12:01:00.000Z"));
    expect(second.ok && second.value.sources[0]?.streak).toBe(2);
    expect(ofType(s, "ingest.fail")).toHaveLength(1);
    await syncV1(s, [broken("strips", "EIO")], ctx("2026-10-15T12:02:00.000Z"));
    expect(ofType(s, "ingest.fail")).toHaveLength(2);
    const healed = await syncV1(s, [logs("strips", 1)], ctx("2026-10-15T12:03:00.000Z"));
    expect(healed.ok && healed.value.sources[0]?.streak).toBe(0);
  });

  it("a projection that throws is a `project` failure, not an escaped exception", async () => {
    const s = store();
    const bad: Source<number> = { ...logs("forge", 1), project: () => { throw new TypeError("Cannot read properties of undefined (reading 'log')"); } };
    const r = await syncV1(s, [bad], ctx());
    expect(r.ok && r.value.sources[0]?.failed).toEqual({ class: "project", error: "Cannot read properties of undefined (reading 'log')" });
  });

  it("a record the reader skipped is on the ledger as ingest.skip, with the reason", async () => {
    const s = store();
    await syncV1(s, [logs("dojo", 1, { skipped: [{ id: "2026-09-06-state-coupling", reason: "dojo cycle: log.0: expected object" }] })], ctx());
    expect(ofType(s, "ingest.skip").map((e) => e.data)).toEqual([{ record: "2026-09-06-state-coupling", reason: "dojo cycle: log.0: expected object", src: "fixture" }]);
  });

  it("appends past one batch in several transactions, and keeps what landed before a refused batch", async () => {
    const s = store();
    const many = await syncV1(s, [logs("forge", BATCH * 2 + 50)], ctx());
    expect(many.ok && many.value.sources[0]?.appended).toBe(BATCH * 2 + 50);
    const poisoned: Source<number> = {
      ...logs("extract", BATCH + 1),
      project(n, c) {
        const p = logs("extract", n).project(n, c);
        const last = p.events.at(-1);
        // An event the ledger's door refuses, in the second batch only.
        return last === undefined ? p : { ...p, events: [...p.events.slice(0, -1), { ...last, type: "Not A Type" }] };
      },
    };
    const r = await syncV1(s, [poisoned], ctx());
    expect(r.ok && r.value.sources[0]).toMatchObject({ appended: BATCH, failed: { class: "append" } });
  });

  it("reports a key that came back with different content as drift, and appends nothing for it", async () => {
    const s = store();
    await syncV1(s, [logs("forge", 2)], ctx());
    const edited: Source<number> = {
      ...logs("forge", 2),
      project(n, c) {
        const p = logs("forge", n).project(n, c);
        return { ...p, events: p.events.map((e) => ({ ...e, data: { ...e.data, note: "edited after the fact" } })) };
      },
    };
    const r = await syncV1(s, [edited], ctx());
    expect(r.ok && r.value.sources[0]).toMatchObject({ appended: 0, existing: 2, drifted: 2 });
  });
});

describe("reconcile", () => {
  it("equal counts reconcile; a fact the projection dropped is named with both figures", async () => {
    const s = store();
    const sources = [logs("forge", 4), logs("extract", 3, { tallied: 4 })];
    await syncV1(s, sources, ctx());
    const r = reconcile(s, await readAll(sources, ctx()), true);
    if (!r.ok) throw r.error;
    expect(r.value.ok).toBe(false);
    expect(r.value.sources.map((x) => [x.source, x.ok, x.differences])).toEqual([
      ["forge", true, []],
      ["extract", false, [{ type: "run.log", v1: 4, ledger: 3 }]],
    ]);
  });

  it("history the store no longer holds is not a difference, except under --exact", async () => {
    const s = store();
    await syncV1(s, [logs("forge", 3, { note: "old" })], ctx());
    const now = [logs("forge", 2, { note: "new" })];
    await syncV1(s, now, ctx());
    const loose = reconcile(s, await readAll(now, ctx()), false);
    const exact = reconcile(s, await readAll(now, ctx()), true);
    expect(loose.ok && loose.value.ok).toBe(true);
    expect(exact.ok && exact.value.sources[0]?.differences).toEqual([{ type: "run.log", v1: 2, ledger: 5 }]);
  });
});

describe("the read side", () => {
  it("syncSoon starts one sync and returns at once; a second asker inside the interval starts none", async () => {
    const s = store();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow: Source<number> = { ...logs("forge", 2), read: async () => (await gate, ok(2)) };
    const first = syncSoon(s, [slow], ctx());
    expect(first).toEqual({ ok: true, value: { started: true } });
    // The render that asked is already past this line; nothing is on the ledger yet.
    expect(ofType(s, "run.log")).toHaveLength(0);
    expect(syncSoon(s, [slow], ctx())).toMatchObject({ ok: true, value: { started: false } });
    release();
    await vi.waitFor(() => {
      const c = claimState(s, SYNC_CLAIM);
      expect(c.ok && c.value?.finished_at).toBeTruthy();
    });
    expect(ofType(s, "run.log")).toHaveLength(2);
    // Finished, and the interval after the finish has not passed: still none.
    expect(syncSoon(s, [slow], ctx())).toMatchObject({ ok: true, value: { started: false } });
  });

  it("liveJobs gathers every source's live work and piles, and names a source it could not read", async () => {
    const live: Source<number> = {
      ...logs("forge", 0),
      project: () => ({
        events: [],
        live: [{ source: "forge", id: "dock", title: "forge dock", lane: "gpu.local", media: "image", state: "running", href: "/foundry" }],
        weir: [{ source: "forge", id: "heist", title: "forge heist", media: "image", kind: "cull", decided: 1, pending: 3, href: "/foundry" }],
        tally: { records: {}, facts: {} },
        skipped: [],
      }),
    };
    const r = await liveJobs([live, broken("strips", "EACCES")], ctx());
    expect(r.jobs.map((j) => j.id)).toEqual(["dock"]);
    expect(r.weir.map((w) => w.id)).toEqual(["heist"]);
    expect(r.failures).toEqual([{ source: "strips", error: "read: EACCES" }]);
  });
});
