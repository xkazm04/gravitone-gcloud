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
const input = (o: Partial<DoctorInput> = {}): DoctorInput => ({ env: ENV, storePath: path.join(DIR, "kernel.sqlite"), scoutRoot: path.join(DIR, "scout"), dry: false, spawn, ...o });

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
    expect(line(checks, "comfyui")).toMatch(/^FAIL comfyui +ComfyUI at http:\/\/comfy\.test:8188 did not answer \/system_stats: fetch failed -> start ComfyUI with C:\\Users\\kazda\\ai\\ComfyUI\\run_nvidia_gpu\.bat \(it stays up\), or set COMFY_URL/);
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
});
