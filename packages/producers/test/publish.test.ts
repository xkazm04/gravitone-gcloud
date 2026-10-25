import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Holder, RunMode } from "@gt/domain/job";
import { INTERRUPTED_TEXT, type Channel } from "@gt/domain/slot";
import { blobStore } from "@gt/kernel/blob";
import { armLive, DRY } from "@gt/kernel/dryrun";
import { liveEffects } from "@gt/kernel/effects";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { getSlot, listPublicationsIn } from "@gt/kernel/slots/read";
import { sweep } from "@gt/kernel/slots/sweep";
import { createSlot } from "@gt/kernel/slots/write";

import type { ChannelAdapter, PublishPlan, UploadHooks } from "../src/publish/adapter.ts";
import { publishMode } from "../src/publish/mode.ts";
import { refreshMetrics } from "../src/publish/metrics.ts";
import { STOPPED_TEXT } from "../src/publish/publish.ts";
import { standingIn } from "../src/publish/standing.ts";
import { publishSlotNow, publishTick, type TickDeps } from "../src/publish/tick.ts";

// THE PUBLISH STEP over a real kernel on a scratch file, with a stub channel (the YouTube binding
// and the worker's timers are tests/next-server/publish-*.test.ts). What is pinned: a dry run is
// the kernel's - a would-call on the ledger whose digest IS the plan blob's sha256, the adapter's
// live act never entered, zero fetch; a channel's refusal lands on the slot verbatim and a throw
// does too; a claim lost mid-upload stops the sender and the sweep's verdict stands; a stop fails
// the claims it had not started, in words; publish-now claims through the sweep, never beside it.

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const at = (min: number): string => new Date(NOW + min * 60_000).toISOString();
const ITEM = "video:export:0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa";
const OP: Actor = { kind: "operator", id: "op" };
const ME: Holder = { bootId: "boot-me", pid: 4100, host: "render-box" };
const OTHER: Holder = { bootId: "boot-other", pid: 4300, host: "render-box" };

const dir = mkdtempSync(path.join(tmpdir(), "gt-publish-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let fetches = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetches = 0;
  globalThis.fetch = (() => {
    fetches++;
    return Promise.reject(new Error("network refused by publish.test"));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Calls = { plan: number; upload: number };

function stub(over: Partial<ChannelAdapter> = {}, calls: Calls = { plan: 0, upload: 0 }): ChannelAdapter {
  return {
    channel: "youtube",
    plan: (slot, publicationId, when): Promise<Result<PublishPlan>> => {
      calls.plan++;
      return Promise.resolve(ok({ doc: { slotId: slot.id, publicationId, writtenAt: when, requests: [{ method: "POST", url: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable" }] }, dryId: "dry-1234abcd" }));
    },
    upload: () => {
      calls.upload++;
      return Promise.resolve(ok({ platformId: "yt-1" }));
    },
    ...over,
  };
}

let n = 0;
function world(adapter: ChannelAdapter, mode: RunMode = DRY, holder: Holder = ME): { k: Kernel; deps: TickDeps } {
  const k = openKernel(path.join(dir, `p-${++n}.sqlite`), { clock: () => new Date(NOW) });
  if (!k.ok) throw k.error;
  const blobs = blobStore(path.join(dir, `blobs-${n}`));
  const deps: TickDeps = {
    store: k.value.store,
    fx: liveEffects(k.value.store, blobs),
    adapters: new Map<Channel, ChannelAdapter>([["youtube", adapter]]),
    mode,
    holder,
    alive: () => true,
    clock: () => new Date(NOW),
    pathOf: (ref) => {
      const p = blobs.pathOf(ref);
      return p.ok ? p.value : undefined;
    },
    facts: (now) => Promise.resolve(ok({ now, windowMs: 3_600_000, wired: new Set<Channel>(["youtube", "blog"]), itemExists: () => true })),
  };
  return { k: k.value, deps };
}

const live = (): RunMode => {
  const m = armLive(OP, new Date(NOW).toISOString(), "publish.test arms live");
  if (!m.ok) throw m.error;
  return m.value;
};

function slot(k: Kernel, over: { item?: string; at?: string } = {}): string {
  const r = createSlot(k.store, { libraryItemId: over.item ?? ITEM, channel: "youtube", at: over.at ?? at(-5), title: "A cut", description: "probe", tags: ["a"] }, OP);
  if (!r.ok) throw r.error;
  return r.value.slot.id;
}

const stateOf = (k: Kernel, id: string) => {
  const r = getSlot(k.store, id);
  if (!r.ok) throw r.error;
  return r.value.slot;
};

describe("a dry publish", () => {
  it("records dry with no platform id, keeps the plan as a blob whose sha256 is the would-call's digest, never enters upload, calls fetch zero times", async () => {
    const calls = { plan: 0, upload: 0 };
    const { k, deps } = world(stub({}, calls));
    const id = slot(k);
    const r = await publishTick(deps, new Date(NOW));
    expect(r.ok && r.value.outcomes.map((o) => o.kind)).toEqual(["published"]);
    const o = r.ok ? r.value.outcomes[0] : undefined;
    if (o?.kind !== "published") throw new Error("not published");
    expect(o.publication).toMatchObject({ slotId: id, channel: "youtube", dry: true, platformId: null, visibility: "private" });
    expect(stateOf(k, id)).toMatchObject({ state: "published", publicationId: o.publication.id });
    expect(calls).toEqual({ plan: 1, upload: 0 });
    const digest = k.store.read((rd) => rd.get("SELECT json_extract(data, '$.payloadDigest') AS d FROM events WHERE type = 'dryrun.would-call' AND subject_id = ?", id)?.["d"]);
    expect(digest.ok && digest.value).toBe(o.plan?.ref.sha256);
    expect(o.plan?.file).toBeDefined();
    expect(fetches).toBe(0);
    k.close();
  });

  it("one per item x channel x mode (v1 publisher.ts): a rehearsal does not block the live upload, a second rehearsal fails in v1's words before it plans", async () => {
    const calls = { plan: 0, upload: 0 };
    const { k, deps } = world(stub({}, calls));
    slot(k);
    const first = await publishTick(deps, new Date(NOW));
    const pubId = first.ok && first.value.outcomes[0]?.kind === "published" ? first.value.outcomes[0].publication.id : "";
    const again = slot(k);
    const r = await publishTick(deps, new Date(NOW));
    expect(r.ok && r.value.outcomes).toEqual([{ kind: "failed", slotId: again, error: `export 0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa is already published on youtube (publication ${pubId}, dry)` }]);
    expect(calls).toEqual({ plan: 1, upload: 0 });
    const liveSlot = slot(k);
    const l = await publishTick({ ...deps, mode: live() }, new Date(NOW));
    expect(l.ok && l.value.outcomes.map((o) => [o.slotId, o.kind])).toEqual([[liveSlot, "published"]]);
    expect(calls).toEqual({ plan: 2, upload: 1 });
    k.close();
  });

  it("names the publication in the plan it keeps, so the receipt and the record join", async () => {
    const { k, deps } = world(stub());
    slot(k);
    const r = await publishTick(deps, new Date(NOW));
    const o = r.ok ? r.value.outcomes[0] : undefined;
    if (o?.kind !== "published" || o.plan === undefined) throw new Error("no plan");
    const bytes = await blobStore(path.join(dir, `blobs-${n}`)).read(o.plan.ref);
    expect(bytes.ok && new TextDecoder().decode(bytes.value)).toContain(`"publicationId":"${o.publication.id}"`);
    k.close();
  });
});

describe("a failure lands on the slot, verbatim, and the tick goes on", () => {
  it("a channel's refusal is the slot's error word for word; a throwing adapter fails its slot and the next slot still publishes", async () => {
    let first = true;
    const adapter = stub({
      plan: (s, pub, when) => {
        if (first) {
          first = false;
          throw new Error("videos.insert (init) failed: 403 quotaExceeded The request cannot be completed");
        }
        return stub().plan(s, pub, when);
      },
    });
    const { k, deps } = world(adapter);
    const a = slot(k, { at: at(-6) });
    const b = slot(k, { item: "video:export:other", at: at(-5) });
    const r = await publishTick(deps, new Date(NOW));
    expect(r.ok && r.value.outcomes.map((o) => [o.slotId, o.kind])).toEqual([
      [a, "failed"],
      [b, "published"],
    ]);
    expect(stateOf(k, a)).toMatchObject({ state: "failed", error: "videos.insert (init) failed: 403 quotaExceeded The request cannot be completed" });
    k.close();
  });

  it("a live upload's refusal is recorded as the channel said it", async () => {
    const { k, deps } = world(stub({ upload: () => Promise.resolve(err("unauthenticated", "token request failed: invalid_grant")) }), live());
    const id = slot(k);
    await publishTick(deps, new Date(NOW));
    expect(stateOf(k, id)).toMatchObject({ state: "failed", error: "token request failed: invalid_grant" });
    k.close();
  });

  it("an adapter's optional methods that throw are caught too: a throwing clean-up keeps the publication and the tick goes on", async () => {
    const { k, deps } = world(stub({ forget: () => Promise.reject(new Error("EPERM: sessions/sl.json is locked")) }));
    const a = slot(k, { at: at(-6) });
    const b = slot(k, { item: "video:export:other", at: at(-5) });
    const r = await publishTick(deps, new Date(NOW));
    expect(r.ok && r.value.outcomes.map((o) => [o.slotId, o.kind, o.kind === "published" ? o.kept : undefined])).toEqual([
      [a, "published", "EPERM: sessions/sl.json is locked"],
      [b, "published", "EPERM: sessions/sl.json is locked"],
    ]);
    const m = world(stub({ stats: () => Promise.reject(new Error("videos.list (statistics) failed: 500")) }), live());
    slot(m.k);
    await publishTick(m.deps, new Date(NOW));
    const read = await refreshMetrics(m.deps, new Date(NOW));
    expect(read.ok ? "ok" : [read.error.code, read.error.message]).toEqual(["unavailable", "videos.list (statistics) failed: 500"]);
    k.close();
    m.k.close();
  });

  it("a channel with no adapter is refused in v1's words", async () => {
    const { k, deps } = world(stub());
    const r = createSlot(k.store, { libraryItemId: ITEM, channel: "tiktok", at: at(-5), title: "A cut", description: "", tags: [] }, OP);
    if (!r.ok) throw r.error;
    await publishTick({ ...deps, facts: (now) => Promise.resolve(ok({ now, windowMs: 3_600_000, wired: new Set<Channel>(["youtube", "tiktok"]), itemExists: () => true })) }, new Date(NOW));
    expect(stateOf(k, r.value.slot.id)).toMatchObject({ state: "failed", error: "tiktok has no publishing adapter" });
    k.close();
  });
});

describe("the claim", () => {
  it("a claim taken over mid-upload stops the sender: its heartbeat throws, nothing is recorded by it, the sweep's 'interrupted' stands", async () => {
    let progressed = 0;
    let stopped = "";
    const adapter = stub({
      upload: async (_s, _p, hooks: UploadHooks) => {
        await hooks.progress();
        progressed++;
        // Another process on this box judges this claimant dead and takes the lease over.
        const other = sweep(k.store, { now: NOW, windowMs: 3_600_000, wired: new Set(["youtube"]), itemExists: () => true }, { claim: false, holder: OTHER, alive: () => false });
        if (!other.ok) throw other.error;
        try {
          await hooks.progress();
          progressed++;
        } catch (e) {
          stopped = e instanceof Error ? e.message : String(e);
          return err("unavailable", `upload stopped: ${stopped}`);
        }
        return ok({ platformId: "yt-never" });
      },
    });
    const w = world(adapter, live());
    const k = w.k;
    const id = slot(k);
    const r = await publishTick(w.deps, new Date(NOW));
    expect(progressed).toBe(1);
    expect(stopped).toMatch(/fence 1 was lost/);
    expect(r.ok && r.value.outcomes.map((o) => o.kind)).toEqual(["lost"]);
    expect(stateOf(k, id)).toMatchObject({ state: "failed", error: INTERRUPTED_TEXT });
    const pubs = k.store.read((rd) => listPublicationsIn(rd));
    expect(pubs.ok && pubs.value).toEqual([]);
    k.close();
  });

  it("a live upload whose claim was lost before its record leaves a durable event naming the platform id", async () => {
    const adapter = stub({
      upload: () => {
        // The upload completes, and only then does another process judge this claimant dead.
        const other = sweep(k.store, { now: NOW, windowMs: 3_600_000, wired: new Set(["youtube"]), itemExists: () => true }, { claim: false, holder: OTHER, alive: () => false });
        if (!other.ok) throw other.error;
        return Promise.resolve(ok({ platformId: "yt-orphan-9" }));
      },
    });
    const w = world(adapter, live());
    const k = w.k;
    const id = slot(k);
    const r = await publishTick(w.deps, new Date(NOW));
    expect(r.ok && r.value.outcomes.map((o) => o.kind)).toEqual(["lost"]);
    expect(stateOf(k, id)).toMatchObject({ state: "failed", error: INTERRUPTED_TEXT });
    const rows = k.store.read((rd) => rd.all("SELECT type, subject_kind, subject_id, data FROM events WHERE type = 'publish.orphan'"));
    expect(rows.ok && rows.value.map((x) => [x["subject_kind"], x["subject_id"], parseJsonAt("publish.orphan data", z.unknown(), String(x["data"]))])).toEqual([["slot", id, ok({ channel: "youtube", platformId: "yt-orphan-9" })]]);
    k.close();
  });

  it("a stop between claims fails the claims it had not started, in words, and starts none of them", async () => {
    const calls = { plan: 0, upload: 0 };
    const ac = new AbortController();
    const adapter = stub(
      {
        plan: (s, pub, when) => {
          ac.abort();
          return stub().plan(s, pub, when);
        },
      },
      calls,
    );
    const { k, deps } = world(adapter);
    const a = slot(k, { at: at(-6) });
    const b = slot(k, { item: "video:export:b", at: at(-5) });
    const r = await publishTick(deps, new Date(NOW), { signal: ac.signal });
    expect(r.ok && r.value.outcomes.map((o) => [o.slotId, o.kind])).toEqual([
      [a, "published"],
      [b, "failed"],
    ]);
    expect(stateOf(k, b)).toMatchObject({ state: "failed", error: STOPPED_TEXT });
    k.close();
  });

  it("publish-now makes a missed slot due and claims it through the sweep; a published one is refused, not uploaded twice", async () => {
    const { k, deps } = world(stub());
    const id = slot(k, { at: at(-200) });
    const first = await publishTick(deps, new Date(NOW));
    expect(first.ok && first.value.missed).toEqual([id]);
    const now = await publishSlotNow(deps, id, new Date(NOW));
    expect(now.ok && now.value.kind).toBe("published");
    const again = await publishSlotNow(deps, id, new Date(NOW));
    expect(again.ok ? "published again" : again.error.code).toBe("conflict");
    const pubs = k.store.read((rd) => listPublicationsIn(rd));
    expect(pubs.ok && pubs.value.length).toBe(1);
    k.close();
  });
});

describe("the metrics pull", () => {
  it("reads nothing while publishing is dry, even over live publications, and books no zeros", async () => {
    let reads = 0;
    const adapter = stub({
      stats: () => {
        reads++;
        return Promise.resolve(ok([{ platformId: "yt-1", views: 3, likes: 0, comments: 0 }]));
      },
    });
    const w = world(adapter, live());
    slot(w.k);
    await publishTick(w.deps, new Date(NOW));
    const dry = await refreshMetrics({ ...w.deps, mode: DRY }, new Date(NOW));
    expect(dry.ok && dry.value).toEqual({ refreshed: 0, note: "1 live publication(s) not refreshed: publishing is in dry mode, which makes no network call" });
    expect(reads).toBe(0);
    const liveRead = await refreshMetrics(w.deps, new Date(NOW));
    expect(liveRead.ok && liveRead.value).toEqual({ refreshed: 1, note: null });
    expect(reads).toBe(1);
    w.k.close();
  });
});

describe("the channel's standing, from the ledger the publish writes", () => {
  it("a dry rehearsal is no attempt at the channel: it neither goes out nor clears a live failure", async () => {
    const failing = world(stub({ upload: () => Promise.resolve(err("unauthenticated", "token request failed: invalid_grant")) }), live());
    slot(failing.k);
    await publishTick(failing.deps, new Date(NOW));
    slot(failing.k, { item: "video:export:rehearsal" });
    const dry = await publishTick({ ...failing.deps, mode: DRY }, new Date(NOW));
    expect(dry.ok && dry.value.outcomes.map((o) => o.kind)).toEqual(["published"]);
    const s = failing.k.store.read((rd) => standingIn(rd, "youtube"));
    expect(s.ok && s.value).toEqual({ channel: "youtube", attempts: 1, lastAttemptAt: at(0), lastSuccessAt: null, lastError: "token request failed: invalid_grant", failuresSinceSuccess: 1 });
    // A live upload that lands is the channel working again.
    slot(failing.k, { item: "video:export:live-again" });
    await publishTick({ ...failing.deps, adapters: new Map<Channel, ChannelAdapter>([["youtube", stub()]]) }, new Date(NOW));
    const back = failing.k.store.read((rd) => standingIn(rd, "youtube"));
    expect(back.ok && back.value).toMatchObject({ attempts: 2, lastSuccessAt: at(0), failuresSinceSuccess: 0 });
    failing.k.close();
  });

  it("a channel only ever rehearsed has never gone out", async () => {
    const { k, deps } = world(stub());
    slot(k);
    await publishTick(deps, new Date(NOW));
    const s = k.store.read((rd) => standingIn(rd, "youtube"));
    expect(s.ok && s.value).toEqual({ channel: "youtube", attempts: 0, lastAttemptAt: null, lastSuccessAt: null, lastError: null, failuresSinceSuccess: 0 });
    k.close();
  });
});

describe("the mode", () => {
  const base = { by: OP, at: new Date(NOW).toISOString() };
  it("is dry unless PUBLISH_MODE=live with the credentials present in a process allowed to leave dry", () => {
    expect(publishMode({ ...base, requested: undefined, credentials: true, dryOnly: false })).toEqual(ok(DRY));
    expect(publishMode({ ...base, requested: "  ", credentials: true, dryOnly: false })).toEqual(ok(DRY));
    expect(publishMode({ ...base, requested: "live", credentials: false, dryOnly: false })).toEqual(ok(DRY));
    expect(publishMode({ ...base, requested: "live", credentials: true, dryOnly: true })).toEqual(ok(DRY));
    const l = publishMode({ ...base, requested: "live", credentials: true, dryOnly: false });
    expect(l.ok && l.value.kind === "live" && l.value.arm.by).toEqual(OP);
  });
  it("refuses a typo rather than reading it as either", () => {
    const r = publishMode({ ...base, requested: "lvie", credentials: true, dryOnly: false });
    expect(r.ok ? "accepted" : [r.error.code, r.error.message]).toEqual(["invalid", "PUBLISH_MODE must be 'dry' or 'live', got 'lvie'"]);
  });
});
