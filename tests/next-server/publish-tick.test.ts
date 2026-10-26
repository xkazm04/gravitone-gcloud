import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { parseJsonAt } from "@gt/domain/door";
import { ok } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Holder } from "@gt/domain/job";
import { INTERRUPTED_TEXT, type Channel } from "@gt/domain/slot";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { pidAlive } from "@gt/kernel/lease";
import { listPublicationsIn, listSlotsIn } from "@gt/kernel/slots/read";
import { createSlot } from "@gt/kernel/slots/write";
import type { ChannelAdapter } from "@gt/producers/publish/adapter";
import { publishTick } from "@gt/producers/publish/tick";

import { publishDeps, publishTimers } from "../../lib/producers/publish.ts";
import { timerRoster } from "../../workers/timers.ts";

// THE PUBLISH TICK AS THE WORKER RUNS IT (brief L62 §5), each promise across the boundary it is
// about: a publisher KILLED mid-upload (a real child process, gone with its claim held) leaves a
// slot the next tick fails "interrupted" and never uploads again; two PROCESSES ticking one store
// at once publish each due slot exactly once; a worker that was DOWN past the window finds the
// slot missed - never published late - and the slot's history says the worker was down.

const ROOT = process.cwd();
const url = (rel: string): string => pathToFileURL(path.join(ROOT, rel)).href;
const dir = mkdtempSync(path.join(tmpdir(), "gt-publish-tick-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const at = (min: number, from = NOW): string => new Date(from + min * 60_000).toISOString();
const OP: Actor = { kind: "operator", id: "op" };

let fetches = 0;
const realFetch = globalThis.fetch;
const ENV = ["PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR", "PUBLISH_STORE_DIR"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  fetches = 0;
  globalThis.fetch = (() => {
    fetches++;
    return Promise.reject(new Error("network refused by publish-tick.test"));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

let n = 0;
function fresh(clock?: () => Date): { file: string; k: Kernel } {
  const file = path.join(dir, `t-${++n}.sqlite`);
  const k = openKernel(file, { busyTimeoutMs: 30_000, ...(clock === undefined ? {} : { clock }) });
  if (!k.ok) throw k.error;
  return { file, k: k.value };
}
function slot(k: Kernel, item: string, when: string): string {
  const r = createSlot(k.store, { libraryItemId: item, channel: "youtube", at: when, title: "A cut", description: "probe", tags: [] }, OP);
  if (!r.ok) throw r.error;
  return r.value.slot.id;
}
const read = <T>(k: Kernel, fn: Parameters<Kernel["store"]["read"]>[0]): T => {
  const r = k.store.read(fn);
  if (!r.ok) throw r.error;
  return r.value as T;
};

// A publisher in a process of its own: a stub channel (no network), LIVE so its upload is entered.
// `kill` exits mid-upload after its first heartbeat, with its claim held and nothing recorded.
const CHILD = `
import { writeFileSync } from "node:fs";
import { openKernel } from "${url("packages/kernel/src/kernel.ts")}";
import { blobStore } from "${url("packages/kernel/src/blob.ts")}";
import { liveEffects } from "${url("packages/kernel/src/effects.ts")}";
import { armLive, DRY } from "${url("packages/kernel/src/dryrun.ts")}";
import { pidAlive, processHolder } from "${url("packages/kernel/src/lease.ts")}";
import { publishTick } from "${url("packages/producers/src/publish/tick.ts")}";
const [file, mode, marker, nowIso] = process.argv.slice(2);
const k = openKernel(file, { busyTimeoutMs: 30000 });
if (!k.ok) { process.stderr.write(k.error.message); process.exit(1); }
const store = k.value.store;
const adapter = {
  channel: "youtube",
  plan: async (s, publicationId) => ({ ok: true, value: { doc: { slotId: s.id, publicationId }, dryId: "dry-x" } }),
  upload: async (s, _p, hooks) => {
    await hooks.progress();
    writeFileSync(marker, s.id);
    process.exit(9);
  },
};
const live = armLive({ kind: "machine", id: "child" }, new Date().toISOString(), "publish-tick.test");
const deps = {
  store, fx: liveEffects(store, blobStore(file + ".blobs")), adapters: new Map([["youtube", adapter]]),
  mode: mode === "kill" ? live.value : DRY, holder: processHolder(), alive: pidAlive, clock: () => new Date(nowIso),
  facts: async (now) => ({ ok: true, value: { now, windowMs: 3600000, wired: new Set(["youtube"]), itemExists: () => true } }),
};
const r = await publishTick(deps, new Date(nowIso));
if (!r.ok) { process.stderr.write(r.error.message); process.exit(1); }
process.stdout.write(JSON.stringify({ published: r.value.outcomes.filter((o) => o.kind === "published").map((o) => o.slotId) }) + "\\n");
k.value.close();
`;
const childFile = path.join(dir, "publisher.child.mjs");
writeFileSync(childFile, CHILD);

function child(file: string, mode: "kill" | "dry", marker: string, nowIso: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", childFile, file, mode, marker, nowIso], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("exit", (code) => resolve({ code, out, err }));
  });
}

function counting(): { adapter: ChannelAdapter; uploads: () => number } {
  let uploads = 0;
  return {
    uploads: () => uploads,
    adapter: {
      channel: "youtube",
      plan: (s, publicationId) => Promise.resolve(ok({ doc: { slotId: s.id, publicationId }, dryId: "dry-x" })),
      upload: () => {
        uploads++;
        return Promise.resolve(ok({ platformId: "yt-again" }));
      },
    },
  };
}

describe("a publisher killed mid-upload", () => {
  it("leaves its slot to the next tick, which fails it 'interrupted' and never uploads it again", async () => {
    const { file, k } = fresh();
    const id = slot(k, "video:export:killed", new Date(Date.now() - 60_000).toISOString());
    k.close();
    const marker = path.join(dir, "upload-began");
    const c = await child(file, "kill", marker, new Date().toISOString());
    expect(c.code, c.err).toBe(9);
    expect(readFileSync(marker, "utf8")).toBe(id); // the upload had begun: bytes may have gone

    const again = openKernel(file);
    if (!again.ok) throw again.error;
    const ka = again.value;
    const c2 = counting();
    const deps = publishDeps({ store: ka.store, env: {}, adapters: new Map([["youtube", c2.adapter]]), alive: pidAlive });
    if (!deps.ok) throw deps.error;
    const d = { ...deps.value, facts: (now: number) => Promise.resolve(ok({ now, windowMs: 3_600_000, wired: new Set<Channel>(["youtube"]), itemExists: () => true })) };
    const t1 = await publishTick(d, new Date());
    expect(t1.ok && t1.value.interrupted).toEqual([id]);
    expect(t1.ok && t1.value.outcomes).toEqual([]);
    await publishTick(d, new Date());
    expect(c2.uploads()).toBe(0);
    const s = read<{ slot: { state: string; error?: string } }[]>(ka, (r) => listSlotsIn(r));
    expect(s.map((x) => [x.slot.state, x.slot.error])).toEqual([["failed", INTERRUPTED_TEXT]]);
    expect(read<unknown[]>(ka, (r) => listPublicationsIn(r))).toEqual([]);
    ka.close();
  }, 60_000);
});

describe("the tick's look at the next slot", () => {
  it("reads one row of the future schedule, not every future slot, to name the next time", async () => {
    const { k } = fresh();
    const first = at(60);
    for (let i = 0; i < 50; i++) slot(k, `video:export:future-${i}`, at(60 + i));
    const rows: number[] = [];
    const store: typeof k.store = {
      ...k.store,
      read: (fn) =>
        k.store.read((r) => fn({ at: r.at, get: (sql, ...p) => r.get(sql, ...p), all: (sql, ...p) => { const out = r.all(sql, ...p); if (/FROM slots WHERE at >= \?/.test(sql)) rows.push(out.length); return out; } })),
    };
    const c = counting();
    const deps = publishDeps({ store, env: {}, adapters: new Map([["youtube", c.adapter]]), alive: pidAlive });
    if (!deps.ok) throw deps.error;
    const d = { ...deps.value, facts: (now: number) => Promise.resolve(ok({ now, windowMs: 3_600_000, wired: new Set<Channel>(["youtube"]), itemExists: () => true })) };
    const t = await publishTick(d, new Date(NOW));
    expect(t.ok && t.value.next).toBe(first);
    expect(rows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    k.close();
  });
});

describe("two processes ticking one store", () => {
  it("publish each due slot exactly once between them", async () => {
    const { file, k } = fresh();
    const due = new Date(Date.now() - 60_000).toISOString();
    const ids = Array.from({ length: 20 }, (_, i) => slot(k, `video:export:e-${i}`, due));
    k.close();
    const nowIso = new Date().toISOString();
    const [a, b] = await Promise.all([child(file, "dry", path.join(dir, "unused-a"), nowIso), child(file, "dry", path.join(dir, "unused-b"), nowIso)]);
    expect([a.code, b.code], `${a.err}\n${b.err}`).toEqual([0, 0]);
    const doc = z.object({ published: z.array(z.string()) });
    const pa = parseJsonAt("child a", doc, a.out.trim());
    const pb = parseJsonAt("child b", doc, b.out.trim());
    if (!pa.ok || !pb.ok) throw new Error(`${a.out} ${b.out}`);
    const all = [...pa.value.published, ...pb.value.published];
    expect(all.length).toBe(20);
    expect([...new Set(all)].sort()).toEqual([...ids].sort());
    const after = openKernel(file);
    if (!after.ok) throw after.error;
    const pubs = read<{ slotId: string }[]>(after.value, (r) => listPublicationsIn(r));
    expect(pubs.length).toBe(20);
    const events = read<{ c: number }[]>(after.value, (r) => r.all("SELECT subject_id, count(*) AS c FROM events WHERE type = 'publish' GROUP BY subject_id").map((x) => ({ c: Number(x["c"]) })));
    expect(events.every((e) => e.c === 1)).toBe(true);
    after.value.close();
  }, 60_000);
});

describe("a worker that was down past the window", () => {
  function exportsDir(): string {
    const d = path.join(dir, `exports-${++n}`);
    mkdirSync(d);
    writeFileSync(path.join(d, "down-1.mp4"), Buffer.alloc(1000, 1));
    process.env["PUBLISH_EXPORTS_DIR"] = d;
    delete process.env["AD_EXPORT_DIR"];
    process.env["PUBLISH_STORE_DIR"] = path.join(dir, `pub-${n}`);
    return d;
  }

  async function downFor(crash: boolean) {
    exportsDir();
    let t = NOW;
    const clock = (): Date => new Date(t);
    const { k } = fresh(clock);
    const first: Holder = { bootId: "boot-first", pid: 7001, host: "render-box" };
    const second: Holder = { bootId: "boot-second", pid: 7002, host: "render-box" };
    const env = { GRAVITONE_DRY_ONLY: "1" };
    const roster = (h: Holder) => {
      const deps = publishDeps({ store: k.store, env, clock, holder: h, alive: (pid) => pid !== first.pid });
      if (!deps.ok) throw deps.error;
      return timerRoster(publishTimers(deps.value).slice(0, 1), { store: k.store, holder: h, alive: (pid) => pid !== first.pid, clock, say: () => undefined });
    };
    const a = roster(first);
    await a.once(); // the timer's last beat: NOW
    if (!crash) await a.stop(0);
    const id = slot(k, "video:export:down-1", at(10));
    t = NOW + 3 * 60 * 60_000; // three hours later the worker is back
    const lines = await roster(second).once();
    const s = read<{ slot: { id: string; state: string } }[]>(k, (r) => listSlotsIn(r));
    const ev = (type: string) => read<{ subject: string; data: string }[]>(k, (r) => r.all("SELECT subject_id, data FROM events WHERE type = ? ORDER BY seq", type).map((x) => ({ subject: String(x["subject_id"]), data: String(x["data"]) })));
    return { id, lines, s, ev, k };
  }

  it("finds the slot missed - never published late - and its history says the worker was down", async () => {
    const { id, lines, s, ev, k } = await downFor(false);
    expect(s.map((x) => [x.slot.id, x.slot.state])).toEqual([[id, "missed"]]);
    expect(read<unknown[]>(k, (r) => listPublicationsIn(r))).toEqual([]);
    expect(lines[0]?.gap).toEqual({ from: new Date(NOW).toISOString(), to: new Date(NOW + 3 * 3_600_000).toISOString() });
    expect(ev("timer.gap").map((e) => e.subject)).toEqual(["timer:publish-tick"]);
    // The miss itself says the worker was down - one event, one commit, nothing beside it.
    const marked = ev("slot.miss");
    expect(marked.map((e) => e.subject)).toEqual([id]);
    expect(marked[0]?.data).toContain(`"downtime":{"from":"${new Date(NOW).toISOString()}","to":"${new Date(NOW + 3 * 3_600_000).toISOString()}"}`);
    expect(ev("slot.miss-downtime")).toEqual([]);
    expect(fetches).toBe(0);
    k.close();
  });

  it("measures the gap from a crashed worker's last heartbeat as well (its lease left held)", async () => {
    const { id, s, ev, k } = await downFor(true);
    expect(s.map((x) => [x.slot.id, x.slot.state])).toEqual([[id, "missed"]]);
    expect(ev("lease.reclaimed").map((e) => e.subject)).toContain("timer:publish-tick");
    expect(ev("slot.miss").filter((e) => e.data.includes('"downtime"')).map((e) => e.subject)).toEqual([id]);
    k.close();
  });

  it("a slot due after the worker came back is published; one due before it went quiet is missed but not blamed on the gap", async () => {
    exportsDir();
    const { k } = fresh();
    const deps = publishDeps({ store: k.store, env: { GRAVITONE_DRY_ONLY: "1" } });
    if (!deps.ok) throw deps.error;
    const id = slot(k, "video:export:down-1", new Date(Date.now() - 60_000).toISOString());
    // Due before the worker went quiet: missed now, but not BECAUSE it was down - the last tick saw it.
    const before = slot(k, "video:export:down-1-early", new Date(Date.now() - 3.5 * 3_600_000).toISOString());
    const r = await publishTick(deps.value, new Date(), { gap: { from: new Date(Date.now() - 3 * 3_600_000).toISOString(), to: new Date().toISOString() } });
    expect(r.ok && r.value.outcomes.map((o) => [o.slotId, o.kind])).toEqual([[id, "published"]]);
    expect(r.ok && r.value.missed).toEqual([before]);
    expect(r.ok && r.value.downtime?.missed).toEqual([]);
    const misses = read<string[]>(k, (rd) => rd.all("SELECT data FROM events WHERE type = 'slot.miss'").map((x) => String(x["data"])));
    expect(misses).toHaveLength(1);
    expect(misses[0]).not.toContain("downtime");
    k.close();
  });
});

describe("the worker process", () => {
  it("`--once` runs the publish tick: a due slot is published (dry) by the real runner, its line on stderr, stdout left to job lines", () => {
    const exports = path.join(dir, "runner-exports");
    mkdirSync(exports);
    writeFileSync(path.join(exports, "run-1.mp4"), Buffer.alloc(1000, 2));
    const { file, k } = fresh();
    const id = slot(k, "video:export:run-1", new Date(Date.now() - 60_000).toISOString());
    k.close();
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", path.join(ROOT, "workers", "runner.mts"), "--once", "--json", "--lanes", "seat.text", "--idle-ms", "50"], {
      cwd: ROOT,
      env: { ...process.env, GRAVITONE_STORE_PATH: file, GRAVITONE_DRY_ONLY: "1", PUBLISH_EXPORTS_DIR: exports, AD_EXPORT_DIR: "", PUBLISH_STORE_DIR: path.join(dir, "runner-pub") },
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(r.stderr).toMatch(/timer publish-tick: succeeded - 1 slot/);
    const after = openKernel(file);
    if (!after.ok) throw after.error;
    const s = read<{ slot: { id: string; state: string } }[]>(after.value, (rd) => listSlotsIn(rd));
    expect(s.map((x) => [x.slot.id, x.slot.state])).toEqual([[id, "published"]]);
    after.value.close();
  }, 120_000);
});
