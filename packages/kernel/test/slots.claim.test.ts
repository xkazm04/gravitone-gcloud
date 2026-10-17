import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Result } from "@gt/domain/errors";
import { INTERRUPTED_TEXT } from "@gt/domain/slot";
import { gateFacts } from "../src/parts/gates.ts";
import { snapshotOf } from "../src/lease.ts";
import { heartbeatClaim, publishByAct, recordFailure, recordMetric, recordPublication } from "../src/slots/outcome.ts";
import { getSlot, listPublicationsIn, slottedIn, snapshotsIn } from "../src/slots/read.ts";
import { claimResource } from "../src/slots/schema.ts";
import { CLAIM_TTL_S, sweep } from "../src/slots/sweep.ts";
import { cancelSlot, createSlot, moveSlot, publishNow } from "../src/slots/write.ts";
import { must, scratch } from "./helpers.ts";
import { aliveBut, at, DEAD, draft, eventTypes, facts, ITEM_B, ME, NOW, OP, PUBLISHER, WINDOW_MS, world, type World } from "./slots.fixture.ts";

// AT-MOST-ONCE, in one process: the claim is a lease on `slot:<id>`, the outcome is fenced by
// it, a dead or lapsed claimant is failed "interrupted" and never re-fired, and a claimant the
// sweep gave up on cannot overwrite that verdict. Two real processes: slots.process.test.ts.

const tmp = scratch("slotclaim");
afterAll(() => tmp.dispose());
let open: World[] = [];
afterEach(() => {
  for (const w of open) w.k.close();
  open = [];
});
let n = 0;
const fresh = (): World => {
  const w = world(tmp.dir, `c${++n}`);
  open.push(w);
  return w;
};
const code = <T>(r: Result<T>): string | null => (r.ok ? null : r.error.code);
const LIVE = { platformId: "yt-abc", visibility: "private" as const, dry: false, publishedAt: at(1) };

describe("the claim", () => {
  it("a due slot is claimed once under a lease naming its holder; a second sweep finds nothing to claim", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const first = must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true }));
    expect(first.claimed).toHaveLength(1);
    const c = first.claimed[0]!;
    expect(c.slot).toMatchObject({ id: s.id, state: "publishing", claim: { holder: ME } });
    const lease = must(w.k.store.read((r) => snapshotOf(r, claimResource(s.id)))).row?.held;
    expect(lease).toMatchObject({ holder: ME, fence: c.fence, ttlS: CLAIM_TTL_S });
    expect(must(getSlot(w.k.store, s.id)).fence).toBe(c.fence);
    expect(must(sweep(w.k.store, facts(), { claim: true, holder: { ...ME, pid: 4101, bootId: "other" }, alive: () => true })).claimed).toEqual([]);
    expect(eventTypes(w.k, s.id)).toEqual(["slot.create", "slot.claim"]);
  });

  it("the fenced claimant records the publication: published, one publication, lease released; a second record is refused", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const c = must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).claimed[0]!;
    const done = must(recordPublication(w.k.store, s.id, c.fence, LIVE, PUBLISHER));
    expect(done.slot.slot).toMatchObject({ state: "published", publicationId: done.publication.id });
    expect("claim" in done.slot.slot).toBe(false);
    expect(done.slot.fence).toBeUndefined();
    expect(done.publication).toMatchObject({ slotId: s.id, channel: "youtube", dry: false, platformId: "yt-abc" });
    expect(must(w.k.store.read((r) => snapshotOf(r, claimResource(s.id)))).row?.held).toBeUndefined();
    expect(code(recordPublication(w.k.store, s.id, c.fence, LIVE, PUBLISHER))).toBe("conflict");
    expect(must(w.k.store.read((r) => listPublicationsIn(r)))).toHaveLength(1);
    expect(code(publishNow(w.k.store, s.id, OP, { now: NOW }))).toBe("conflict");
    expect(must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).claimed).toEqual([]);
    expect(eventTypes(w.k, done.publication.id)).toEqual(["publish"]);
  });

  it("a channel's failure is kept verbatim, and cancelling the failed slot keeps it", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const c = must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).claimed[0]!;
    const words = "The request cannot be completed because you have exceeded your quota.";
    expect(must(recordFailure(w.k.store, s.id, c.fence, words, PUBLISHER)).slot).toMatchObject({ state: "failed", error: words });
    expect(must(cancelSlot(w.k.store, s.id, OP)).slot).toMatchObject({ state: "cancelled", error: words });
  });
});

describe("a claimant that is gone", () => {
  it("a dead holder's slot is failed 'interrupted', never re-fired, and its late write is refused by the fence", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const c = must(sweep(w.k.store, facts(), { claim: true, holder: DEAD, alive: () => true })).claimed[0]!;
    const r = must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: aliveBut(DEAD.pid) }));
    expect(r.interrupted).toEqual([s.id]);
    expect(r.claimed).toEqual([]);
    expect(must(getSlot(w.k.store, s.id)).slot).toMatchObject({ state: "failed", error: INTERRUPTED_TEXT });
    expect(must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: aliveBut(DEAD.pid) })).claimed).toEqual([]);
    // the zombie: slow, not dead - its fence no longer holds, so the verdict stands
    expect(code(recordPublication(w.k.store, s.id, c.fence, LIVE, PUBLISHER))).toBe("conflict");
    expect(code(heartbeatClaim(w.k.store, s.id, c.fence))).toBe("conflict");
    expect(must(getSlot(w.k.store, s.id)).slot.state).toBe("failed");
    expect(must(w.k.store.read((r) => listPublicationsIn(r)))).toHaveLength(0);
    // a person reschedules it; only then is it claimed again
    must(moveSlot(w.k.store, s.id, at(1), OP, { now: NOW, windowMs: WINDOW_MS }));
    w.setClock(NOW + 2 * 60_000);
    expect(must(sweep(w.k.store, facts({ now: NOW + 2 * 60_000 }), { claim: true, holder: ME, alive: () => true })).claimed.map((x) => x.slot.id)).toEqual([s.id]);
  });

  it("a live holder whose heartbeat lapsed past the TTL is interrupted too; a heartbeat keeps it", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const other = { ...ME, host: "other-box" };
    const c = must(sweep(w.k.store, facts(), { claim: true, holder: other, alive: () => true })).claimed[0]!;
    w.setClock(NOW + (CLAIM_TTL_S - 10) * 1000);
    must(heartbeatClaim(w.k.store, s.id, c.fence));
    w.setClock(NOW + (2 * CLAIM_TTL_S - 20) * 1000);
    expect(must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).interrupted).toEqual([]);
    w.setClock(NOW + (2 * CLAIM_TTL_S + 10) * 1000);
    expect(must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).interrupted).toEqual([s.id]);
  });
});

describe("blog slots go out by an act", () => {
  it("the tick never claims a blog slot; the approve's act publishes it with its pull request", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ channel: "blog", libraryItemId: "article:run-7f3a" }), OP)).slot;
    expect(must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).claimed).toEqual([]);
    const pr = { platformId: "412", url: "https://github.com/acme/ai-registry/pull/412", dry: false, publishedAt: at(0) };
    const done = must(publishByAct(w.k.store, s.id, pr, OP));
    expect(done.slot.slot.state).toBe("published");
    expect(done.publication).toMatchObject({ channel: "blog", url: pr.url });
    expect(eventTypes(w.k, done.publication.id)).toEqual(["publish"]);
    const yt = must(createSlot(w.k.store, draft(), OP)).slot;
    expect(code(publishByAct(w.k.store, yt.id, pr, OP))).toBe("refused");
  });
});

describe("metrics", () => {
  it("a live publication takes readings (null = unmeasured); a dry one is refused", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const dry = must(createSlot(w.k.store, draft({ libraryItemId: ITEM_B }), OP)).slot;
    const claimed = must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).claimed;
    const fenceOf = (id: string) => claimed.find((c) => c.slot.id === id)!.fence;
    const live = must(recordPublication(w.k.store, s.id, fenceOf(s.id), LIVE, PUBLISHER)).publication;
    const plan = must(recordPublication(w.k.store, dry.id, fenceOf(dry.id), { platformId: null, visibility: "private", dry: true, publishedAt: at(1) }, PUBLISHER)).publication;
    const reading = { publicationId: live.id, at: at(60), views: 12, watchTimeS: null, avgViewDurationS: null, likes: 1, comments: null, shares: null, subsDelta: null };
    must(recordMetric(w.k.store, reading, PUBLISHER));
    expect(must(w.k.store.read((r) => snapshotsIn(r, live.id)))).toEqual([reading]);
    expect(code(recordMetric(w.k.store, { ...reading, publicationId: plan.id }, PUBLISHER))).toBe("refused");
    expect(eventTypes(w.k, live.id)).toEqual(["publish", "metric.snapshot"]);
  });
});

describe("the plan's slot part", () => {
  it("is placed while a slot for it holds its item, and waits again once that slot is cancelled", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(60), partId: "slot:cut" }), OP)).slot;
    const placed = () => must(w.k.store.read((r) => [slottedIn(r, "slot:cut"), gateFacts(NOW).slottedOf?.("slot:cut", r)]));
    expect(placed()).toEqual([true, true]);
    must(cancelSlot(w.k.store, s.id, OP));
    expect(placed()).toEqual([false, false]);
  });
});
