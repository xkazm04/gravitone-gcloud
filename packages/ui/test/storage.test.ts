import { describe, expect, it } from "vitest";
import { z } from "zod";

import { identityFlip } from "../src/storage/identity.ts";
import { createStore, defineKey, type KeyDef, type StorageLike, type Store } from "../src/storage/store.ts";
import { TROUBLE_COPY, classify, troubleOf } from "../src/storage/trouble.ts";

/** A Storage stand-in that can be made to fail the way browsers do. */
class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  failWith: { name: string } | null = null;
  getItem(k: string): string | null {
    if (this.failWith?.name === "SecurityError") throw this.failWith;
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failWith !== null) throw this.failWith;
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    if (this.failWith?.name === "SecurityError") throw this.failWith;
    this.data.delete(k);
  }
}

const VIEW = defineKey({ key: "gravitone.library.view", scope: "identity", schema: z.enum(["grid", "list"]), why: "the Library's last layout" });
const RECENT = defineKey({ key: "gravitone.palette.recents", scope: "identity", schema: z.array(z.string()), why: "recent destinations, per account" });
const TIER = defineKey({ key: "gravitone.cosmos-tier.v1", scope: "device", schema: z.number().int(), why: "a fact about this machine's renderer, the same for every account" });

const make = (keys: readonly KeyDef[] = [VIEW, RECENT, TIER]): { store: Store; fake: FakeStorage } => {
  const fake = new FakeStorage();
  const r = createStore(keys, () => fake);
  if (!r.ok) throw r.error;
  return { store: r.value, fake };
};

describe("registration is the eviction list", () => {
  it("a registered key round-trips through its schema", () => {
    const { store } = make();
    expect(store.write(VIEW, "list").ok).toBe(true);
    expect(store.read(VIEW)).toEqual({ ok: true, value: "list" });
  });
  it("an unregistered key cannot be written, even with the same name", () => {
    const { store, fake } = make([VIEW]);
    const stranger = defineKey({ key: "gravitone.secret", scope: "device", schema: z.string(), why: "sneaks past" });
    const twin = defineKey({ key: VIEW.key, scope: "device", schema: z.enum(["grid", "list"]), why: "claims device scope" });
    expect(store.write(stranger, "x")).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(store.write(twin, "grid")).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(fake.data.size).toBe(0);
  });
  it("evict('identity') clears every identity key and leaves the device key, stored and in memory", () => {
    const { store, fake } = make();
    store.write(VIEW, "grid");
    store.write(TIER, 2);
    fake.failWith = { name: "QuotaExceededError" };
    store.write(RECENT, ["/library"]);
    fake.failWith = null;
    expect(store.read(RECENT)).toEqual({ ok: true, value: ["/library"] });
    const report = store.evict("identity");
    expect([...report.removed].sort()).toEqual([VIEW.key, RECENT.key]);
    expect(store.read(VIEW)).toEqual({ ok: true, value: undefined });
    expect(store.read(RECENT)).toEqual({ ok: true, value: undefined });
    expect(store.read(TIER)).toEqual({ ok: true, value: 2 });
  });
  it("a dry run reports what the wipe would remove, with the same predicate, and removes nothing", () => {
    const { store, fake } = make();
    store.write(VIEW, "grid");
    const preview = store.evict("identity", { dryRun: true });
    expect(preview).toMatchObject({ dryRun: true, removed: [VIEW.key], failures: [] });
    expect(fake.data.get(VIEW.key)).toBe('"grid"');
    expect(store.evict("identity").removed).toEqual(preview.removed);
  });
  it("a failing key does not stop the rest of the wipe, and is named", () => {
    const { store, fake } = make();
    store.write(VIEW, "grid");
    store.write(RECENT, ["/a"]);
    fake.failWith = { name: "SecurityError" };
    const report = store.evict("identity");
    expect(report.failures).toHaveLength(2);
    expect(report.failures.map((e) => troubleOf(e))).toEqual(["unavailable", "unavailable"]);
  });
  it("refuses a registration that could lie", () => {
    expect(createStore([VIEW, VIEW], () => null).ok).toBe(false);
    expect(createStore([defineKey({ key: "theirs.key", scope: "device", schema: z.string(), why: "x" })], () => null).ok).toBe(false);
    expect(createStore([defineKey({ key: "gravitone.x", scope: "device", schema: z.string(), why: " " })], () => null).ok).toBe(false);
  });
});

describe("a value is read only through its schema", () => {
  it("never written is ok(undefined), not an error", () => {
    expect(make().store.read(VIEW)).toEqual({ ok: true, value: undefined });
  });
  it("a corrupt or foreign value is `invalid`, per key: one bad key does not lose the others", () => {
    const { store, fake } = make();
    store.write(RECENT, ["/a"]);
    fake.data.set(VIEW.key, '"carousel"');
    expect(store.read(VIEW)).toMatchObject({ ok: false, error: { code: "invalid" } });
    fake.data.set(VIEW.key, "{not json");
    expect(store.read(VIEW)).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(store.read(RECENT)).toEqual({ ok: true, value: ["/a"] });
  });
  it("nothing invalid reaches storage", () => {
    const { store, fake } = make();
    expect(store.write(TIER, 2.5).ok).toBe(false);
    expect(fake.data.has(TIER.key)).toBe(false);
  });
  it("the snapshot is the raw text, stable by value for useSyncExternalStore", () => {
    const { store } = make();
    store.write(RECENT, ["/a"]);
    expect(store.snapshot(RECENT)).toBe('["/a"]');
    expect(store.snapshot(RECENT)).toBe(store.snapshot(RECENT));
  });
});

describe("storage failures are Results, never throws", () => {
  it("a full disk keeps the value for this tab and says it will not survive a reload", () => {
    const { store, fake } = make();
    fake.failWith = { name: "QuotaExceededError" };
    const r = store.write(VIEW, "list");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(troubleOf(r.error)).toBe("quota");
      expect(r.error.message).toContain(TROUBLE_COPY.quota);
    }
    expect(store.read(VIEW)).toEqual({ ok: true, value: "list" });
  });
  it("a write that lands later clears the in-memory copy", () => {
    const { store, fake } = make();
    fake.failWith = { name: "QuotaExceededError" };
    store.write(VIEW, "list");
    fake.failWith = null;
    store.write(VIEW, "grid");
    fake.data.set(VIEW.key, '"list"');
    expect(store.read(VIEW)).toEqual({ ok: true, value: "list" });
  });
  it("a backing that throws on access (blocked site data) is unavailable", () => {
    const r = createStore([VIEW], () => {
      throw { name: "SecurityError" };
    });
    if (!r.ok) throw r.error;
    const read = r.value.read(VIEW);
    expect(read.ok === false && troubleOf(read.error)).toBe("unavailable");
  });
  it("no backing at all (a server render) is unavailable, not a crash", () => {
    const r = createStore([VIEW], () => null);
    if (!r.ok) throw r.error;
    expect(r.value.read(VIEW).ok).toBe(false);
    expect(r.value.snapshot(VIEW)).toBeNull();
  });
  it("classify is duck-typed on name", () => {
    expect(classify({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe("quota");
    expect(classify(new Error("boom"))).toBe("failed");
    expect(classify("not even an object")).toBe("failed");
  });
  it("subscribers hear writes, removals and evictions, not dry runs", () => {
    const { store } = make();
    let heard = 0;
    const off = store.subscribe(() => heard++);
    store.write(VIEW, "grid");
    store.remove(VIEW);
    store.evict("identity", { dryRun: true });
    store.evict("identity");
    off();
    store.write(VIEW, "grid");
    expect(heard).toBe(3);
  });
});

describe("identityFlip: the trigger table (v1 transitionFor)", () => {
  it.each([
    ["first sign-in", null, "u1", false, null],
    ["credential refresh: the bearer changed, the user did not", "u1", "u1", false, null],
    ["deliberate sign-out", "u1", null, true, "signed-out"],
    ["session ended, revoked, or signed out in another tab", "u1", null, false, "session-ended"],
    ["direct account switch, the dangerous one", "u1", "u2", false, "account-switched"],
  ] as const)("%s", (_name, was, now, deliberate, reason) => {
    expect(identityFlip(was, now, deliberate)).toBe(reason);
  });
});
