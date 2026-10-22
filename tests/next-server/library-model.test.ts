// The game assets in the Library and out of it (spark game-3d-assets WP3): the mesh feed shelves
// every finished variant as a `model` item, the export writes a variant into a game project's
// checkout in that project's own shape - files only, never git, an absent checkout or an
// over-cap file refused before anything is written - and both Library sides offer and answer the
// act. Every store and target root here is a temp directory.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MODEL_CLASSES, MODEL_EXPORT_PROJECTS, MODEL_TECHNIQUES } from "@gt/domain/library";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { upsertItems } from "@gt/kernel/library/write";
import { buildGlb, figure } from "@gt/producers/media-facts/glbSample";

import { fixtureAct, fixtureDetail, fixtureQuery, resetLibraryFixture } from "../../app/(studio)/library/_port/fixture.ts";
import { makeRealLibrary } from "../../app/(studio)/library/_port/real.ts";
import { BP_FILE_CAP, exportRoot, exportVariant, planExport } from "../../lib/foundry/mesh/export.ts";
import { createAsset } from "../../lib/foundry/mesh/store.ts";
import { ASSET_CLASSES, EXPORT_PROJECTS, TECHNIQUES, type MeshAsset } from "../../lib/foundry/mesh/types.ts";
import { meshFeed, modelItemId, shelveAsset } from "../../lib/library/feeds/mesh.ts";

let tmp: string;
const open: Kernel[] = [];
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "g3-model-"));
  vi.stubEnv("MESH_STORE_DIR", path.join(tmp, "mesh"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of open.splice(0)) k.close();
  rmSync(tmp, { recursive: true, force: true });
});

const GLB = buildGlb({ meshes: [{ boxes: figure(), color: [0.4, 0.3, 0.2] }], bones: 5 });

function asset(over: Partial<MeshAsset> = {}): MeshAsset {
  return {
    id: "hooded-archer",
    createdAt: "2026-10-22T06:00:00.000Z",
    brief: { class: "character", subject: "hooded archer", budgetTris: 40_000, rig: "ue5-mannequin" },
    concept: "concept.png",
    night: "2026-10-21",
    dry: false,
    rights: "publishable",
    variants: [
      { id: "t2-a", technique: "T2", status: "finished", limitations: ["hood and head share one material"], files: { glb: "t2-a/a.glb", rigged: "t2-a/a-rigged.glb", poster: "t2-a/poster.png" }, gates: [{ name: "mesh", version: "lynx pofmetrics.py@2026-10-20", score: 85, verdict: "warn", fails: [], warns: ["thin bow arm"] }], tris: 108, jobs: ["job:run:mesh-1"], verdict: "kept" },
      { id: "t1-a", technique: "T1", status: "finished", limitations: [], files: { glb: "t1-a/a.glb" }, gates: [], jobs: [] },
      { id: "t1-b", technique: "T1", status: "failed", error: "out of memory", limitations: [], files: {}, gates: [], jobs: [] },
    ],
    ...over,
  };
}

async function onDisk(a: MeshAsset, sizes: Readonly<Record<string, Uint8Array>> = {}): Promise<void> {
  await createAsset(a);
  const dir = path.join(tmp, "mesh", a.id);
  for (const rel of ["concept.png", "t2-a/a.glb", "t2-a/a-rigged.glb", "t2-a/poster.png", "t1-a/a.glb"]) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), sizes[rel] ?? (rel.endsWith(".glb") ? GLB : new Uint8Array([137, 80, 78, 71])));
  }
}

const root = (name: string): string => {
  const r = path.join(tmp, name);
  mkdirSync(r, { recursive: true });
  return r;
};
const files = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)).replace(/\\/g, "/")).sort();

describe("the closed sets", () => {
  it("the domain's model sets are the mesh store's", () => {
    expect([...MODEL_CLASSES]).toEqual([...ASSET_CLASSES]);
    expect([...MODEL_TECHNIQUES]).toEqual([...TECHNIQUES]);
    expect([...MODEL_EXPORT_PROJECTS]).toEqual([...EXPORT_PROJECTS]);
  });
});

describe("the mesh feed", () => {
  it("shelves each finished variant as a model: the rigged glb when rigged, the poster by the file route, the verdict as state", () => {
    const r = shelveAsset(asset(), "real");
    expect(r.items.map((i) => i.item.id)).toEqual([modelItemId("hooded-archer", "t2-a"), modelItemId("hooded-archer", "t1-a")]);
    const [kept, open1] = r.items;
    expect(kept?.item).toMatchObject({ kind: "model", state: "ratified", origin: "mesh", rights: { use: "publishable" }, vocabulary: { class: "character", technique: "T2", rigged: true, tris: 108 }, collections: [{ kind: "run", id: "2026-10-21" }] });
    expect(kept?.file?.abs.endsWith(path.join("t2-a", "a-rigged.glb"))).toBe(true);
    expect(kept?.file?.mime).toBe("model/gltf-binary");
    expect(kept?.extras.model).toMatchObject({ asset: "hooded-archer", variant: "t2-a", rig: "ue5-mannequin", poster: "/api/foundry/file?kind=mesh&run=hooded-archer&path=t2-a%2Fposter.png", limitations: ["hood and head share one material"] });
    expect(kept?.extras.model?.gates[0]).toEqual({ name: "mesh", verdict: "warn", score: 85, fails: [], warns: ["thin bow arm"] });
    expect(open1?.item).toMatchObject({ state: "candidate", vocabulary: { rigged: false } });
    expect(open1?.extras.model).not.toHaveProperty("poster");
  });

  it("indexes through the kernel's door, and reads the store, skipping a dry asset", async () => {
    await onDisk(asset());
    await createAsset(asset({ id: "dry-crate", dry: true }));
    const read = await meshFeed.read({ universe: "real" });
    expect(read.items).toHaveLength(2);
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    open.push(k.value);
    const up = upsertItems(k.value.store, read.items.map((i) => ({ item: i.item, meta: i.meta, extras: i.extras, feed: "mesh" })), { styleOf: () => undefined });
    expect(up.ok).toBe(true);
  });
});

describe("the export", () => {
  it("pof: the glb and its sidecar under generated/gravitone", async () => {
    await onDisk(asset());
    const r = root("pof");
    const done = await exportVariant("hooded-archer", "t2-a", "pof", { root: r, now: "2026-10-22T12:00:00.000Z" });
    const dir = path.join(r, "generated", "gravitone", "hooded-archer-t2-a");
    expect(done.dir).toBe(dir);
    expect(files(dir)).toEqual(["hooded-archer-t2-a.glb", "hooded-archer-t2-a.gravitone.json"]);
    expect(new Uint8Array(readFileSync(path.join(dir, "hooded-archer-t2-a.glb")))).toEqual(GLB);
    const side = JSON.parse(readFileSync(path.join(dir, "hooded-archer-t2-a.gravitone.json"), "utf8")) as Record<string, unknown>;
    expect(side).toMatchObject({ id: "hooded-archer-t2-a", asset: "hooded-archer", variant: "t2-a", class: "character", technique: "T2", budgetTris: 40_000, tris: 108, heightM: 1.8, rig: "ue5-mannequin", rights: "publishable", limitations: ["hood and head share one material"], provenance: { made: "2026-10-22T06:00:00.000Z", night: "2026-10-21", concept: "concept.png" } });
    expect(existsSync(path.join(r, ".git"))).toBe(false);
  });

  it("bp: final.glb, the concept, the poster as evidence and bp's own manifest shape", async () => {
    await onDisk(asset());
    const r = root("bp");
    await exportVariant("hooded-archer", "t2-a", "bp", { root: r, now: "2026-10-22T12:00:00.000Z" });
    const dir = path.join(r, "apps", "vr", "ArtSource", "hooded-archer-t2-a");
    expect(files(dir)).toEqual(["concept.png", "evidence/poster.png", "final.glb", "manifest.json"]);
    const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Record<string, unknown>;
    expect(m).toMatchObject({ id: "hooded-archer-t2-a", class: "character", budget_tris: 40_000, tris: 108, gates: { mesh: { pass: false, note: "score 85; warn: thin bow arm", date: "2026-10-22" } }, file_bytes: { "final.glb": GLB.byteLength } });
    expect(Object.keys(m["sha256"] as object).sort()).toEqual(["concept.png", "evidence/poster.png", "final.glb"]);
  });

  it("mage-arena: export/<SK|SM>_<Name>.glb under characters, and its T38 manifest of items", async () => {
    await onDisk(asset());
    const r = root("mage-arena");
    await exportVariant("hooded-archer", "t2-a", "mage-arena", { root: r, now: "2026-10-22T12:00:00.000Z" });
    const dir = path.join(r, "apps", "vr", "art", "characters", "hooded-archer-t2-a");
    expect(files(dir)).toEqual(["export/HoodedArcher_poster.png", "export/SK_HoodedArcher.glb", "manifest.json"]);
    const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { items: { asset: string; path: string; bytes: number }[] };
    expect(m.items[0]).toMatchObject({ asset: "SK_HoodedArcher", path: "apps/vr/art/characters/hooded-archer-t2-a/export/SK_HoodedArcher.glb", bytes: GLB.byteLength });
  });

  it("refuses an absent checkout and writes nothing", async () => {
    await onDisk(asset());
    const missing = path.join(tmp, "no-such-pof");
    await expect(exportVariant("hooded-archer", "t2-a", "pof", { root: missing })).rejects.toThrow(`The pof checkout is not at ${missing}; set EXPORT_ROOT_POF to where it is.`);
    expect(existsSync(missing)).toBe(false);
  });

  it("refuses a bp file over 10 MB with its size, before writing any", async () => {
    await onDisk(asset(), { "t2-a/a-rigged.glb": new Uint8Array(BP_FILE_CAP + 1) });
    const r = root("bp");
    await expect(exportVariant("hooded-archer", "t2-a", "bp", { root: r })).rejects.toThrow(`final.glb is ${BP_FILE_CAP + 1} bytes; bp keeps every file under ${BP_FILE_CAP} bytes (no LFS).`);
    expect(readdirSync(r)).toEqual([]);
  });

  it("refuses a variant that is not finished, and names the roots from the environment", async () => {
    await expect(planExport(asset(), "t1-b", "pof", { root: tmp, now: "2026-10-22T12:00:00.000Z" })).rejects.toThrow("Variant hooded-archer/t1-b is failed, not finished: there is no glb to hand off.");
    expect(exportRoot("bp", { EXPORT_ROOT_BP: "D:/bp" })).toBe("D:/bp");
    expect(exportRoot("mage-arena", {})).toBe(path.resolve(process.cwd(), "..", "mage-arena"));
  });
});

describe("the Library sides", () => {
  it("real: export writes through the exporter, then records library.exported; a non-model is refused", async () => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    open.push(k.value);
    const s = k.value.store;
    const items = shelveAsset(asset(), "real").items.map((i) => ({ item: i.item, meta: i.meta, extras: i.extras, feed: "mesh" }));
    const up = upsertItems(s, [...items, { feed: "t", meta: "doc", extras: {}, item: { kind: "doc", id: "doc:x", title: "x", state: "reference", collections: [], origin: "registry", rights: { use: "publishable" }, source: "real", lineage: [], vocabulary: { bundle: "b", subject: "s", techniques: 2 } } }], { styleOf: () => undefined });
    if (!up.ok) throw up.error;
    const calls: string[] = [];
    const lib = makeRealLibrary({ store: () => ({ ok: true, value: s }), atelierOf: (x) => x, exporter: async (a, v, p) => (calls.push(`${a}/${v}->${p}`), { project: p, dir: "/pof/generated/gravitone/hooded-archer-t2-a", wrote: ["/pof/x.glb"] }) });
    const id = modelItemId("hooded-archer", "t2-a");
    const d = lib.detail(id, {});
    if (!d.ok) throw d.error;
    expect(d.value.acts).toContain("export");
    const done = await lib.exportItem(id, "pof", {});
    if (!done.ok) throw done.error;
    expect(calls).toEqual(["hooded-archer/t2-a->pof"]);
    expect(done.value.said).toBe("hooded archer · T2 → pof · /pof/generated/gravitone/hooded-archer-t2-a");
    const ev = queryEvents(s, { type: ["library.exported"], limit: 10 });
    if (!ev.ok) throw ev.error;
    expect(ev.value.events).toHaveLength(1);
    const no = await lib.exportItem("doc:x", "pof", {});
    expect(no.ok ? "" : no.error.message).toBe("x is not a model: only a model is exported to a game project");
  });

  it("fixture: four models in the 5,000, each with tris and bones measured from its own glb, and export logs without writing", () => {
    resetLibraryFixture();
    const p = fixtureQuery({ kind: "model", limit: 10 });
    if (!p.ok) throw p.error;
    expect(p.value.total).toBe(4);
    const hero = fixtureDetail("model:mesh:hooded-archer:t2-a");
    if (!hero.ok) throw hero.error;
    expect(hero.value.media?.mesh).toMatchObject({ tris: 108, bones: 5 });
    expect(hero.value.acts).toContain("export");
    expect(hero.value.row.poster).toMatch(/^data:image\/svg\+xml/);
    const said = fixtureAct("model:mesh:hooded-archer:t2-a", { act: "export", project: "bp" }, () => "2026-10-22T12:00:00.000Z");
    expect(said.ok ? said.value.said : "").toBe("hooded archer, leather, chunky silhouette · T2 → bp · fixture, no file written");
  });
});
