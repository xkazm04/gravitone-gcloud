import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok } from "@gt/domain/errors";
import type { MediaFacts } from "@gt/domain/library";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import type { LibraryEntry } from "@gt/kernel/library/core";
import { putMediaFacts, upsertItems } from "@gt/kernel/library/write";

import { makeRealLibrary } from "../../app/(studio)/library/_port/real.ts";

// THE LIBRARY'S REAL SIDE (L53) over a kernel in memory: what the route draws when the index is
// the kernel's - cards with blob addresses, a clip that plays from its blob with the keyframe the
// media-facts producer cut as its poster, a decodable-or-not preview read from the facts, the acts
// as events in the work's words, and "Use in project" naming only projects the records hold.

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});

const SHA = { still: "a".repeat(64), clip: "b".repeat(64), poster: "c".repeat(64), dark: "d".repeat(64), night: "e".repeat(64), day: "f".repeat(64), draft: "1".repeat(64) };

const base = { state: "unjudged" as const, collections: [], origin: "studio" as const, rights: { use: "publishable" as const }, source: "real" as const, lineage: [] };
const entries: LibraryEntry[] = [
  { feed: "t", meta: "still", extras: {}, item: { ...base, kind: "image", id: "image:still", title: "Harbor still", vocabulary: { styles: [] }, media: { sha256: SHA.still, bytes: 10, mime: "image/png" }, at: "2026-10-10T10:00:00.000Z" } },
  { feed: "t", meta: "clip", extras: {}, item: { ...base, kind: "video", id: "video:clip", title: "Harbor pan", vocabulary: { format: "film", captions: "none" }, media: { sha256: SHA.clip, bytes: 10, mime: "video/mp4" }, at: "2026-10-11T10:00:00.000Z" } },
  { feed: "t", meta: "dark", extras: {}, item: { ...base, kind: "video", id: "video:dark", title: "Night export", vocabulary: { format: "ad", captions: "none" }, media: { sha256: SHA.dark, bytes: 10, mime: "video/mp4" }, at: "2026-10-12T10:00:00.000Z" } },
  { feed: "t", meta: "style", extras: { palette: ["#112233", "#445566"] }, item: { ...base, kind: "style", id: "style:blueprint", title: "Blueprint", vocabulary: { styleId: "blueprint", derivation: "authored" } } },
  { feed: "t", meta: "style", extras: { palette: ["#778899", "#aabbcc"] }, item: { ...base, kind: "style", id: "style:chalk", title: "Chalk", vocabulary: { styleId: "chalk", derivation: "authored" } } },
  // Blueprint's plates: the newest kept one renders near-black, and the newest of all was rejected;
  // its cover must be the bright kept one.
  { feed: "t", meta: "plate", extras: {}, item: { ...base, kind: "plate", state: "rejected", id: "plate:draft", title: "Rejected plate", vocabulary: { station: "forge", styleId: "blueprint" }, media: { sha256: SHA.draft, bytes: 10, mime: "image/png" }, at: "2026-10-14T10:00:00.000Z" } },
  { feed: "t", meta: "plate", extras: {}, item: { ...base, kind: "plate", state: "ratified", id: "plate:night", title: "Night plate", vocabulary: { station: "forge", styleId: "blueprint" }, media: { sha256: SHA.night, bytes: 10, mime: "image/png" }, at: "2026-10-13T10:00:00.000Z" } },
  { feed: "t", meta: "plate", extras: {}, item: { ...base, kind: "plate", state: "ratified", id: "plate:day", title: "Day plate", vocabulary: { station: "forge", styleId: "blueprint" }, media: { sha256: SHA.day, bytes: 10, mime: "image/png" }, at: "2026-10-09T10:00:00.000Z" } },
];

const facts = (sha: string, over: Partial<MediaFacts>): MediaFacts => ({ sha, decodable: true, mime: "video/mp4", w: 1280, h: 720, durationS: 5, posterSha: null, meanLuma: 90, nearBlack: false, probedAt: "2026-10-16T00:00:00.000Z", error: null, ...over });

function setup() {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  open.push(k.value);
  const s = k.value.store;
  const up = upsertItems(s, entries, { styleOf: (id) => (id === "blueprint" ? { name: "Blueprint", family: "diagram", observables: {} } : undefined) });
  if (!up.ok) throw up.error;
  const f = putMediaFacts(s, [
    facts(SHA.clip, { posterSha: SHA.poster }),
    facts(SHA.dark, { decodable: false, w: null, h: null, durationS: null, meanLuma: null, error: "moov atom not found" }),
    facts(SHA.night, { mime: "image/png", durationS: null, meanLuma: 6, nearBlack: true }),
    facts(SHA.day, { mime: "image/png", durationS: null, meanLuma: 140 }),
    facts(SHA.draft, { mime: "image/png", durationS: null, meanLuma: 150 }),
  ]);
  if (!f.ok) throw f.error;
  const p = s.tx((t) => {
    t.run("INSERT INTO projects (id, rev, listed, updated_at, record) VALUES (?, 1, 1, ?, ?)", "p-harbor", "2026-10-15T00:00:00.000Z", JSON.stringify({ id: "p-harbor", title: "Harbor film" }));
    t.run("INSERT INTO projects (id, rev, listed, updated_at, record) VALUES (?, 1, 0, ?, ?)", "p-gone", "2026-10-14T00:00:00.000Z", JSON.stringify({ id: "p-gone", title: "Discarded" }));
  });
  if (!p.ok) throw p.error;
  return { k: k.value, lib: makeRealLibrary({ store: () => ok(s), atelierOf: (id) => `/library/style/${id}` }) };
}

const must = <T,>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

describe("the Library's real side", () => {
  it("draws the index's rows as cards with blob addresses, and counts everything", () => {
    const { lib } = setup();
    const page = must(lib.query({ limit: 10 }));
    expect(page.everything).toBe(8);
    const still = page.items.find((c) => c.id === "image:still");
    expect(still?.face).toEqual({ kind: "image", url: `/api/blob/${SHA.still}?type=image%2Fpng` });
    // A clip's tile is its keyframe; a style's swatch carries the palette the row holds.
    expect(page.items.find((c) => c.id === "video:clip")?.face).toEqual({ kind: "poster", url: `/api/blob/${SHA.poster}?type=image%2Fjpeg` });
    // A style leads with its best plate (the bright one, though the dark one is newer); a style
    // with no plate keeps its swatch, in the palette its row holds.
    expect(page.items.find((c) => c.id === "style:blueprint")?.face).toEqual({ kind: "image", url: `/api/blob/${SHA.day}?type=image%2Fpng` });
    expect(page.items.find((c) => c.id === "style:chalk")?.face).toMatchObject({ kind: "swatch", palette: ["#778899", "#aabbcc"] });
    // What does not decode is flagged and sorts last.
    expect(page.items.at(-1)).toMatchObject({ id: "video:dark", attention: "unreadable" });
  });

  it("plays a clip from its blob with its keyframe as the poster; one that does not decode shows the probe's words", () => {
    const { lib } = setup();
    const clip = must(lib.detail("video:clip", {}));
    expect(clip.preview.video).toEqual({ src: `/api/blob/${SHA.clip}?type=video%2Fmp4`, poster: `/api/blob/${SHA.poster}?type=image%2Fjpeg`, loop: false });
    const dark = must(lib.detail("video:dark", {}));
    expect(dark.preview.video).toBeUndefined();
    expect(dark.media?.error).toBe("moov atom not found");
    expect(must(lib.detail("style:blueprint", {})).atelier).toBe("/library/style/blueprint");
    const gone = lib.detail("image:nope", {});
    expect(gone.ok ? null : gone.error.code).toBe("not-found");
  });

  it("pins as an event, refuses a second pin in the work's words, and unpins", () => {
    const { k, lib } = setup();
    const pinned = must(lib.act("image:still", { act: "pin" }, {}, { who: "u-1" }));
    expect(pinned.said).toBe("Pinned · Harbor still");
    expect(pinned.detail.pinned).toBe(true);
    const again = lib.act("image:still", { act: "pin" }, {});
    expect(again.ok ? null : [again.error.code, again.error.message]).toEqual(["conflict", "Harbor still is already pinned"]);
    expect(must(lib.act("image:still", { act: "unpin" }, {})).detail.pinned).toBe(false);
    const ev = must(queryEvents(k.store, { order: "asc", limit: 50 })).events.filter((e) => e.type.startsWith("library."));
    expect(ev.map((e) => [e.type, e.actor.id])).toEqual([
      ["library.pinned", "u-1"],
      ["library.unpinned", "operator"],
    ]);
  });

  it("uses an item in a listed project, and refuses one the records do not list", () => {
    const { lib } = setup();
    const d = must(lib.detail("image:still", {}));
    expect(d.projects).toEqual([{ value: "p-harbor", label: "Harbor film" }]);
    const used = must(lib.act("image:still", { act: "use-in-project", projectId: "p-harbor" }, {}));
    expect(used.said).toBe("Harbor still → Harbor film");
    expect(used.detail.usedBy.map((u) => u.value)).toEqual(["p-harbor"]);
    const gone = lib.act("image:still", { act: "use-in-project", projectId: "p-gone" }, {});
    expect(gone.ok ? null : gone.error.code).toBe("not-found");
  });

  it("the detail's Use-in-project choice marks a project already using the item and defaults to one that is not", async () => {
    const { lib } = setup();
    const d = must(lib.detail("image:still", {}));
    const used = must(lib.act("image:still", { act: "use-in-project", projectId: "p-harbor" }, {})).detail;
    const { DetailView } = await import("../../app/(studio)/library/_library/DetailView.tsx");
    const noop = (): void => undefined;
    const draw = (x: typeof d): string => renderToStaticMarkup(createElement(DetailView, { d: x, busy: false, onFacet: noop, onItem: noop, onPin: noop, onUse: noop, onExport: noop }));
    const two = { ...used, projects: [{ value: "p-harbor", label: "Harbor film" }, { value: "p-new", label: "New film" }] };
    const html = draw(two);
    expect(html).toMatch(/<option value="p-harbor"[^>]*>Harbor film · in use<\/option>/);
    expect(html).toMatch(/<option value="p-new"[^>]*>New film<\/option>/);
    expect(html).toMatch(/<option value="p-new" selected=""/);
    // Nothing uses it yet: no mark, the first project is the default.
    const fresh = draw({ ...d, projects: two.projects });
    expect(fresh).not.toContain("in use");
    expect(fresh).toMatch(/<option value="p-harbor" selected=""/);
  });
});
