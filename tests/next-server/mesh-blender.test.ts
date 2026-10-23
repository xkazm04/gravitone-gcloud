// THE BLENDER RUNNER AND THE FINISH CHAIN AGAINST A FAKE BLENDER (spark game-3d-assets WP2;
// lib/foundry/mesh/blender.ts, finish.ts). The "binary" is a node script written below: it reads
// `-P <script> -- <args>` exactly as Blender would be handed them, and writes the files and the
// JSON result each ported script writes - or, when its control file says so, prints a traceback
// and exits non-zero. No Blender is started. MESH_STORE_DIR is set in this file, before any lib/
// module loads, so the asset store is a temp directory.

import { afterAll, describe, expect, it, vi } from "vitest";

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-mesh-blender-"));
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runBlender } from "../../lib/foundry/mesh/blender.ts";
import { finishVariant, type FinishEngines } from "../../lib/foundry/mesh/finish.ts";
import { readGlb, writeGlb } from "../../lib/foundry/mesh/glb.ts";
import { standInGlb } from "../../lib/foundry/mesh/standin.ts";
import { createAsset, readAsset, resolveInAsset } from "../../lib/foundry/mesh/store.ts";
import { fakeBlender } from "./mesh-fakes.ts";
import type { MeshAsset, Technique } from "../../lib/foundry/mesh/types.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const fake = fakeBlender(ROOT);
const control = fake.control;
const engines: FinishEngines = { command: fake.command, scripts: path.join("pipeline", "mesh", "blender"), ffmpeg: path.join(ROOT, "no-ffmpeg-here.exe"), stepTimeoutMs: 30_000, root: process.cwd() };
const io = { jobId: "job:run:finish:x", dry: false, stillHeld: () => undefined };

async function seed(id: string, cls: MeshAsset["brief"]["class"], technique: Technique, subject: string, rig = false): Promise<string> {
  const v = technique.toLowerCase();
  await createAsset({
    id,
    createdAt: new Date().toISOString(),
    brief: { class: cls, subject, budgetTris: cls === "character" ? 40_000 : 15_000, ...(rig ? { rig: "ue5-mannequin" as const } : {}) },
    concept: "concept.png",
    variants: [{ id: v, technique, status: "generated", limitations: [], files: { raw: `${v}/raw.glb` }, gates: [], jobs: [] }],
    dry: false,
    rights: "publishable",
  });
  mkdirSync(resolveInAsset(id, v), { recursive: true });
  writeFileSync(resolveInAsset(id, `${v}/raw.glb`), standInGlb(cls));
  writeFileSync(resolveInAsset(id, "concept.png"), "PNG");
  return v;
}

describe("the runner", () => {
  it("hands Blender -b --factory-startup --python-exit-code 1 -P <script> -- <args>, and reads the result FILE", async () => {
    control({});
    const out = path.join(ROOT, "echo.json");
    const r = await runBlender({ command: engines.command, script: path.join(ROOT, "echo.py"), args: [out, "x y"], result: out, timeoutMs: 30_000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ args: [out, "x y"] });
    expect(readFileSync(fake.log, "utf8")).toContain("echo.py -b --factory-startup --python-exit-code 1");
  });

  it("a non-zero exit is a failure carrying the script's stderr tail verbatim", async () => {
    control({ fail: "echo.py", code: 3 });
    const r = await runBlender({ command: engines.command, script: path.join(ROOT, "echo.py"), args: [path.join(ROOT, "e2.json")], result: path.join(ROOT, "e2.json"), timeoutMs: 30_000 });
    expect(r).toEqual({ ok: false, message: 'echo.py exited 3: Traceback (most recent call last):\n  File "echo.py", line 12\nRuntimeError: Error: Cannot open file for writing' });
  });

  it("exit 0 with no result file is a failure too: Blender's word is the file, not the exit", async () => {
    control({ silent: "echo.py" });
    const r = await runBlender({ command: engines.command, script: path.join(ROOT, "echo.py"), args: [], result: path.join(ROOT, "never.json"), timeoutMs: 30_000 });
    expect(r).toEqual({ ok: false, message: "echo.py exited 0 but wrote no result file never.json" });
  });

  it("a binary that is not there says so", async () => {
    const r = await runBlender({ command: [path.join(ROOT, "no-blender.exe")], script: "finish.py", args: [], result: "x.json", timeoutMs: 5_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^blender could not start for finish.py: /);
  });
});

describe("the finish chain, live, over the fake", () => {
  it("a rigged character: finish, rig, metrics, renders; files, gates and the honest residue land on the variant", async () => {
    control({});
    const v = await seed("hero-live", "character", "T1", "hooded archer", true);
    const r = await finishVariant("hero-live", v, io, engines);
    expect(r).toMatchObject({ ok: true, value: { kind: "done", status: "finished" } });
    const got = (await readAsset("hero-live")).variants[0];
    expect(got?.status).toBe("finished");
    expect(got?.files).toMatchObject({ glb: "t1/hero_live_t1_static.glb", rigged: "t1/hero_live_t1_rigged.glb", poster: "t1/hero_live_t1_hero.png", gameplay: "t1/hero_live_t1_gameplay.png", blend: "t1/hero_live_t1_rigged.blend" });
    expect(got?.files.turnaround).toBeUndefined();
    expect(got?.tris).toBe(432);
    expect(Object.fromEntries((got?.gates ?? []).map((g) => [g.name, g.verdict]))).toEqual({ mesh: "warn", budget: "pass", scale: "pass", rig: "warn" });
    expect(got?.gates.find((g) => g.name === "mesh")?.warns).toEqual(["not watertight (open boundary / holes)"]);
    expect(got?.limitations).toEqual(["12 vertices took nearest-bone weights because the proxy heat left them unweighted", expect.stringMatching(/^no turnaround: ffmpeg could not compose the four views: /)]);
    expect(got?.jobs).toEqual(["job:run:finish:x"]);
  });

  it("a non-zero exit marks the variant failed with the stderr tail verbatim", async () => {
    control({ fail: "rig.py", code: 3 });
    const v = await seed("hero-fail", "character", "T2", "monk", true);
    const r = await finishVariant("hero-fail", v, io, engines);
    expect(r).toMatchObject({ ok: true, value: { kind: "done", status: "failed" } });
    const got = (await readAsset("hero-fail")).variants[0];
    expect(got?.status).toBe("failed");
    expect(got?.error).toBe('rig.py exited 3: Traceback (most recent call last):\n  File "rig.py", line 12\nRuntimeError: Error: Cannot open file for writing');
    expect(got?.gates).toEqual([]);
  });

  it("a weapon's M1 runs the touch-up with the kind its subject names, and carries what it could not fix", async () => {
    control({});
    const v = await seed("axe-live", "weapon", "M1", "viking battle axe");
    await finishVariant("axe-live", v, io, engines);
    const got = (await readAsset("axe-live")).variants[0];
    expect(got?.status).toBe("finished");
    expect(got?.files.glb).toBe("m1/axe_live_m1_touchup.glb");
    expect(got?.limitations[0]).toMatch(/^second blade is deleted, not replaced/);
    expect(readFileSync(fake.log, "utf8")).toMatch(/touchup\.py/);
  });

  it("an M1 whose subject names no weapon kind fails before Blender is asked", async () => {
    control({});
    const v = await seed("odd-live", "weapon", "M1", "a ceremonial thing");
    await finishVariant("odd-live", v, io, engines);
    expect((await readAsset("odd-live")).variants[0]?.error).toBe('the M1 touch-up knows sword, mace, axe and staff; the subject "a ceremonial thing" names none of them');
  });

  it("a finished file exported with Draco is refused by the read-back", async () => {
    control({ silent: "nothing" });
    const v = await seed("drac-live", "prop", "T1", "crate");
    const g = readGlb(standInGlb("prop"));
    const drac = writeGlb({ ...g.json, extensionsUsed: ["KHR_draco_mesh_compression"] }, g.bin ?? new Uint8Array());
    writeFileSync(resolveInAsset("drac-live", `${v}/raw.glb`), drac);
    await finishVariant("drac-live", v, io, engines);
    const got = (await readAsset("drac-live")).variants[0];
    expect(got?.status).toBe("failed");
    expect(got?.error).toBe("t1/drac_live_t1_static.glb was exported with Draco compression, which PoF's viewer cannot decode");
    expect(existsSync(resolveInAsset("drac-live", "t1/drac_live_t1_static.glb"))).toBe(true);
  });
});
