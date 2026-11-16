// THE COVERS FEED (spark track-mirror-studio WP2): lib/library/feeds/cover.ts over the real cover store in a temp
// dir, into a kernel through the real sync (lib/library/project.ts syncLibrary), read back through the Library's
// own detail (packages/kernel/src/library/detail.ts libraryDetail) - so the item is one the audio detail accepts.
// The remix's length is ffprobe's in the feed; it is stood in here (the decoder is cover-doors' subject).

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-feed-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

vi.mock("../../lib/sound/cover/cut.ts", async (actual) => ({
  ...(await actual<typeof import("../../lib/sound/cover/cut.ts")>()),
  probeDurationS: async () => ({ ok: true, value: 95.5 }),
}));

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CoverRecord } from "@gt/domain/cover";
import { blobStore } from "@gt/kernel/blob";
import { openKernel } from "@gt/kernel/kernel";
import { libraryDetail } from "@gt/kernel/library/detail";

import { coverItemId, coversFeed } from "../../lib/library/feeds/cover.ts";
import { LIBRARY_FEEDS } from "../../lib/library/fresh.ts";
import { syncLibrary } from "../../lib/library/project.ts";
import { coverFileHref } from "../../lib/sound/cover/href.ts";
import { coverFileAbs, createCover, mutateCover } from "../../lib/sound/cover/store.ts";
import { YUE2_WEIGHTS } from "../../lib/sound/cover/rights.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const put = (id: string, rel: string, text: string): void => {
  const abs = coverFileAbs(id, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
};

async function cover(title: string, change: (c: CoverRecord) => CoverRecord, rights: CoverRecord["rights"] = "third-party-uncleared"): Promise<CoverRecord> {
  const c = await createCover({ title, rights, ...(rights === "licensed" ? { holder: "Label Co" } : {}), source: { bytes: new TextEncoder().encode(`${title} song`), mime: "audio/mpeg", name: `${title}.mp3`, durationS: 200 } });
  return mutateCover(c.id, change);
}
const picked = (c: CoverRecord): CoverRecord => ({
  ...c,
  state: "picked",
  section: { startS: 20, endS: 80 },
  style: "bossa nova",
  sourceStyle: "synthwave, 1984",
  takes: [{ n: 1, seed: 1111, state: "done", file: "takes/s1111.flac" }],
  winnerSeed: 1111,
  exportFile: "winner.mp3",
});

describe("the covers feed", () => {
  it("is a Library feed", () => {
    expect(LIBRARY_FEEDS).toContain(coversFeed);
    expect(coversFeed.id).toBe("covers");
  });

  it("projects a picked cover as 2 references, a remixed one as 3, an unpicked one as none; and survives a second sync", async () => {
    const judging = await cover("Unpicked", (c) => ({ ...c, state: "judging", takes: [{ n: 1, seed: 7, state: "done", file: "takes/s7.flac" }] }));
    const two = await cover("Tears", picked);
    put(two.id, "section.wav", "section bytes");
    put(two.id, "winner.mp3", "winner bytes");
    const three = await cover("Licensed", (c) => ({ ...picked(c), remix: { file: "remix.mp3", mime: "audio/mpeg", name: "final.mp3", style: "lo-fi" } }), "licensed");
    put(three.id, "winner.mp3", "winner bytes 2");
    put(three.id, "remix.mp3", "remix bytes");

    const read = await coversFeed.read({ universe: "real" });
    const ids = read.items.map((i) => i.item.id);
    expect(ids.filter((i) => i.includes(judging.id))).toEqual([]);
    expect(ids.filter((i) => i.includes(two.id)).sort()).toEqual([coverItemId(two.id, "source"), coverItemId(two.id, "winner")]);
    expect(ids.filter((i) => i.includes(three.id)).sort()).toEqual([coverItemId(three.id, "remix"), coverItemId(three.id, "source"), coverItemId(three.id, "winner")]);

    const by = new Map(read.items.map((i) => [i.item.id, i]));
    const src2 = by.get(coverItemId(two.id, "source"));
    // The cut section when it is on disk; the uploaded song when it is not.
    expect(src2?.extras.audio?.src).toBe(coverFileHref(two.id, "section"));
    expect(src2?.item.vocabulary).toMatchObject({ durationS: 60 });
    expect(by.get(coverItemId(three.id, "source"))?.extras.audio?.src).toBe(coverFileHref(three.id, "source"));
    expect(by.get(coverItemId(three.id, "source"))?.item.vocabulary).toMatchObject({ durationS: 200 });
    for (const it of read.items) {
      expect(it.item).toMatchObject({ kind: "audio", state: "reference", origin: "cover", source: "real" });
      expect(it.item.rights.use).not.toBe("publishable");
      expect(it.file).toBeDefined();
    }
    expect(by.get(coverItemId(two.id, "winner"))?.item.rights).toMatchObject({ use: "reference-only" });
    expect(by.get(coverItemId(three.id, "winner"))?.item.rights).toEqual({ use: "unknown", holder: "Label Co", note: `Source declared licensed. ${YUE2_WEIGHTS}.` });
    expect(by.get(coverItemId(two.id, "winner"))?.item.lineage).toEqual([{ kind: "library-item", id: coverItemId(two.id, "source") }]);
    expect(by.get(coverItemId(three.id, "remix"))?.item.lineage).toEqual([{ kind: "library-item", id: coverItemId(three.id, "winner") }]);
    expect(src2?.item.lineage).toEqual([]);
    expect(by.get(coverItemId(three.id, "source"))?.extras.audio?.prompt).toBe("synthwave, 1984");
    expect(by.get(coverItemId(three.id, "winner"))?.extras.audio?.prompt).toBe("bossa nova");
    expect(by.get(coverItemId(three.id, "remix"))?.extras.audio?.prompt).toBe("lo-fi");
    expect(by.get(coverItemId(three.id, "remix"))?.item.vocabulary).toMatchObject({ provider: "suno", durationS: 95.5 });
    expect((await coversFeed.read({ universe: "fixture" })).items.every((i) => i.item.source === "fixture")).toBe(true);

    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    try {
      const blobs = blobStore(path.join(ROOT, "blobs"));
      const one = await syncLibrary(k.value.store, blobs, [coversFeed], { universe: "real" });
      if (!one.ok) throw one.error;
      expect(one.value.feeds[0]).toMatchObject({ feed: "covers", items: 5, inserted: 5, pruned: 0 });
      expect(one.value.feeds[0]?.failed).toBeUndefined();
      const again = await syncLibrary(k.value.store, blobs, [coversFeed], { universe: "real" });
      if (!again.ok) throw again.error;
      expect(again.value.feeds[0]).toMatchObject({ items: 5, inserted: 0, pruned: 0, unchanged: 5 });
      const d = libraryDetail(k.value.store, coverItemId(three.id, "remix"));
      if (!d.ok) throw d.error;
      expect(d.value.item).toMatchObject({ kind: "audio", origin: "cover", state: "reference", rights: { use: "unknown" } });
      expect(d.value.extras.audio?.src).toBe(coverFileHref(three.id, "remix"));
      expect(d.value.item.media).toBeDefined();
      expect(d.value.lineage.filter((l) => l.ref.kind === "library-item").map((l) => l.ref.id)).toEqual([coverItemId(three.id, "winner")]);
    } finally {
      k.value.close();
    }
  });
});
