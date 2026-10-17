import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Result } from "@gt/domain/errors";
import { verify } from "../src/events.ts";
import { snapshotOf } from "../src/lease.ts";
import { cancelSlot, createSlot, moveSlot, publishNow } from "../src/slots/write.ts";
import { getSlot, listSlots } from "../src/slots/read.ts";
import { claimResource } from "../src/slots/schema.ts";
import { sweep } from "../src/slots/sweep.ts";
import { must, scratch } from "./helpers.ts";
import { at, draft, eventTypes, facts, ITEM, ITEM_B, ME, NOW, OP, WINDOW_MS, world, type World } from "./slots.fixture.ts";

// THE OPERATOR'S VERBS AND THE SWEEP'S RULES - every case v1's publish probe pinned for
// lib/publish/schedule.ts (tests/golden-path/publish.probe.spec.ts: schedule, transitions,
// missed, drift, "a GET-style read never claims"), here against the kernel store. The
// at-most-once cases (concurrent sweeps, a dead claimant, the fence) are slots.claim.test.ts
// and slots.process.test.ts.

const tmp = scratch("slots");
afterAll(() => tmp.dispose());
let open: World[] = [];
afterEach(() => {
  for (const w of open) w.k.close();
  open = [];
});
let n = 0;
const fresh = (): World => {
  const w = world(tmp.dir, `s${++n}`);
  open.push(w);
  return w;
};

const code = <T>(r: Result<T>): string | null => (r.ok ? null : r.error.code);
const tick = (w: World, over: Parameters<typeof facts>[0] = {}) => must(sweep(w.k.store, facts(over), { claim: true, holder: ME, alive: () => true }));

describe("creating a slot", () => {
  it("refuses an unwired channel, an unknown item and a second slot for the same item on a channel; another channel is free", () => {
    const { k } = fresh();
    const ready = facts({ unwired: ["tiktok"], missing: ["video:export:nope"] });
    expect(code(createSlot(k.store, draft({ channel: "tiktok" }), OP, ready))).toBe("conflict");
    expect(code(createSlot(k.store, draft({ libraryItemId: "video:export:nope" }), OP, ready))).toBe("conflict");
    const s = must(createSlot(k.store, draft({ at: at(60) }), OP, ready));
    expect(s.slot).toMatchObject({ state: "scheduled", channel: "youtube", libraryItemId: ITEM });
    for (const key of ["publicationId", "error", "missedAt", "claim", "drift"]) expect(key in s.slot).toBe(false);
    const again = createSlot(k.store, draft(), OP, ready);
    expect(code(again)).toBe("conflict");
    expect(again.ok ? "" : again.error.message).toContain(s.slot.id);
    expect(must(createSlot(k.store, draft({ channel: "instagram" }), OP, ready)).slot.channel).toBe("instagram");
    expect(code(createSlot(k.store, draft({ title: "  " }), OP))).toBe("invalid");
    expect(eventTypes(k, s.slot.id)).toEqual(["slot.create"]);
    expect(must(verify(k.store)).state).toBe("intact");
  });
});

describe("moving and cancelling", () => {
  it("a move reschedules; cancel is soft and idempotent; a cancelled slot never comes back and frees its item", () => {
    const { k } = fresh();
    const s = must(createSlot(k.store, draft({ at: at(60) }), OP)).slot;
    expect(must(moveSlot(k.store, s.id, at(120), OP, { now: NOW, windowMs: WINDOW_MS })).slot).toMatchObject({ state: "scheduled", at: at(120) });
    expect(must(cancelSlot(k.store, s.id, OP)).slot.state).toBe("cancelled");
    expect(must(cancelSlot(k.store, s.id, OP)).slot.state).toBe("cancelled");
    expect(must(listSlots(k.store))).toHaveLength(1);
    expect(code(moveSlot(k.store, s.id, at(30), OP, { now: NOW, windowMs: WINDOW_MS }))).toBe("conflict");
    expect(code(moveSlot(k.store, "sl-missing", at(30), OP, { now: NOW, windowMs: WINDOW_MS }))).toBe("not-found");
    expect(must(createSlot(k.store, draft({ at: at(60) }), OP)).slot.state).toBe("scheduled");
    expect(eventTypes(k, s.id)).toEqual(["slot.create", "slot.schedule", "slot.cancel"]);
  });

  it("a verb on a stale revision writes nothing and answers conflict", () => {
    const { k } = fresh();
    const s = must(createSlot(k.store, draft({ at: at(60) }), OP));
    must(moveSlot(k.store, s.slot.id, at(90), OP, { now: NOW, windowMs: WINDOW_MS }, { baseRev: s.rev }));
    expect(code(cancelSlot(k.store, s.slot.id, OP, { baseRev: s.rev }))).toBe("conflict");
    expect(must(getSlot(k.store, s.slot.id)).slot.state).toBe("scheduled");
  });

  it("moving onto another slot's item and channel is a clash", () => {
    const { k } = fresh();
    const a = must(createSlot(k.store, draft({ at: at(-90) }), OP)).slot;
    tick({ k, file: "", setClock: () => {} });
    expect(must(getSlot(k.store, a.id)).slot.state).toBe("missed");
    must(createSlot(k.store, draft({ at: at(30) }), OP));
    const back = moveSlot(k.store, a.id, at(45), OP, { now: NOW, windowMs: WINDOW_MS });
    expect(code(back)).toBe("conflict");
  });
});

describe("the missed window - never published late", () => {
  it("overdue past the window is missed with missedAt and never claimed; the slot reschedules only out of the window", () => {
    const w = fresh();
    const late = must(createSlot(w.k.store, draft({ at: at(-61) }), OP)).slot;
    const r = tick(w);
    expect(r.claimed).toHaveLength(0);
    expect(r.missed).toEqual([late.id]);
    expect(must(getSlot(w.k.store, late.id)).slot).toMatchObject({ state: "missed", missedAt: new Date(NOW).toISOString() });
    expect(code(moveSlot(w.k.store, late.id, at(-61), OP, { now: NOW, windowMs: WINDOW_MS }))).toBe("conflict");
    const back = must(moveSlot(w.k.store, late.id, at(30), OP, { now: NOW, windowMs: WINDOW_MS })).slot;
    expect(back.state).toBe("scheduled");
    expect("missedAt" in back).toBe(false);
    expect(eventTypes(w.k, late.id)).toEqual(["slot.create", "slot.miss", "slot.schedule"]);
  });

  it("the window is a parameter: 90 minutes late is on time under 120, and exactly at the edge is still on time", () => {
    const w = fresh();
    must(createSlot(w.k.store, draft({ at: at(-90) }), OP));
    const edge = must(createSlot(w.k.store, draft({ libraryItemId: ITEM_B, at: at(-60) }), OP)).slot;
    expect(tick(w, { windowMs: 120 * 60_000 }).claimed).toHaveLength(2);
    expect(must(getSlot(w.k.store, edge.id)).slot.state).toBe("publishing");
  });

  it("a slot not yet due is left alone", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(1) }), OP)).slot;
    expect(tick(w)).toMatchObject({ claimed: [], missed: [] });
    expect(must(getSlot(w.k.store, s.id)).slot.state).toBe("scheduled");
  });
});

describe("drift", () => {
  it("a slot whose item vanished is annotated and never fired; the reason clears itself when the item returns", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const r = tick(w, { missing: [ITEM] });
    expect(r).toMatchObject({ drifted: [s.id], claimed: [] });
    expect(must(getSlot(w.k.store, s.id)).slot).toMatchObject({ state: "scheduled", drift: "export_missing" });
    expect(tick(w, { missing: [ITEM] }).drifted).toEqual([]);
    const cleared = must(sweep(w.k.store, facts(), { claim: false, holder: ME }));
    expect(cleared.cleared).toEqual([s.id]);
    expect("drift" in must(getSlot(w.k.store, s.id)).slot).toBe(false);
    expect(eventTypes(w.k, s.id)).toEqual(["slot.create", "slot.drift", "slot.drift-clear"]);
  });

  it("an unwired channel drifts too, and a drifted slot still goes missed past the window, keeping its reason", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(-61) }), OP)).slot;
    expect(tick(w, { unwired: ["youtube"] })).toMatchObject({ drifted: [s.id], missed: [s.id], claimed: [] });
    expect(must(getSlot(w.k.store, s.id)).slot).toMatchObject({ state: "missed", drift: "channel_not_wired" });
  });
});

describe("reads never sweep", () => {
  it("a slot long overdue reads scheduled until a sweep runs, and no read takes a claim", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(-600) }), OP)).slot;
    w.setClock(NOW + 3_600_000);
    expect(must(getSlot(w.k.store, s.id)).slot.state).toBe("scheduled");
    expect(must(listSlots(w.k.store))[0]?.slot.state).toBe("scheduled");
    expect(eventTypes(w.k, s.id)).toEqual(["slot.create"]);
    expect(must(w.k.store.read((r) => snapshotOf(r, claimResource(s.id)))).row).toBeUndefined();
  });

  it("a sweep that is not a tick marks missed but claims nothing", () => {
    const w = fresh();
    must(createSlot(w.k.store, draft({ at: at(-5) }), OP));
    expect(must(sweep(w.k.store, facts(), { claim: false, holder: ME })).claimed).toEqual([]);
  });
});

describe("publish now", () => {
  it("overrides the window for a missed slot but is never a claim: the next tick claims it", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(-61) }), OP)).slot;
    tick(w);
    const now = must(publishNow(w.k.store, s.id, OP, { now: NOW }));
    expect(now.slot).toMatchObject({ state: "scheduled", at: new Date(NOW).toISOString() });
    expect(now.fence).toBeUndefined();
    expect(must(w.k.store.read((r) => snapshotOf(r, claimResource(s.id)))).row).toBeUndefined();
    expect(tick(w).claimed.map((c) => c.slot.id)).toEqual([s.id]);
    expect(eventTypes(w.k, s.id)).toEqual(["slot.create", "slot.miss", "slot.publish-now", "slot.claim"]);
  });

  it("is refused for a drifted slot, with the drift as its detail, and for a slot that went out", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(30) }), OP)).slot;
    const r = publishNow(w.k.store, s.id, OP, { now: NOW, ready: facts({ missing: [ITEM] }) });
    expect(r.ok ? null : [r.error.code, r.error.detail]).toEqual(["refused", "export_missing"]);
    must(publishNow(w.k.store, s.id, OP, { now: NOW }));
    tick(w);
    expect(code(publishNow(w.k.store, s.id, OP, { now: NOW }))).toBe("conflict");
  });
});
