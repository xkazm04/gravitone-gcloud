// The Library's `model` kind in the index (spark game-3d-assets WP3): a game asset's variant is
// faceted by class, technique, rig and triangle band, its poster rides the row's face (a glb has no
// picture for the cover query), its glb's counts are a media fact, its detail offers `export`, and
// an export is an event; the v3 migration clears a glb a v2 store had probed with ffprobe.
import { afterEach, describe, expect, it } from "vitest";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import type { MediaFacts, ModelExtras } from "@gt/domain/library";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import type { IndexContext, LibraryEntry } from "../src/library/core.ts";
import { libraryDetail } from "../src/library/detail.ts";
import { queryLibrary } from "../src/library/query.ts";
import { libraryMigrations } from "../src/library/schema.ts";
import { putMediaFacts, recordExport, upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
function store(): Store {
  const k = must(openKernel(":memory:"));
  open.push(k);
  return k.store;
}

const SHA = "c".repeat(64);
const CTX: IndexContext = { styleOf: () => undefined };
const POSTER = "/api/foundry/file?kind=mesh&run=hooded-archer&path=t2-a%2Fposter.png";
const MODEL: ModelExtras = {
  asset: "hooded-archer",
  variant: "t2-a",
  class: "character",
  technique: "T2",
  budgetTris: 40_000,
  rig: "ue5-mannequin",
  poster: POSTER,
  gates: [{ name: "mesh", verdict: "warn", score: 85, fails: [], warns: ["bow arm thins below 2 px at 640x480"] }],
  limitations: [],
};

function model(id: string, over: Partial<LibraryItemInput> = {}): LibraryEntry {
  const item = {
    kind: "model" as const,
    id,
    title: "hooded archer · T2",
    state: "candidate" as const,
    collections: [],
    origin: "mesh" as const,
    rights: { use: "publishable" as const },
    source: "real" as const,
    lineage: [],
    vocabulary: { class: "character" as const, technique: "T2" as const, rigged: true, tris: 18_000 },
    media: { sha256: SHA, bytes: 1000, mime: "model/gltf-binary" },
    ...over,
  } as LibraryItemInput;
  return { item, meta: "character · 18,000 tris · game-camera design", extras: { model: MODEL }, feed: "mesh" };
}

const facts = (over: Partial<MediaFacts> = {}): MediaFacts => ({ sha: SHA, decodable: true, mime: "model/gltf-binary", w: null, h: null, durationS: null, posterSha: null, meanLuma: null, nearBlack: false, probedAt: "2026-10-22T09:00:00.000Z", error: null, ...over });

describe("a model in the index", () => {
  it("facets by class, technique, rig and triangle band, and its row carries the poster", () => {
    const s = store();
    must(upsertItems(s, [model("model:mesh:hooded-archer:t2-a")], CTX));
    const page = must(queryLibrary(s, { kind: "model", limit: 10 }));
    expect(page.total).toBe(1);
    expect(page.kindCounts.model).toBe(1);
    const row = page.items[0];
    expect(row?.poster).toBe(POSTER);
    expect(row?.cover.blobSha).toBeNull();
    const groups = Object.fromEntries(page.groups.map((g) => [g.key, g.values.map((v) => v.value)]));
    expect(groups).toMatchObject({ class: ["character"], technique: ["T2"], rig: ["rigged"], tris: ["10–20k"] });
    expect(must(queryLibrary(s, { q: "rig:rigged", limit: 10 })).total).toBe(1);
  });

  it("refuses a model whose extras name a class the asset store does not have", () => {
    // The extras arrive as a feed's JSON would: a class the closed set does not have is refused.
    const extras: Record<string, unknown> = { model: { ...MODEL, class: "vehicle" } };
    const bad: LibraryEntry = { ...model("model:mesh:x:y"), extras };
    expect(upsertItems(store(), [bad], CTX).ok).toBe(false);
  });

  it("keeps a glb's counts as its media fact and offers the export act on its detail", () => {
    const s = store();
    must(upsertItems(s, [model("model:mesh:hooded-archer:t2-a")], CTX));
    must(putMediaFacts(s, [facts({ mesh: { tris: 18_000, verts: 9_400, bones: 23, clips: 0, images: 1, bboxM: [0.62, 1.8, 0.4] } })]));
    const d = must(libraryDetail(s, "model:mesh:hooded-archer:t2-a"));
    expect(d.media?.mesh).toEqual({ tris: 18_000, verts: 9_400, bones: 23, clips: 0, images: 1, bboxM: [0.62, 1.8, 0.4] });
    expect(d.acts).toEqual(["pin", "use-in-project", "export"]);
    expect(d.extras.model?.gates[0]?.warns).toEqual(["bow arm thins below 2 px at 640x480"]);
  });

  it("an undecodable glb is flagged with the parser's words, and a non-model has no export act", () => {
    const s = store();
    must(upsertItems(s, [model("model:mesh:hooded-archer:t2-a")], CTX));
    must(putMediaFacts(s, [facts({ decodable: false, error: "glb: the magic is 0x00000000, not glTF" })]));
    const d = must(libraryDetail(s, "model:mesh:hooded-archer:t2-a"));
    expect(d.row.attention).toBe("unreadable");
    expect(d.media?.error).toBe("glb: the magic is 0x00000000, not glTF");
  });

  it("records an export as an event naming the project and the files written", () => {
    const s = store();
    must(upsertItems(s, [model("model:mesh:hooded-archer:t2-a")], CTX));
    must(recordExport(s, "model:mesh:hooded-archer:t2-a", "pof", ["/pof/generated/gravitone/a/a.glb"], { kind: "operator", id: "op" }));
    const ev = must(s.read((r) => r.all("SELECT type, data FROM events WHERE type = 'library.exported'")));
    expect(ev).toHaveLength(1);
    const data = parseJsonAt("event data", z.object({ project: z.string(), wrote: z.array(z.string()) }), String(ev[0]?.["data"]));
    expect(data.ok ? data.value : null).toEqual({ project: "pof", wrote: ["/pof/generated/gravitone/a/a.glb"] });
    expect(recordExport(s, "model:mesh:nope:x", "pof", [], { kind: "operator", id: "op" }).ok).toBe(false);
  });
});

describe("the v3 migration", () => {
  it("adds the mesh column and clears a glb that v2 probed with ffprobe, keeping every other fact", () => {
    const tmp = scratch("model-mig");
    try {
      const s = must(openStore(`${tmp.dir}/k.sqlite`));
      must(migrate(s, [{ module: "library", steps: libraryMigrations.steps.slice(0, 2) }], { snapshotDir: tmp.dir }));
      for (const [sha, mime] of [["a".repeat(64), "model/gltf-binary"], ["b".repeat(64), "image/png"]] as const)
        must(s.tx((t) => t.run("INSERT INTO media_facts (sha, decodable, mime, near_black, probed_at, error) VALUES (?, 0, ?, 0, ?, ?)", sha, mime, "2026-10-01T00:00:00.000Z", "ffprobe found no video stream")));
      const report = must(migrate(s, [libraryMigrations], { snapshotDir: tmp.dir }));
      expect(report.applied).toEqual([{ module: "library", version: 3 }]);
      expect(must(s.read((r) => r.all("SELECT mime, mesh FROM media_facts")))).toEqual([{ mime: "image/png", mesh: null }]);
      s.close();
    } finally {
      tmp.dispose();
    }
  });
});
