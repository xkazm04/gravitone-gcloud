// THE NIGHT'S PREFLIGHT, ITS LOCAL CLIP LINES (lib/foundry/scout/doctor.ts): ComfyUI reachable at
// COMFY_URL and the LTX graph's weights listed by it - failures on a live night, notes on a dry
// one, nothing asked of ComfyUI when the clips are Leonardo's. Every binary is a stub and ComfyUI
// a fake fetch; the store and night paths are a temp directory.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { blocking, doctor, doctorLine, type DoctorInput } from "../../lib/foundry/scout/doctor.ts";
import type { ComfyFetch } from "../../lib/imaging/video/comfyLtx.ts";
import type { SpawnResult } from "../../lib/foundry/scout/ingest.ts";

const DIR = mkdtempSync(path.join(os.tmpdir(), "gt-scout-doctor-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const spawn = async (bin: string): Promise<SpawnResult> => ({ ok: true, stdout: Buffer.from(`${bin} version 9.9\n`), stderr: "" });
const ENV = { GOOGLE_AI_API_KEY: "set", LEONARDO_API_KEY: "set", COMFY_URL: "http://comfy.test:8188" };
/** Both vendors accept the key: these tests are about ComfyUI, and no test reaches a vendor. */
const keysOk = async () => ({ ok: true, status: 200, text: async () => "{}" });
/** A worker that beat a minute ago: these tests are about ComfyUI (the worker's own block is below). */
const T = Date.parse("2026-10-23T22:00:00.000Z");
const input = (o: Partial<DoctorInput> = {}): DoctorInput => ({ env: ENV, storePath: path.join(DIR, "kernel.sqlite"), scoutRoot: path.join(DIR, "scout"), dry: false, spawn, keyFetch: keysOk, worker: async () => T - 60_000, now: () => T, ...o });

const LOADERS: Record<string, unknown> = {
  UNETLoader: { input: { required: { unet_name: [["ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors"]] } } },
  VAELoader: { input: { required: { vae_name: [["ltx-2.5-audio-vae-bf16.safetensors", "ltx-2.5-video-vae-bf16.safetensors"]] } } },
  CLIPLoader: { input: { required: { clip_name: [["gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors"]] } } },
  LatentUpscaleModelLoader: { input: { required: { model_name: ["COMBO", { options: ["ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"] }] } } },
};
const STATS = { system: { comfyui_version: "0.42.1", ram_total: 64 * 1024 ** 3, ram_free: 32 * 1024 ** 3 }, devices: [{ vram_total: 100 * 1024 ** 3, vram_free: 90 * 1024 ** 3 }] };

function comfy(o: { down?: boolean; without?: string } = {}): { f: ComfyFetch; asked: string[] } {
  const asked: string[] = [];
  const f: ComfyFetch = async (url) => {
    asked.push(url);
    if (o.down) throw new TypeError("fetch failed");
    const u = new URL(url);
    if (u.pathname === "/system_stats") return Response.json(STATS);
    const cls = decodeURIComponent(u.pathname.replace("/object_info/", ""));
    const spec = JSON.parse(JSON.stringify(LOADERS[cls] ?? {})) as { input?: { required?: Record<string, unknown[]> } };
    if (o.without !== undefined) for (const v of Object.values(spec.input?.required ?? {})) if (Array.isArray(v[0])) v[0] = (v[0] as string[]).filter((x) => x !== o.without);
    return Response.json({ [cls]: spec });
  };
  return { f, asked };
}

const line = (checks: Awaited<ReturnType<typeof doctor>>, name: string): string => doctorLine(checks.find((c) => c.name === name) ?? { name, ok: false, found: "absent", needed: true });

describe("doctor, the local clip engine", () => {
  it("names ComfyUI reachable, its VRAM and RAM, and every LTX weight present", async () => {
    const checks = await doctor(input({ fetch: comfy().f }));
    expect(line(checks, "comfyui")).toBe("ok   comfyui             http://comfy.test:8188 · ComfyUI 0.42.1 · VRAM 90.0/100.0 GB free · RAM 32.0/64.0 GB free");
    expect(line(checks, "ltx weights")).toBe("ok   ltx weights         5 model files present");
    expect(blocking(checks)).toEqual([]);
  });

  it("fails a live night when ComfyUI is down, with the script that starts it", async () => {
    const checks = await doctor(input({ fetch: comfy({ down: true }).f }));
    expect(line(checks, "comfyui")).toMatch(/^FAIL comfyui +ComfyUI at http:\/\/comfy\.test:8188 did not answer \/system_stats: fetch failed -> start ComfyUI with \S+[\\/]ai[\\/]ComfyUI[\\/]run_nvidia_gpu\.bat \(it stays up\), or set COMFY_URL/);
    expect(checks.some((c) => c.name === "ltx weights")).toBe(false);
    expect(blocking(checks).map((c) => c.name)).toEqual(["comfyui"]);
  });

  it("notes the same on a dry night, which renders stand-ins and is not blocked", async () => {
    const checks = await doctor(input({ dry: true, fetch: comfy({ down: true }).f }));
    expect(line(checks, "comfyui")).toMatch(/^note comfyui +ComfyUI at http:\/\/comfy\.test:8188 did not answer/);
    expect(blocking(checks)).toEqual([]);
  });

  it("names a weight ComfyUI does not list", async () => {
    const checks = await doctor(input({ fetch: comfy({ without: "ltx-2.5-audio-vae-bf16.safetensors" }).f }));
    expect(line(checks, "ltx weights")).toBe("FAIL ltx weights         missing: ltx-2.5-audio-vae-bf16.safetensors -> put the missing files under ComfyUI's models folder; a night never downloads one");
  });

  it("asks ComfyUI nothing when the clips are Leonardo's, and refuses an engine it does not know", async () => {
    const hosted = comfy();
    const checks = await doctor(input({ env: { ...ENV, SCOUT_CLIP_ENGINE: "hailuo" }, fetch: hosted.f }));
    expect(hosted.asked).toEqual([]);
    expect(line(checks, "clip engine")).toBe("ok   clip engine         hailuo (Leonardo; each clip is paid)");
    const odd = await doctor(input({ env: { ...ENV, SCOUT_CLIP_ENGINE: "wan" }, fetch: comfy().f }));
    expect(blocking(odd).map((c) => c.name)).toEqual(["clip engine"]);
  });

  it("a set key the vendor refuses fails a live night, quoting the vendor and never the key", async () => {
    const secret = "GOOGLE_API_KEY";
    const refused = async (url: string) =>
      url.includes("googleapis")
        ? { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: `API key not valid: ${secret}` } }) }
        : { ok: true, status: 200, text: async () => JSON.stringify({ user_details: [{ subscriptionTokens: 120, apiPaidTokens: 30 }] }) };
    const checks = await doctor(input({ env: { ...ENV, GOOGLE_AI_API_KEY: secret }, fetch: comfy().f, keyFetch: refused }));
    const google = checks.find((c) => c.name === "GOOGLE_AI_API_KEY");
    expect(google).toMatchObject({ ok: false, needed: true });
    expect(google?.found).toBe("set but refused · 400: API key not valid: [redacted]");
    expect(checks.find((c) => c.name === "LEONARDO_API_KEY")?.found).toBe("set · accepted · 150 credits on the account");
    const dry = await doctor(input({ dry: true, env: { ...ENV, GOOGLE_AI_API_KEY: secret }, fetch: comfy().f, keyFetch: refused }));
    expect(dry.find((c) => c.name === "GOOGLE_AI_API_KEY")).toMatchObject({ ok: true, found: "set", needed: false });
  });
});

// THE FLUX LINE (spark scout-storyboards): the storyboards' three Flux 2 files, read off the same ComfyUI once it
// answers - always a note, never a block: a missing file fails those storyboards' frames, not the night.
describe("doctor, the storyboards' Flux weights", () => {
  const FLUX = { UNETLoader: "flux2_dev_fp8mixed.safetensors", CLIPLoader: "mistral_3_small_flux2_fp8.safetensors", VAELoader: "flux2-vae.safetensors" } as const;
  /** The fake ComfyUI with the Flux files listed beside the LTX ones, less `without`. */
  const withFlux = (without?: string): ComfyFetch => {
    const base = comfy().f;
    return async (url, init) => {
      const r = await base(url, init);
      const cls = decodeURIComponent(new URL(url).pathname.replace("/object_info/", "")) as keyof typeof FLUX;
      if (!(cls in FLUX)) return r;
      const doc = (await r.json()) as Record<string, { input: { required: Record<string, unknown[]> } }>;
      for (const v of Object.values(doc[cls]?.input.required ?? {})) if (Array.isArray(v[0])) v[0] = [...(v[0] as string[]), FLUX[cls]].filter((x) => x !== without);
      return Response.json(doc);
    };
  };

  it("names the three files present", async () => {
    const checks = await doctor(input({ fetch: withFlux() }));
    expect(line(checks, "flux weights")).toBe("ok   flux weights        3 model files present");
    expect(blocking(checks)).toEqual([]);
  });

  it("notes a missing one with the remedy, and blocks nothing", async () => {
    const checks = await doctor(input({ fetch: withFlux("flux2-vae.safetensors") }));
    expect(line(checks, "flux weights")).toBe("note flux weights        missing: flux2-vae.safetensors -> put the missing files under ComfyUI's models folder; without them a storyboard draws no frame");
    expect(blocking(checks)).toEqual([]);
    // The LTX fake alone lists none of them.
    expect(line(await doctor(input({ fetch: comfy().f })), "flux weights")).toMatch(/^note flux weights +missing: flux2_dev_fp8mixed\.safetensors, mistral_3_small_flux2_fp8\.safetensors, flux2-vae\.safetensors/);
  });
});

// THE WORKER LINE (spark night-load-band): the always-on worker's pulse in the store - its newest load
// sample or its sampler's lease beat - under five minutes is ok; older, or never, fails a live night with
// the command that starts it, and is a note on a dry one. The pulse is read read-only from a temp store.
describe("doctor, the always-on worker", () => {
  const worker = async (at: number | undefined, o: Partial<DoctorInput> = {}) => {
    const checks = await doctor(input({ fetch: comfy().f, worker: async () => at, ...o }));
    return { line: line(checks, "worker"), blocked: blocking(checks).map((c) => c.name) };
  };

  it("ok at 2 min, FAIL at 6 min, FAIL with no heartbeat on record", async () => {
    expect(await worker(T - 2 * 60_000)).toEqual({ line: `ok   ${"worker".padEnd(19)} last heartbeat 2 min ago`, blocked: [] });
    expect(await worker(T - 6 * 60_000)).toEqual({ line: `FAIL ${"worker".padEnd(19)} no worker heartbeat in 6 min -> start it: powershell -File pipeline/worker-service.ps1 -Run`, blocked: ["worker"] });
    expect(await worker(undefined)).toEqual({ line: `FAIL ${"worker".padEnd(19)} no worker heartbeat on record -> start it: powershell -File pipeline/worker-service.ps1 -Run`, blocked: ["worker"] });
  });

  it("is a note on a dry night, and a store it cannot read fails with the store's own sentence", async () => {
    expect((await worker(undefined, { dry: true })).blocked).toEqual([]);
    expect((await worker(undefined, { dry: true })).line).toMatch(/^note worker /);
    const broken = await doctor(input({ fetch: comfy().f, worker: async () => { throw new Error("database is locked"); } }));
    expect(line(broken, "worker")).toMatch(/^FAIL worker +the store could not be read: database is locked -> start it/);
  });

  it("reads the pulse from a real store without migrating it: the newest sample, or the sampler's lease beat", async () => {
    const { openKernel } = await import("@gt/kernel/kernel");
    const { recordLoadSampleIn } = await import("@gt/kernel/resources/load");
    const { workerPulse } = await import("../../lib/foundry/scout/doctor.ts");
    expect(await workerPulse(path.join(DIR, "never.sqlite"))).toBeUndefined();
    expect(await workerPulse(":memory:")).toBeUndefined();
    const at = path.join(DIR, "pulse.sqlite");
    const k = openKernel(at, { clock: () => new Date(T) });
    if (!k.ok) throw k.error;
    expect(await workerPulse(at)).toBeUndefined();
    const w = k.value.store.tx((t) => recordLoadSampleIn(t, { atMs: T - 120_000, load: { cpuBusy: 0.5 } }));
    expect(w.ok).toBe(true);
    expect(await workerPulse(at)).toBe(T - 120_000);
    // A beat newer than the newest sample (the probe failing, the worker alive) is the pulse.
    const beat = k.value.store.tx((t) => t.run("INSERT INTO leases (resource, fence, holder_boot, holder_pid, holder_host, acquired_at, heartbeat_at, ttl_s) VALUES ('timer:load-sample', 1, 'b', 1, 'h', ?, ?, 180)", new Date(T - 60_000).toISOString(), new Date(T - 30_000).toISOString()));
    expect(beat.ok).toBe(true);
    expect(await workerPulse(at)).toBe(T - 30_000);
    k.value.close();
  });
});
