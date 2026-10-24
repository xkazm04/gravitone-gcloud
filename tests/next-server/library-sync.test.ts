import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { queryLibrary } from "@gt/kernel/library/query";

import type { Feed, FeedItem } from "../../lib/library/feeds/types.ts";
import { syncLibrary } from "../../lib/library/project.ts";

// THE PROJECTION'S CONTRACT over stand-in feeds and real files in a temp dir:
// idempotent (a second sync writes nothing and re-hashes nothing), a feed that
// fails keeps what it had (never pruned as "empty"), a vanished record is pruned,
// a file not on disk is an item drawn as missing, and the styles feed's facets
// reach the plates of the same sync whatever the feed order.

const open: { k: Kernel; dir: string }[] = [];
afterEach(() => {
  for (const o of open.splice(0)) {
    o.k.close();
    rmSync(o.dir, { recursive: true, force: true });
  }
});
function setup(): { k: Kernel; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-l49-sync-"));
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  const o = { k: k.value, dir };
  open.push(o);
  return o;
}

const plate = (id: string, file?: string): FeedItem => ({
  item: { kind: "plate", id, title: id, state: "unjudged", collections: [], origin: "forge", rights: { use: "unknown" }, source: "fixture", lineage: [], vocabulary: { station: "forge", styleId: "painted-3d" } },
  meta: "",
  extras: {},
  ...(file === undefined ? {} : { file: { abs: file, mime: "image/png" } }),
});

function feed(id: string, items: () => FeedItem[], fail?: () => boolean): Feed {
  return {
    id,
    read: async () => {
      if (fail?.()) throw new Error(`${id} store unreadable`);
      return { items: items(), skipped: [] };
    },
  };
}
const styles: Feed = {
  id: "styles",
  read: async () => ({ items: [], skipped: [], styles: new Map([["painted-3d", { name: "Painted 3D", family: "animation", observables: { render_mode: "painterly" } }]]) }),
};
const ctx = { universe: "fixture" as const };

describe("syncLibrary", () => {
  it("ingests, then converges: a second sync re-hashes nothing and writes nothing", async () => {
    const { k, dir } = setup();
    const a = path.join(dir, "a.png");
    writeFileSync(a, "pretend png bytes");
    const blobs = blobStore(path.join(dir, "blobs"));
    const feeds = [feed("forge", () => [plate("p1", a), plate("p2", path.join(dir, "gone.png"))]), styles];
    const one = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!one.ok) throw one.error;
    expect(one.value.feeds[0]).toMatchObject({ feed: "forge", items: 2, inserted: 2, ingested: 1, missingFiles: 1 });
    const two = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!two.ok) throw two.error;
    expect(two.value.feeds[0]).toMatchObject({ inserted: 0, updated: 0, unchanged: 2, ingested: 0, pruned: 0 });
    const p = queryLibrary(k.store, { kind: "plate", limit: 5 });
    if (!p.ok) throw p.error;
    expect(p.value.items.map((i) => [i.id, i.attention ?? null])).toEqual([
      ["p1", null],
      ["p2", "missing"],
    ]);
    // The family came through the styles feed, listed after the plates.
    expect(p.value.groups.find((g) => g.key === "family")?.values.map((v) => v.value)).toEqual(["animation"]);
  });

  it("re-hashes a file whose size or mtime moved", async () => {
    const { k, dir } = setup();
    const a = path.join(dir, "a.png");
    writeFileSync(a, "one");
    const blobs = blobStore(path.join(dir, "blobs"));
    const feeds = [feed("forge", () => [plate("p1", a)])];
    await syncLibrary(k.store, blobs, feeds, ctx);
    writeFileSync(a, "two, longer");
    utimesSync(a, new Date(), new Date(Date.now() + 5000));
    const r = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!r.ok) throw r.error;
    expect(r.value.feeds[0]).toMatchObject({ ingested: 1, updated: 1 });
  });

  it("prunes a record its feed no longer holds, and keeps everything of a feed that failed", async () => {
    const { k, dir } = setup();
    const blobs = blobStore(path.join(dir, "blobs"));
    let held = ["p1", "p2"];
    let broken = false;
    const feeds = [feed("forge", () => held.map((id) => plate(id)), () => broken), feed("other", () => [plate("o1")])];
    await syncLibrary(k.store, blobs, feeds, ctx);
    held = ["p1"];
    const pruned = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!pruned.ok) throw pruned.error;
    expect(pruned.value.feeds[0]).toMatchObject({ pruned: 1 });
    broken = true;
    const failed = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!failed.ok) throw failed.error;
    expect(failed.value.feeds[0]).toMatchObject({ feed: "forge", failed: "forge store unreadable", pruned: 0 });
    expect(failed.value.feeds[1]).toMatchObject({ feed: "other", unchanged: 1 });
    const all = queryLibrary(k.store, { limit: 10 });
    if (!all.ok) throw all.error;
    expect(all.value.items.map((i) => i.id).sort()).toEqual(["o1", "p1"]);
  });

  it("keeps the items of a record its feed listed and could not read, and prunes them once it reads clean", async () => {
    const { k, dir } = setup();
    const blobs = blobStore(path.join(dir, "blobs"));
    let read: () => { items: FeedItem[]; held?: string[] } = () => ({ items: [plate("plate:forge:r1:a"), plate("plate:forge:r2:a"), plate("plate:forge:r2:b")] });
    const feeds: Feed[] = [{ id: "forge", read: async () => ({ skipped: [], ...read() }) }];
    await syncLibrary(k.store, blobs, feeds, ctx);
    // r2's manifest could not be read this sync: its two plates are held, not pruned as gone.
    read = () => ({ items: [plate("plate:forge:r1:a")], held: ["plate:forge:r2:"] });
    const heldSync = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!heldSync.ok) throw heldSync.error;
    expect(heldSync.value.feeds[0]).toMatchObject({ items: 1, pruned: 0 });
    const ids = () => {
      const p = queryLibrary(k.store, { limit: 10 });
      if (!p.ok) throw p.error;
      return p.value.items.map((i) => i.id).sort();
    };
    expect(ids()).toEqual(["plate:forge:r1:a", "plate:forge:r2:a", "plate:forge:r2:b"]);
    read = () => ({ items: [plate("plate:forge:r1:a")] });
    const clean = await syncLibrary(k.store, blobs, feeds, ctx);
    if (!clean.ok) throw clean.error;
    expect(clean.value.feeds[0]).toMatchObject({ pruned: 2 });
    expect(ids()).toEqual(["plate:forge:r1:a"]);
  });
});
