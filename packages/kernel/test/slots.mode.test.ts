import { afterAll, afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { kernelModules } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore } from "../src/store.ts";
import { recordPublication } from "../src/slots/outcome.ts";
import { getSlot, priorPublicationIn } from "../src/slots/read.ts";
import { slotsMigrations } from "../src/slots/schema.ts";
import { sweep } from "../src/slots/sweep.ts";
import { createSlot, publishNow } from "../src/slots/write.ts";
import { must, scratch } from "./helpers.ts";
import { at, draft, eventTypes, facts, ITEM, ME, NOW, OP, PUBLISHER, world, type World } from "./slots.fixture.ts";

// THE L62 RULING (v1 parity, lib/publish/publisher.ts: "one upload per export x channel x MODE -
// a dry run does not block the live upload that follows it"): a slot published DRY holds nothing,
// one publication per item x channel x mode, and the store's migration carries an existing
// calendar across. With it, the L63 finding: the item-existence fact is asked before the write.

const tmp = scratch("slotmode");
afterAll(() => tmp.dispose());
let open: World[] = [];
afterEach(() => {
  for (const w of open) w.k.close();
  open = [];
});
let n = 0;
const fresh = (): World => {
  const w = world(tmp.dir, `m${++n}`);
  open.push(w);
  return w;
};
const code = <T>(r: Result<T>): string | null => (r.ok ? null : r.error.code);
const DRY = { platformId: null, visibility: "private" as const, dry: true, publishedAt: at(1) };
const LIVE = { platformId: "yt-live", visibility: "private" as const, dry: false, publishedAt: at(2) };

/** Create, claim and land one slot for ITEM on youtube, in the given mode. */
function publishOne(w: World, mode: typeof DRY | typeof LIVE): Result<{ slotId: string; publicationId: string }> {
  const s = createSlot(w.k.store, draft(), OP);
  if (!s.ok) return s;
  const c = must(sweep(w.k.store, facts(), { claim: true, holder: ME, alive: () => true })).claimed.find((x) => x.slot.id === s.value.slot.id);
  if (c === undefined) throw new Error(`slot ${s.value.slot.id} was not claimed`);
  const landed = recordPublication(w.k.store, c.slot.id, c.fence, mode, PUBLISHER);
  return landed.ok ? { ok: true, value: { slotId: c.slot.id, publicationId: landed.value.publication.id } } : landed;
}

describe("a dry publication holds nothing", () => {
  it("the live slot that follows a rehearsal can be made and published; after the live one, the item is held", () => {
    const w = fresh();
    const rehearsal = must(publishOne(w, DRY));
    expect(must(getSlot(w.k.store, rehearsal.slotId))).toMatchObject({ slot: { state: "published" }, dry: true });
    const live = must(publishOne(w, LIVE));
    expect("dry" in must(getSlot(w.k.store, live.slotId))).toBe(false);
    const third = createSlot(w.k.store, draft(), OP);
    expect(code(third)).toBe("conflict");
    expect(third.ok ? "" : third.error.message).toContain(live.slotId);
  });

  it("a second rehearsal of the same item on the same channel is refused at its landing, in v1's words", () => {
    const w = fresh();
    const first = must(publishOne(w, DRY));
    const again = publishOne(w, DRY);
    expect(code(again)).toBe("conflict");
    expect(again.ok ? "" : again.error.message).toBe(`export 0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa is already published on youtube (publication ${first.publicationId}, dry)`);
    expect(must(w.k.store.read((r) => priorPublicationIn(r, ITEM, "youtube", true)))?.id).toBe(first.publicationId);
    expect(must(w.k.store.read((r) => priorPublicationIn(r, ITEM, "youtube", false)))).toBeUndefined();
    expect(must(w.k.store.read((r) => priorPublicationIn(r, ITEM, "instagram", true)))).toBeUndefined();
  });

  it("the store refuses the rule broken by hand: a dry slot turned live beside a live one, or a second dry", () => {
    const w = fresh();
    const dry = must(publishOne(w, DRY));
    const live = must(publishOne(w, LIVE));
    expect(code(w.k.store.tx((t) => t.run("UPDATE slots SET dry = 0 WHERE id = ?", dry.slotId)))).toBe("conflict");
    expect(code(w.k.store.tx((t) => t.run("UPDATE slots SET dry = 1 WHERE id = ?", live.slotId)))).toBe("conflict");
    const waiting = must(createSlot(w.k.store, draft({ channel: "instagram" }), OP)).slot;
    expect(code(w.k.store.tx((t) => t.run("UPDATE slots SET dry = 1 WHERE id = ?", waiting.id)))).not.toBeNull();
  });

  it("the migration carries a calendar written before it: a dry-published slot is marked and frees its item", () => {
    const modules = must(kernelModules()).map((m) => (m.module === "slots" ? { ...m, steps: slotsMigrations.steps.slice(0, 1) } : m));
    const store = must(openStore(`${tmp.dir}/premode.sqlite`));
    must(migrate(store, modules, { snapshotDir: tmp.dir }));
    const rec = { id: "sl-old", libraryItemId: ITEM, channel: "youtube", at: at(-60), state: "published", title: "Old", description: "", tags: [], publicationId: "pub-old" };
    const pub = { id: "pub-old", slotId: "sl-old", channel: "youtube", platformId: null, visibility: "private", dry: true, publishedAt: at(-59) };
    must(
      store.tx((t) => {
        t.run("INSERT INTO slots (id, item, channel, at, state, rev, record, created_at, updated_at) VALUES (?, ?, 'youtube', ?, 'published', 1, ?, ?, ?)", "sl-old", ITEM, rec.at, JSON.stringify(rec), t.at, t.at);
        t.run("INSERT INTO publications (id, slot_id, record, published_at) VALUES ('pub-old', 'sl-old', ?, ?)", JSON.stringify(pub), pub.publishedAt);
      }),
    );
    const report = must(migrate(store, must(kernelModules()), { snapshotDir: tmp.dir }));
    expect(report.applied).toEqual([2, 3, 4].map((version) => ({ module: "slots", version })));
    expect(must(getSlot(store, "sl-old")).dry).toBe(true);
    expect(must(createSlot(store, draft(), OP)).slot.state).toBe("scheduled");
    store.close();
  });
});

describe("item existence is asked before the write (L63)", () => {
  // The Floor's real side answers `itemExists` from this same store (the Library index); asked
  // inside the write, its read fails and every item reads missing.
  const fromStore = (w: World) => (id: string): boolean => {
    const r = w.k.store.read((x) => x.get("SELECT 1 AS y FROM slots WHERE item = ? LIMIT 1", id));
    return r.ok && r.value !== undefined;
  };

  it("publish-now with a store-reading readiness goes through", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft({ at: at(-120) }), OP)).slot;
    must(sweep(w.k.store, facts(), { claim: false }));
    const due = must(publishNow(w.k.store, s.id, OP, { now: NOW, ready: { wired: facts().wired, itemExists: fromStore(w) } }));
    expect(due.slot).toMatchObject({ state: "scheduled", at: new Date(NOW).toISOString() });
    expect("drift" in due.slot).toBe(false);
    expect(code(publishNow(w.k.store, "sl-nope", OP, { now: NOW, ready: { wired: facts().wired, itemExists: fromStore(w) } }))).toBe("not-found");
  });

  it("a sweep with a store-reading itemExists claims the due slot and drifts nothing", () => {
    const w = fresh();
    const s = must(createSlot(w.k.store, draft(), OP)).slot;
    const r = must(sweep(w.k.store, facts({ itemExists: fromStore(w) }), { claim: true, holder: ME, alive: () => true }));
    expect(r.drifted).toEqual([]);
    expect(r.claimed.map((c) => c.slot.id)).toEqual([s.id]);
  });
});

describe("what a miss knows", () => {
  it("the caller's missData rides the slot.miss event itself; a miss it says nothing about is plain", () => {
    const w = fresh();
    const late = must(createSlot(w.k.store, draft({ at: at(-90) }), OP)).slot;
    const early = must(createSlot(w.k.store, draft({ at: at(-300), channel: "instagram" }), OP)).slot;
    const r = must(sweep(w.k.store, facts(), { claim: false, missData: (s) => (s.id === late.id ? { downtime: { from: at(-120), to: at(0) } } : undefined) }));
    expect([...r.missed].sort()).toEqual([late.id, early.id].sort());
    expect(eventTypes(w.k, late.id)).toEqual(["slot.create", "slot.miss"]);
    const data = (id: string) => must(parseJsonAt("slot.miss", z.record(z.string(), z.unknown()), String(must(w.k.store.read((x) => x.get("SELECT data FROM events WHERE type = 'slot.miss' AND subject_id = ?", id)))?.["data"])));
    expect(data(late.id)).toMatchObject({ downtime: { from: at(-120), to: at(0) }, overdueMin: 90 });
    expect(data(early.id)).not.toHaveProperty("downtime");
  });
});
