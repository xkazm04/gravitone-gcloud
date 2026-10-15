import { afterAll, describe, expect, it } from "vitest";
import { err } from "@gt/domain/errors";
import { blobStore } from "../src/blob.ts";
import { liveEffects } from "../src/effects.ts";
import { eventsMigrations } from "../src/events.ts";
import { gone } from "../src/lease-core.ts";
import { acquire, assertFence, claimIn, leaseMigrations, pidAlive, processHolder, releaseIn, statusIn } from "../src/lease.ts";
import type { Store } from "../src/store.ts";
import { must, templateStores } from "./helpers.ts";

// What the shared spec (spec/lease.json) does not reach: the fence's atomicity
// with the write it guards, the schema's own refusal to lower a fence, the
// waiting loop, and this process's identity.

const now = Date.parse("2026-10-15T00:00:00.000Z");
const tpl = templateStores([eventsMigrations, leaseMigrations], { clock: () => new Date(now) });
afterAll(() => tpl.dispose());
const A = { bootId: "boot-a", pid: 101, host: "h1" };
const B = { bootId: "boot-b", pid: 102, host: "h1" };
const live = () => true;
const fx = (s: Store) => liveEffects(s, blobStore(`${s.location}.blobs`));

describe("gone", () => {
  it("probes a pid only on its own host, and tells an inherited pid by its bootId", () => {
    const dead = () => false;
    expect(gone(B, A, dead)).toBe(true);
    expect(gone(B, A, live)).toBe(false);
    expect(gone({ ...B, host: "h2" }, A, dead)).toBe(false);
    expect(gone({ ...A, bootId: "boot-old" }, A, live)).toBe(true);
    expect(gone(A, A, dead)).toBe(false);
  });
});

describe("the fence", () => {
  it("is checked inside the writer's transaction: a refused fence takes the write down with it", () => {
    const s = tpl.fresh();
    must(s.tx((t) => t.exec("CREATE TABLE renders (id TEXT PRIMARY KEY);")));
    const first = must(s.tx((t) => claimIn(t, { resource: "gpu.local", holder: A, ticket: "a", ttlS: 60, wait: false }, live)));
    if (first.kind !== "granted") throw new Error("expected a grant");
    must(s.tx((t) => releaseIn(t, "gpu.local", first.lease.fence)));
    must(s.tx((t) => claimIn(t, { resource: "gpu.local", holder: B, ticket: "b", ttlS: 60, wait: false }, live)));
    const zombie = s.tx((t) => {
      t.run("INSERT INTO renders VALUES ('frame-1')");
      assertFence(t, "gpu.local", first.lease.fence);
    });
    expect(zombie).toMatchObject({ ok: false, error: { code: "conflict", detail: "taken-over" } });
    expect(must(s.read((r) => r.all("SELECT id FROM renders")))).toEqual([]);
  });

  it("never decreases, whatever writes the table", () => {
    const s = tpl.fresh();
    must(s.tx((t) => claimIn(t, { resource: "gpu.local", holder: A, ticket: "a", ttlS: 60, wait: false }, live)));
    expect(s.tx((t) => t.run("UPDATE leases SET fence = 0 WHERE resource = 'gpu.local'"))).toMatchObject({ ok: false });
  });
});

describe("acquire", () => {
  it("waits in line and is granted when the holder releases", async () => {
    const s = tpl.fresh();
    const held = must(s.tx((t) => claimIn(t, { resource: "gpu.local", holder: A, ticket: "a", ttlS: 60, wait: false }, live)));
    if (held.kind !== "granted") throw new Error("expected a grant");
    let polls = 0;
    const got = await acquire(fx(s), "gpu.local", {
      holder: B,
      alive: live,
      waitMs: 10_000,
      now: () => 0,
      sleep: async () => {
        if (++polls === 2) must(s.tx((t) => releaseIn(t, "gpu.local", held.lease.fence)));
      },
    });
    expect(must(got)).toMatchObject({ holder: B, fence: 2 });
    expect(polls).toBe(2);
    expect(must(s.read((r) => statusIn(r, "gpu.local", B, live))).queue).toEqual([]);
  });

  it("runs out without hanging, leaves the queue and names the holder", async () => {
    const s = tpl.fresh();
    must(s.tx((t) => claimIn(t, { resource: "gpu.local", holder: A, ticket: "a", ttlS: 60, wait: false }, live)));
    let t = 0;
    const got = await acquire(fx(s), "gpu.local", { holder: B, alive: live, waitMs: 3, now: () => t++, sleep: async () => {} });
    expect(got).toMatchObject({ ok: false, error: { code: "unavailable" } });
    if (got.ok) throw new Error("expected unavailable");
    expect(got.error.message).toContain("h1/101 holds it");
    expect(must(s.read((r) => statusIn(r, "gpu.local", B, live))).queue).toEqual([]);
    const types = must(s.read((r) => r.all("SELECT type FROM events ORDER BY seq").map((e) => String(e["type"]))));
    expect(types).toEqual(["lease.claimed", "lease.queued", "lease.left"]);
  });

  it("a store busy past its timeout is contention while the wait has time left", async () => {
    const s = tpl.fresh();
    const live0 = fx(s);
    let busy = 2;
    const flaky: typeof live0 = {
      ...live0,
      tx: (name, fn) => (busy-- > 0 ? err("unavailable", "database is locked") : live0.tx(name, fn)),
    };
    const got = await acquire(flaky, "gpu.local", { holder: B, alive: live, waitMs: 10_000, now: () => 0, sleep: async () => {} });
    expect(must(got)).toMatchObject({ holder: B, fence: 1 });
    busy = 1;
    const once = await acquire(flaky, "gpu.local", { holder: A, alive: live });
    expect(once).toMatchObject({ ok: false, error: { code: "unavailable", message: "database is locked" } });
  });

  it("one try is one try: busy without queueing", async () => {
    const s = tpl.fresh();
    must(s.tx((t) => claimIn(t, { resource: "gpu.local", holder: A, ticket: "a", ttlS: 60, wait: false }, live)));
    expect(await acquire(fx(s), "gpu.local", { holder: B, alive: live })).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(must(s.read((r) => r.get("SELECT count(*) AS n FROM lease_waiters")?.["n"]))).toBe(0);
  });
});

describe("this process", () => {
  it("keeps one bootId for its lifetime and probes pids without signalling", () => {
    const h = processHolder();
    expect(processHolder()).toEqual(h);
    expect(h.pid).toBe(process.pid);
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(0)).toBe(false);
  });
});
