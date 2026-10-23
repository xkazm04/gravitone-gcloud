// A NIGHT'S GAME ASSETS ON THE BOARD (spark game-3d-assets WP4) - lib/decision/v1/sources/scout.ts
// over `asset3d` candidates: a `3d` row per asset whose reference is its concept, a cell per
// FINISHED variant (the glb as media, the poster on the tile, the work in its words), a failed or
// unfinished variant a Loss with its own sentence; the commit writing each judged variant's verdict
// into its mesh asset before the night's record, idempotent and complete from every crash prefix;
// a dry night recording verdicts only. Then the two readers of those verdicts: the Library's mesh
// feed (a kept T2 is ratified) and the next night's taste (T1 against T2, by class). Every store is
// a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-asset-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { MeshAsset, MeshVariant } from "../../lib/foundry/mesh/types.ts";
import { tasteOf } from "../../lib/foundry/scout/taste.ts";
import type { Candidate, Night } from "../../lib/foundry/scout/types.ts";
import { shelveAsset } from "../../lib/library/feeds/mesh.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const gate = (name: "input" | "mesh" | "rig", verdict: "pass" | "warn", score: number) => ({ name, version: "test@1", verdict, score, fails: [], warns: [] }) as const;
function variant(id: string, over: Partial<MeshVariant>): MeshVariant {
  return { id, technique: id.toUpperCase() as MeshVariant["technique"], status: "finished", limitations: [], files: {}, gates: [], jobs: [`job:run:finish:x-${id}`], ...over };
}
const finished = (asset: string, id: string, rigged: boolean): Partial<MeshVariant> => ({
  files: { glb: `${id}/${asset}_${id}_static.glb`, poster: `${id}/${asset}_${id}_hero.png`, ...(rigged ? { rigged: `${id}/${asset}_${id}_rigged.glb` } : {}) },
});

function assets(night: string): MeshAsset[] {
  const hero: MeshAsset = {
    id: `${night}-hero`,
    createdAt: `${night}T01:00:00.000Z`,
    brief: { class: "character", subject: "hooded archer, leather jerkin, quiver", budgetTris: 40_000, rig: "ue5-mannequin" },
    concept: "concept.png",
    night,
    dry: night === DRY,
    rights: "publishable",
    variants: [
      variant("t1", { ...finished(`${night}-hero`, "t1", true), tris: 37_812, approach: "TRELLIS.2 budget generation", gates: [gate("input", "pass", 100), gate("mesh", "warn", 70)] }),
      variant("t2", { ...finished(`${night}-hero`, "t2", true), tris: 18_000, approach: "game-camera design", concept: "concept-game-camera.png", gates: [gate("input", "pass", 100), gate("mesh", "warn", 85), gate("rig", "pass", 92)] }),
    ],
  };
  const axe: MeshAsset = {
    id: `${night}-axe`,
    createdAt: `${night}T01:30:00.000Z`,
    brief: { class: "weapon", kind: "axe", subject: "bearded battle axe", budgetTris: 15_000 },
    concept: "concept.png",
    night,
    dry: night === DRY,
    rights: "publishable",
    variants: [
      variant("t1", { ...finished(`${night}-axe`, "t1", false), tris: 14_990, gates: [gate("input", "pass", 100)] }),
      variant("m1", { status: "failed", error: "touchup.py exited 1: no haft axis found" }),
    ],
  };
  return [hero, axe];
}

function candidates(night: string): Candidate[] {
  const [hero, axe] = assets(night);
  return [
    { id: "c-01", kind: "asset3d", sourceIds: [], status: "rendered", jobId: `job:scout-asset:${night}:c-01`, brief: hero?.brief ?? ({} as never), concepts: ["assets/c-01/concept-1.png", "assets/c-01/concept-2.png"], assetId: hero?.id ?? "" },
    { id: "c-02", kind: "asset3d", sourceIds: [], status: "rendered", jobId: `job:scout-asset:${night}:c-02`, brief: axe?.brief ?? ({} as never), concepts: ["assets/c-02/concept-1.png"], assetId: axe?.id ?? "" },
    { id: "c-03", kind: "asset3d", sourceIds: [], status: "failed", brief: { class: "prop", subject: "iron lantern", budgetTris: 10_000 }, concepts: ["assets/c-03/concept-1.png"], error: "no mesh launched: t1 - the input gate read concept-1 as fail: busy-background: 40% of the border is the background colour (under 85%)" },
  ];
}

function seedNight(id: string, dry: boolean): void {
  const dir = path.join(out, "scout", id);
  for (const f of ["assets/c-01/concept-1.png", "assets/c-01/concept-2.png", "assets/c-02/concept-1.png", "assets/c-03/concept-1.png"]) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), `png ${id} ${f}`);
  }
  for (const a of assets(id)) {
    for (const v of a.variants) for (const f of Object.values(v.files)) {
      mkdirSync(path.dirname(path.join(out, "mesh", a.id, f)), { recursive: true });
      writeFileSync(path.join(out, "mesh", a.id, f), `bytes ${a.id} ${f}`);
    }
    writeFileSync(path.join(out, "mesh", a.id, "asset.json"), JSON.stringify(a));
  }
  const night: Night = { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, assetCap: 3, dry, state: "closed", stop: "target", closedAt: `${id}T05:00:00.000Z`, sources: [], candidates: candidates(id), jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  seedNight(NIGHT, false);
  seedNight(DRY, true);
}

const assetOf = (id: string): MeshAsset => JSON.parse(readFileSync(path.join(out, "mesh", id, "asset.json"), "utf8")) as MeshAsset;
const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;
const meshUrl = (asset: string, rel: string): string => `/api/foundry/file?kind=mesh&run=${encodeURIComponent(asset)}&path=${encodeURIComponent(rel)}`;
const HERO = `${NIGHT}-hero`;
const AXE = `${NIGHT}-axe`;

const VERDICTS = [
  { candidate: "c-01/t1", verdict: "reject" as const, reasons: ["topology"] },
  { candidate: "c-01/t2", verdict: "keep" as const },
  { candidate: "c-02/t1", verdict: "keep" as const },
];

describe("the packet's 3d rows", () => {
  it("a row per asset under `3d`, its concept the reference; a cell per finished variant, the glb its media and the poster its tile", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime])).toEqual([
      ["c-01/t1", "c-01", "model/gltf-binary"],
      ["c-01/t2", "c-01", "model/gltf-binary"],
      ["c-02/t1", "c-02", "model/gltf-binary"],
    ]);
    expect(present.rows).toEqual([
      { id: "c-01", label: "character · hooded archer, leather…", group: "3d", ref: `/api/foundry/file?run=${NIGHT}&path=assets%2Fc-01%2Fconcept-1.png&kind=scout` },
      { id: "c-02", label: "weapon · bearded battle axe", group: "3d", ref: `/api/foundry/file?run=${NIGHT}&path=assets%2Fc-02%2Fconcept-1.png&kind=scout` },
    ]);
    // The rigged glb is the one a game imports, so it is what the zoom orbits.
    expect(urls["c-01/t2"]).toBe(meshUrl(HERO, "t2/2026-10-21-hero_t2_rigged.glb"));
    expect(present.items["c-01/t2"]).toEqual({
      label: "T2 · game-camera design",
      meta: "18,000 / 40,000 tris · input pass 100 · mesh warn 85 · rig pass 92",
      prompt: "game-camera design",
      poster: meshUrl(HERO, "t2/2026-10-21-hero_t2_hero.png"),
    });
    expect(losses).toContainEqual({ candidate: "c-02/m1", grade: "dropped", reason: "touchup.py exited 1: no haft axis found" });
    expect(losses).toContainEqual({ candidate: "c-03", grade: "dropped", reason: "no mesh launched: t1 - the input gate read concept-1 as fail: busy-background: 40% of the border is the background colour (under 85%)" });
  });

  it("a variant still in the worker's hands is a Loss that says which job it waits on", async () => {
    seed();
    const a = assetOf(AXE);
    writeFileSync(path.join(out, "mesh", AXE, "asset.json"), JSON.stringify({ ...a, variants: a.variants.map((v) => (v.id === "t1" ? { ...v, status: "generated" } : v)) }));
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(flow.plan.packet.items.map((c) => c.id)).toEqual(["c-01/t1", "c-01/t2"]);
    expect(flow.plan.losses).toContainEqual({ candidate: "c-02/t1", grade: "dropped", reason: "t1 is generated: its finish job has not finished" });
  });
});

describe("the commit", () => {
  const snapshot = (): string[] => [assetOf(HERO), assetOf(AXE)].map((a) => JSON.stringify(a)).concat(JSON.stringify({ ...nightOf(NIGHT).committed, at: "" }));

  it("previews each asset.json and each kept model, writes the verdicts into the assets, then the night's record", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(VERDICTS);
    const p = must(flow.preview()).consequence;
    expect(p.counts).toEqual({ kept: 2, rejected: 1, undecided: 0 });
    expect(p.writes).toContainEqual({ kind: "file", target: `foundry-out/mesh/${HERO}/asset.json`, candidate: "c-01/t1", detail: "t1: rejected" });
    expect(p.writes).toContainEqual({ kind: "file", target: `foundry-out/mesh/${HERO}/asset.json`, candidate: "c-01/t2", detail: "t2: kept" });
    expect(p.promotions).toEqual([
      { target: `model:mesh:${HERO}:t2`, candidate: "c-01/t2", detail: "a publishable model in the Library" },
      { target: `model:mesh:${AXE}:t1`, candidate: "c-02/t1", detail: "a publishable model in the Library" },
    ]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(assetOf(HERO).variants.map((v) => [v.id, v.verdict])).toEqual([
      ["t1", "rejected"],
      ["t2", "kept"],
    ]);
    expect(assetOf(AXE).variants.map((v) => [v.id, v.verdict])).toEqual([
      ["t1", "kept"],
      ["m1", undefined],
    ]);
    expect(nightOf(NIGHT)).toMatchObject({ state: "committed", committed: { kept: ["c-01/t2", "c-02/t1"], rejected: ["c-01/t1"], reasons: { "c-01/t1": ["topology"] }, dry: false } });

    // The Library's mesh feed reads the verdicts back: T2 kept is ratified, T1 rejected.
    const shelved = shelveAsset(assetOf(HERO), "real").items.map((i) => [i.item.id, i.item.state]);
    expect(shelved).toEqual([
      [`model:mesh:${HERO}:t1`, "rejected"],
      [`model:mesh:${HERO}:t2`, "ratified"],
    ]);
    // The next night's taste: T1 against T2, by class, with the reasons a throw was given.
    const md = tasteOf([nightOf(NIGHT)]);
    expect(md).toContain(["## Game assets", "", "- character T1: kept 0 · thrown 1 (topology 1)", "- character T2: kept 1 · thrown 0", "- weapon T1: kept 1 · thrown 0", ""].join("\n"));
    expect(md).toContain(`  - threw asset3d c-01/t1 "hooded archer, leather jerkin, quiver" [character]: topology`);
  });

  it("a second delivery is a no-op, and every crash prefix completes to the same disk", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(VERDICTS);
    must(flow.commit());
    const claim = flow.claim();
    must(await scoutAdapter.apply(claim));
    const want = snapshot();
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);

    // Crashed after the first asset's verdicts, before the second's and the night's record.
    seed();
    const hero = assetOf(HERO);
    writeFileSync(path.join(out, "mesh", HERO, "asset.json"), JSON.stringify({ ...hero, variants: hero.variants.map((v) => ({ ...v, verdict: v.id === "t2" ? "kept" : "rejected" })) }));
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
    // Crashed half way through one asset: one variant's verdict written, the other not.
    seed();
    writeFileSync(path.join(out, "mesh", HERO, "asset.json"), JSON.stringify({ ...hero, variants: hero.variants.map((v) => (v.id === "t1" ? { ...v, verdict: "rejected" } : v)) }));
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
    // Crashed after every asset write, before the night's record.
    seed();
    must(await scoutAdapter.apply(claim));
    writeFileSync(path.join(out, "scout", NIGHT, "night.json"), JSON.stringify({ ...nightOf(NIGHT), state: "closed", committed: undefined }));
    must(await scoutAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
  });

  it("a dry night records the verdicts and leaves every asset as it was", async () => {
    seed();
    const before = [`${DRY}-hero`, `${DRY}-axe`].map((id) => JSON.stringify(assetOf(id)));
    const flow = await openFlow(scoutAdapter, DRY, blobDir);
    flow.patch(VERDICTS);
    const p = must(flow.preview()).consequence;
    expect(p.writes).toEqual([{ kind: "file", target: `foundry-out/scout/${DRY}/night.json`, detail: "committed · dry: the verdicts only; no style, scene or knowledge is admitted" }]);
    expect(p.promotions).toEqual([]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(nightOf(DRY)).toMatchObject({ state: "committed", committed: { dry: true, kept: ["c-01/t2", "c-02/t1"], rejected: ["c-01/t1"] } });
    expect([`${DRY}-hero`, `${DRY}-axe`].map((id) => JSON.stringify(assetOf(id)))).toEqual(before);
  });
});
