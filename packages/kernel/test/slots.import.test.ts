import { afterAll, afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import { INTERRUPTED_TEXT } from "@gt/domain/slot";
import { importV1Calendar } from "../src/slots/import.ts";
import { getSlot, listPublicationsIn, listSlots, snapshotsIn } from "../src/slots/read.ts";
import { sweep } from "../src/slots/sweep.ts";
import { must, scratch } from "./helpers.ts";
import { eventTypes, facts, ME, world, type World } from "./slots.fixture.ts";

// v1's calendar files into the slot tables: shape changes said out loud, history not
// re-emitted, a dry run that writes nothing and agrees with the real one, and idempotence.

const tmp = scratch("slotimport");
afterAll(() => tmp.dispose());
let open: World[] = [];
afterEach(() => {
  for (const w of open) w.k.close();
  open = [];
});
let n = 0;
const fresh = (): World => {
  const w = world(tmp.dir, `i${++n}`);
  open.push(w);
  return w;
};

const v1Slot = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  projectId: "proj-1",
  exportId: `exp-${id}`,
  channelId: "youtube",
  publishAt: "2026-10-06T12:00:00.000Z",
  status: "scheduled",
  title: `Cut ${id}`,
  description: "",
  tags: [],
  publicationId: null,
  error: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  missedAt: null,
  ...over,
});

const calendar = () => ({
  schedule: {
    slots: [
      v1Slot("sl-a"),
      v1Slot("sl-b", { status: "published", publicationId: "pub-b", publishAt: "2026-10-02T12:00:00.000Z" }),
      v1Slot("sl-c", { status: "scheduled", error: "the export this slot publishes no longer exists" }),
      v1Slot("sl-d", { status: "publishing" }),
      v1Slot("sl-e", { status: "cancelled", error: "quotaExceeded: The request cannot be completed" }),
      v1Slot("sl-f", { status: "missed", missedAt: "2026-10-06T13:30:00.000Z" }),
      v1Slot("sl-g", { status: "failed", error: null }),
    ],
    claims: { "sl-d": { pid: 4242, at: "2026-10-06T12:00:00.000Z" } },
  },
  publications: {
    publications: [
      { id: "pub-b", slotId: "sl-b", channelId: "youtube", platformVideoId: "yt-b", visibility: "private", dry: false, publishedAt: "2026-10-02T12:00:05.000Z" },
      { id: "pub-x", slotId: "sl-missing", channelId: "youtube", platformVideoId: null, visibility: "private", dry: true, publishedAt: "2026-10-02T12:00:05.000Z" },
    ],
  },
  metrics: {
    snapshots: [
      { publicationId: "pub-b", at: "2026-10-03T09:00:00.000Z", views: 40, watchTimeS: null, avgViewDurationS: null, likes: 2, comments: null, shares: null, subsDelta: null },
      { publicationId: "pub-b", at: "2026-10-04T09:00:00.000Z", views: null, watchTimeS: null, avgViewDurationS: null, likes: null, comments: null, shares: null, subsDelta: null },
    ],
  },
});

const by = (outs: readonly { kind: string; id: string; outcome: string }[]) => Object.fromEntries(outs.map((o) => [`${o.kind}:${o.id}`, o.outcome]));

describe("the v1 calendar import", () => {
  it("a dry run decides exactly what the real run does and writes nothing", () => {
    const w = fresh();
    const dry = must(importV1Calendar(w.k.store, calendar(), { dry: true }));
    expect(must(listSlots(w.k.store))).toEqual([]);
    expect(eventTypes(w.k)).toEqual([]);
    const real = must(importV1Calendar(w.k.store, calendar(), { dry: false }));
    expect(by(dry)).toEqual(Object.fromEntries(Object.entries(by(real)).map(([k, v]) => [k, v === "imported" ? "would-import" : v])));
  });

  it("maps each v1 shape: export -> library item, drift text -> field, a v1 claim -> interrupted, a cancelled failure keeps its words", () => {
    const w = fresh();
    const out = by(must(importV1Calendar(w.k.store, calendar(), { dry: false })));
    expect(out).toMatchObject({ "slot:sl-a": "imported", "slot:sl-b": "imported", "slot:sl-g": "refused", "publication:pub-b": "imported", "publication:pub-x": "refused", "metrics:pub-b": "imported" });
    const get = (id: string) => must(getSlot(w.k.store, id)).slot;
    expect(get("sl-a")).toMatchObject({ libraryItemId: "video:export:exp-sl-a", channel: "youtube", state: "scheduled" });
    expect(get("sl-b")).toMatchObject({ state: "published", publicationId: "pub-b" });
    expect(get("sl-c")).toMatchObject({ state: "scheduled", drift: "export_missing" });
    expect("error" in get("sl-c")).toBe(false);
    expect(get("sl-d")).toMatchObject({ state: "failed", error: INTERRUPTED_TEXT });
    expect(get("sl-e")).toMatchObject({ state: "cancelled", error: "quotaExceeded: The request cannot be completed" });
    expect(get("sl-f")).toMatchObject({ state: "missed", missedAt: "2026-10-06T13:30:00.000Z" });
    expect(must(w.k.store.read((r) => listPublicationsIn(r)))).toEqual([
      { id: "pub-b", slotId: "sl-b", channel: "youtube", platformId: "yt-b", visibility: "private", dry: false, publishedAt: "2026-10-02T12:00:05.000Z" },
    ]);
    expect(must(w.k.store.read((r) => snapshotsIn(r, "pub-b"))).map((s) => s.views)).toEqual([40, null]);
    // the act of importing, once per row - not a second copy of v1's history
    expect(eventTypes(w.k, "sl-a")).toEqual(["slot.import"]);
    expect(eventTypes(w.k, "pub-b")).toEqual(["publication.import", "metric.import"]);
  });

  it("is idempotent: a second run imports nothing and skips what it holds", () => {
    const w = fresh();
    must(importV1Calendar(w.k.store, calendar(), { dry: false }));
    const before = eventTypes(w.k).length;
    const again = must(importV1Calendar(w.k.store, calendar(), { dry: false }));
    expect(again.filter((o) => o.outcome === "imported")).toEqual([]);
    expect(by(again)).toMatchObject({ "slot:sl-a": "skipped", "publication:pub-b": "skipped", "metrics:pub-b": "skipped" });
    expect(eventTypes(w.k).length).toBe(before);
  });

  it("an imported interrupted slot is never fired by the tick; an imported scheduled one is", () => {
    const w = fresh();
    must(importV1Calendar(w.k.store, calendar(), { dry: false }));
    const r = must(sweep(w.k.store, facts({ now: Date.parse("2026-10-06T12:05:00.000Z"), missing: ["video:export:exp-sl-c"] }), { claim: true, holder: ME, alive: () => true }));
    expect(r.claimed.map((c) => c.slot.id)).toEqual(["sl-a"]);
  });

  it("never refuses v1's several holders: the earliest holds, a live publication before any, the rest land cancelled with the reason on their event", () => {
    const w = fresh();
    const pub = (id: string, slotId: string, dry: boolean) => ({ id, slotId, channelId: "youtube", platformVideoId: dry ? null : `yt-${id}`, visibility: "private", dry, publishedAt: "2026-10-02T12:00:05.000Z" });
    const v1 = {
      schedule: {
        slots: [
          v1Slot("sl-late", { exportId: "x", publishAt: "2026-10-07T12:00:00.000Z" }),
          v1Slot("sl-early", { exportId: "x", publishAt: "2026-10-06T09:00:00.000Z" }),
          v1Slot("sl-insta", { exportId: "x", channelId: "instagram", publishAt: "2026-10-07T12:00:00.000Z" }),
          v1Slot("sl-after-live", { exportId: "y", publishAt: "2026-10-01T08:00:00.000Z" }),
          v1Slot("sl-live", { exportId: "y", status: "published", publicationId: "pub-live", publishAt: "2026-10-02T12:00:00.000Z" }),
          v1Slot("sl-after-dry", { exportId: "z" }),
          v1Slot("sl-dry", { exportId: "z", status: "published", publicationId: "pub-dry", publishAt: "2026-10-02T12:00:00.000Z" }),
        ],
      },
      publications: { publications: [pub("pub-live", "sl-live", false), pub("pub-dry", "sl-dry", true)] },
      metrics: { snapshots: [] },
    };
    const dry = must(importV1Calendar(w.k.store, v1, { dry: true }));
    const out = must(importV1Calendar(w.k.store, v1, { dry: false }));
    expect(out.filter((o) => o.outcome === "refused")).toEqual([]);
    expect(dry.map((o) => [o.kind, o.id, o.reason])).toEqual(out.map((o) => [o.kind, o.id, o.reason]));
    const get = (id: string) => must(getSlot(w.k.store, id));
    expect(get("sl-early").slot.state).toBe("scheduled");
    expect(get("sl-insta").slot.state).toBe("scheduled");
    expect(get("sl-late").slot.state).toBe("cancelled");
    expect("error" in get("sl-late").slot).toBe(false);
    expect(out.find((o) => o.id === "sl-late")?.reason).toContain("sl-early");
    expect(get("sl-after-live").slot.state).toBe("cancelled");
    expect(get("sl-live").slot.state).toBe("published");
    expect(get("sl-dry")).toMatchObject({ slot: { state: "published" }, dry: true });
    expect(get("sl-after-dry").slot.state).toBe("scheduled");
    const late = must(w.k.store.read((r) => r.get("SELECT data FROM events WHERE type = 'slot.import' AND subject_id = 'sl-late'")))?.["data"];
    expect(must(parseJsonAt("slot.import", z.record(z.string(), z.unknown()), String(late)))).toMatchObject({ cancelledFor: "one-holder", heldBy: "sl-early", v1State: "scheduled" });
  });

  it("a slot v1 cancelled while drifted keeps no drift sentence in `error`; the drift rides the import event", () => {
    const w = fresh();
    const v1 = { schedule: { slots: [v1Slot("sl-cx", { status: "cancelled", error: "this channel is not wired" })] }, publications: { publications: [] }, metrics: { snapshots: [] } };
    const out = must(importV1Calendar(w.k.store, v1, { dry: false }));
    expect(out).toMatchObject([{ id: "sl-cx", outcome: "imported" }]);
    const s = must(getSlot(w.k.store, "sl-cx")).slot;
    expect(s.state).toBe("cancelled");
    expect("error" in s || "drift" in s).toBe(false);
    expect(String(must(w.k.store.read((r) => r.get("SELECT data FROM events WHERE subject_id = 'sl-cx'")))?.["data"])).toContain('"v1Drift":"channel_not_wired"');
  });

  it("refuses a calendar that is not v1's shape, writing nothing", () => {
    const w = fresh();
    expect(importV1Calendar(w.k.store, { schedule: { slots: [{ id: "x" }] }, publications: { publications: [] }, metrics: { snapshots: [] } }, { dry: false }).ok).toBe(false);
    expect(must(listSlots(w.k.store))).toEqual([]);
  });
});
