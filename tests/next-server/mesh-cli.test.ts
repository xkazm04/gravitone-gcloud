// A GAME ASSET END TO END (spark game-3d-assets WP2) - lib/foundry/mesh/cli-acts.ts, the functions
// pipeline/mesh.mts calls, over a temp kernel store and a temp asset store (both set below, before
// any lib/ module loads). Dry: stand-ins, no engine. Live: the fake ComfyUI and the fake Blender of
// ./mesh-fakes.ts, so the real engines' wiring (health, submit, the settle that queues the finish,
// the Blender chain) runs with nothing of the box's touched. The concept's pixels are handed to the
// gate by a fake decoder keyed on the file name.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-mesh-cli-"));
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import { get } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { nodeComfyPorts, readWorkflow } from "../../lib/foundry/mesh/comfy.ts";
import { decide, newAsset, retryFinish, type Engines } from "../../lib/foundry/mesh/cli-acts.ts";
import type { Pixels } from "../../lib/foundry/mesh/inputGate.ts";
import { assetDir, readAsset } from "../../lib/foundry/mesh/store.ts";
import { finishProducer } from "../../lib/producers/finish.ts";
import { meshProducer, stageEnded } from "../../lib/producers/mesh.ts";
import { fakeBlender, fakeComfy, type FakeComfy } from "./mesh-fakes.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
let k: Kernel;
let comfy: FakeComfy;
beforeAll(async () => {
  const r = openKernel(LOC);
  if (!r.ok) throw r.error;
  k = r.value;
  comfy = await fakeComfy();
});
afterAll(async () => {
  k.close();
  await comfy.close();
  rmSync(ROOT, { recursive: true, force: true });
});

const OP = { kind: "operator", id: "mesh-test" } as const;
const S = 256;
function pixels(paint: (x: number, y: number) => readonly [number, number, number]): Pixels {
  const rgba = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) rgba.set([...paint(x, y), 255], (y * S + x) * 4);
  return { width: S, height: S, rgba };
}
const inBox = (x: number, y: number, x0: number, x1: number): boolean => x >= x0 && x < x1 && y >= 30 && y < 226;
const PICTURES: Record<string, Pixels> = {
  "good.png": pixels((x, y) => (inBox(x, y, 90, 166) ? [180, 30, 30] : [245, 245, 245])),
  "two.png": pixels((x, y) => (inBox(x, y, 20, 100) || inBox(x, y, 150, 230) ? [180, 30, 30] : [245, 245, 245])),
  "busy.png": pixels((x, y) => (inBox(x, y, 90, 166) ? [180, 30, 30] : [(x * 37 + y * 91) % 256, (x * 13) % 256, (y * 53) % 256])),
};
for (const f of Object.keys(PICTURES)) writeFileSync(path.join(ROOT, f), "PNG stand-in bytes");
const decode: Engines["decode"] = async (file) => {
  const p = PICTURES[path.basename(file)];
  return p === undefined ? { ok: false, why: `no picture ${file}` } : { ok: true, value: p };
};
const concept = (f: string): string => path.join(ROOT, f);
const jobOf = (id: string) => {
  const r = get(k.store, jobIdSchema.parse(id));
  return r.ok ? r.value.job : undefined;
};
function count(like: string): number {
  const r = k.store.read((rd) => rd.get("SELECT count(*) AS n FROM jobs WHERE id LIKE ?", like)?.["n"]);
  if (!r.ok) throw r.error;
  return Number(r.value);
}

describe("a dry `new`", () => {
  it("runs end to end: every variant finished with a glb, a poster and its gates; mesh on gpu.local (comfy), then finish on box.blender (blender)", async () => {
    const r = await newAsset(k.store, LOC, { id: "hero-dry", cls: "character", subject: "hooded archer, leather", concept: concept("good.png"), rig: true, actor: OP, dryOnly: true }, { decode });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== "made") throw new Error("not made");
    const a = await readAsset("hero-dry");
    expect(a.dry).toBe(true);
    expect(a.brief).toEqual({ class: "character", subject: "hooded archer, leather", budgetTris: 40_000, rig: "ue5-mannequin" });
    expect(a.variants.map((v) => [v.id, v.technique, v.status])).toEqual([
      ["t1", "T1", "finished"],
      ["t2", "T2", "finished"],
    ]);
    for (const v of a.variants) {
      for (const f of [v.files.raw, v.files.glb, v.files.poster, v.files.rigged]) expect(f !== undefined && existsSync(path.join(assetDir(a.id), f)), `${v.id} ${f}`).toBe(true);
      expect(v.gates.map((g) => g.name)).toEqual(["input", "mesh", "budget", "scale", "rig"]);
      expect(v.gates.every((g) => g.verdict !== "fail")).toBe(true);
      expect(v.jobs).toEqual(["job:run:mesh:hero-dry", "job:run:finish:hero-dry"]);
    }
    const mesh = jobOf("job:run:mesh:hero-dry");
    const finish = jobOf("job:run:finish:hero-dry");
    expect([mesh?.lane, mesh?.state, mesh?.mode.kind, mesh?.producer]).toEqual(["gpu.local", "done", "dry", "mesh"]);
    expect([finish?.lane, finish?.state, finish?.mode.kind, finish?.producer]).toEqual(["box.blender", "done", "dry", "finish"]);
    expect([meshProducer().engine, finishProducer().engine]).toEqual(["comfy", "blender"]);
    expect(r.value.drove.map((d) => [d.jobId, d.outcome])).toEqual([
      ["job:run:mesh:hero-dry", "done"],
      ["job:run:finish:hero-dry", "done"],
    ]);
  });

  it("a weapon makes T1 and its M1 touch-up, the M1 from T1's own mesh", async () => {
    const r = await newAsset(k.store, LOC, { id: "axe-dry", cls: "weapon", subject: "viking battle axe", concept: concept("good.png"), actor: OP, dryOnly: true }, { decode });
    expect(r.ok).toBe(true);
    const a = await readAsset("axe-dry");
    expect(a.variants.map((v) => [v.id, v.status])).toEqual([
      ["t1", "finished"],
      ["m1", "finished"],
    ]);
    expect(a.variants[1]?.approach).toMatch(/^automated touch-up of the T1 mesh/);
  });

  it("refuses what cannot be made before anything is written", async () => {
    const bad = async (o: Partial<Parameters<typeof newAsset>[2]>) => newAsset(k.store, LOC, { id: "nope", cls: "prop", subject: "crate", concept: concept("good.png"), actor: OP, dryOnly: true, ...o }, { decode });
    expect((await bad({ techniques: ["M1"] })).ok).toBe(false);
    expect((await bad({ techniques: ["T1", "M2"] })).ok).toBe(false);
    expect((await bad({ rig: true })).ok).toBe(false);
    expect((await bad({ id: "Not An Id" })).ok).toBe(false);
    expect(existsSync(assetDir("nope"))).toBe(false);
  });
});

describe("the input gate refuses before a GPU minute is spent", () => {
  for (const [file, code] of [
    ["busy.png", "busy-background"],
    ["two.png", "multiple-subjects"],
  ] as const) {
    it(`${file}: refused by ${code}, no asset written, no job queued`, async () => {
      const id = `refused-${code}`;
      const r = await newAsset(k.store, LOC, { id, cls: "prop", subject: "crate", concept: concept(file), actor: OP, dryOnly: true, live: false }, { decode });
      expect(r.ok).toBe(true);
      if (!r.ok || r.value.kind !== "refused") throw new Error("not refused");
      expect(r.value.gate.verdict).toBe("fail");
      expect(r.value.gate.fails.map((f) => f.split(":")[0])).toContain(code);
      expect(existsSync(assetDir(id))).toBe(false);
      expect(count(`job:run:%:${id}%`)).toBe(0);
    });
  }
});

describe("a live `new` over the fake engines", () => {
  const blender = fakeBlender(ROOT);
  const engines = (base: string): Engines => ({
    decode,
    comfyQueue: async () => 0,
    generate: () => ({ comfyUrl: base, comfy: { ...nodeComfyPorts, sleep: async () => undefined }, workflow: () => readWorkflow(), pollMs: 1 }),
    finish: () => ({ command: blender.command, scripts: path.join("pipeline", "mesh", "blender"), ffmpeg: path.join(ROOT, "no-ffmpeg.exe"), stepTimeoutMs: 30_000, root: process.cwd() }),
  });

  it("TRELLIS through ComfyUI, then the Blender chain: both jobs live, every variant finished", async () => {
    blender.control({});
    const r = await newAsset(k.store, LOC, { id: "hero-live", cls: "character", subject: "monk", concept: concept("good.png"), rig: true, live: true, actor: OP, dryOnly: false }, engines(comfy.base));
    expect(r.ok).toBe(true);
    const a = await readAsset("hero-live");
    expect(a.dry).toBe(false);
    expect(a.variants.map((v) => v.status)).toEqual(["finished", "finished"]);
    expect([jobOf("job:run:mesh:hero-live")?.mode.kind, jobOf("job:run:finish:hero-live")?.mode.kind]).toEqual(["live", "live"]);
    expect(comfy.seen.filter((s) => s === "POST /prompt").length).toBe(2);
    expect(comfy.seen.some((s) => /\/(free|interrupt)$/.test(s))).toBe(false);
  });

  it("a ComfyUI that does not answer leaves the job queued (unhealthy) and the variants pending; no finish job", async () => {
    const r = await newAsset(k.store, LOC, { id: "hero-down", cls: "character", subject: "monk", concept: concept("good.png"), live: true, actor: OP, dryOnly: false }, engines("http://127.0.0.1:9"));
    expect(r.ok && r.value.kind === "made" ? r.value.drove.map((d) => d.outcome) : []).toEqual(["unhealthy"]);
    expect((await readAsset("hero-down")).variants.map((v) => v.status)).toEqual(["pending", "pending"]);
    expect(jobOf("job:run:mesh:hero-down")?.state).toBe("queued");
    expect(jobOf("job:run:finish:hero-down")).toBeUndefined();
  });

  it("a stage job that fails writes its sentence onto every variant still waiting for it", async () => {
    const job = jobOf("job:run:mesh:hero-down");
    if (job === undefined) throw new Error("no job");
    const said = "ComfyUI at http://127.0.0.1:8188 did not answer: ECONNRESET";
    await stageEnded(() => ok(k.store), "mesh", { assetId: "hero-down" }, { ...job, state: "failed", error: { code: "unavailable", message: said } }, "failed");
    const a = await readAsset("hero-down");
    expect(a.variants.map((v) => [v.status, v.error])).toEqual([
      ["failed", said],
      ["failed", said],
    ]);
    expect(jobOf("job:run:finish:hero-down")).toBeUndefined();
  });

  it("a Blender step that fails fails its variant verbatim; `finish` retries it once the cause is gone", async () => {
    blender.control({ fail: "render.py", code: 2 });
    await newAsset(k.store, LOC, { id: "prop-live", cls: "prop", subject: "crate", concept: concept("good.png"), live: true, actor: OP, dryOnly: false }, engines(comfy.base));
    const failed = (await readAsset("prop-live")).variants[0];
    expect([failed?.status, failed?.error?.split("\n")[0]]).toEqual(["failed", "render.py exited 2: Traceback (most recent call last):"]);
    blender.control({});
    const r = await retryFinish(k.store, LOC, { assetId: "prop-live", live: true, actor: OP, dryOnly: false }, engines(comfy.base));
    expect(r.ok && r.value.reset).toEqual(["t1"]);
    expect((await readAsset("prop-live")).variants[0]?.status).toBe("finished");
    expect(jobOf("job:run:finish:prop-live~2")?.state).toBe("done");
  });

  it("a live launch is refused in a dry-only process, and nothing is written", async () => {
    const r = await newAsset(k.store, LOC, { id: "hero-dryonly", cls: "character", subject: "monk", concept: concept("good.png"), live: true, actor: OP, dryOnly: true }, engines(comfy.base));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/GRAVITONE_DRY_ONLY=1/);
    expect(existsSync(assetDir("hero-dryonly"))).toBe(false);
  });
});

describe("the verdict and the CLI", () => {
  it("keep needs a finished variant; reject takes any", async () => {
    expect((await decide("hero-down", "t1", "kept")).ok).toBe(false);
    expect((await decide("hero-dry", "t1", "kept")).ok).toBe(true);
    expect((await decide("hero-down", "t2", "rejected")).ok).toBe(true);
    expect((await readAsset("hero-dry")).variants[0]?.verdict).toBe("kept");
    expect((await decide("hero-dry", "zz", "kept")).ok).toBe(false);
  });

  it("`--help` lists the commands (plain node strips the types; tsx is not a dependency here)", () => {
    const out = execFileSync(process.execPath, ["pipeline/mesh.mts", "--help"], { encoding: "utf8", windowsHide: true, env: { ...process.env, GRAVITONE_DRY_ONLY: "1" } });
    for (const c of ["new <assetId>", "status", "finish <assetId>", "keep <assetId>", "reject <assetId>"]) expect(out).toContain(c);
  });
});
