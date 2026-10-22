// THE LOCAL CLIP ENGINE (lib/imaging/video/comfyLtx.ts) against a fake ComfyUI: a fetch that
// answers the five endpoints from a script and records every request. Nothing reaches the
// ComfyUI on this box; the clock is a counter, so the 20-minute cap is reached in no time.

import { describe, expect, it } from "vitest";

import { graphModels, loadGraph, LTX_NODES, missingModels, renderLtxClip, type ComfyFetch } from "../../lib/imaging/video/comfyLtx.ts";

const BASE = "http://comfy.test:8188";
const STATS = { system: { comfyui_version: "0.42.1", ram_total: 64 * 1024 ** 3, ram_free: 32 * 1024 ** 3 }, devices: [{ name: "cuda:0", vram_total: 100 * 1024 ** 3, vram_free: 90 * 1024 ** 3 }] };
const MP4 = new TextEncoder().encode("an mp4, honestly");
const PNG = new TextEncoder().encode("our replica still");

type Seen = { method: string; path: string; body?: unknown };
type Script = {
  stats?: () => Response;
  prompt?: () => Response;
  /** History answers in poll order; the last one repeats. */
  history?: unknown[];
  queue?: unknown;
};

const ok = (x: unknown): Response => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
const DONE = (id: string): unknown => ({ [id]: { status: { status_str: "success", completed: true, messages: [] }, outputs: { [LTX_NODES.save.id]: { images: [{ filename: "ltx-abc_00001_.mp4", subfolder: "gravitone", type: "output" }], animated: [true] } } } });

function fake(s: Script = {}): { f: ComfyFetch; seen: Seen[] } {
  const seen: Seen[] = [];
  let polls = 0;
  const f: ComfyFetch = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : init?.body instanceof FormData ? init.body : undefined;
    seen.push({ method, path: `${u.pathname}${u.search}`, ...(body === undefined ? {} : { body }) });
    if (u.pathname === "/system_stats") return (s.stats ?? (() => ok(STATS)))();
    if (u.pathname === "/upload/image") return ok({ name: "0123456789abcdef.png", subfolder: "gravitone", type: "input" });
    if (u.pathname === "/prompt") return (s.prompt ?? (() => ok({ prompt_id: "p-1", number: 1, node_errors: {} })))();
    if (u.pathname.startsWith("/history/")) {
      const h = s.history ?? [{}, DONE("p-1")];
      return ok(h[Math.min(polls++, h.length - 1)]);
    }
    if (u.pathname === "/queue" && method === "GET") return ok(s.queue ?? { queue_running: [[1, "p-1", {}, {}, []]], queue_pending: [] });
    if (u.pathname === "/view") return new Response(MP4, { status: 200 });
    if (u.pathname === "/free" || u.pathname === "/interrupt" || u.pathname === "/queue") return new Response("", { status: 200 });
    return new Response("not found", { status: 404 });
  };
  return { f, seen };
}

/** A clock that moves a minute per sleep: the cap is reached in twenty polls, instantly. */
function clock(): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let t = 0;
  return { now: () => t, sleep: async () => void (t += 60_000) };
}

const deps = (f: ComfyFetch) => ({ fetch: f, base: BASE, ...clock() });
const request = { image: { bytes: PNG, mime: "image/png" as const }, prompt: "slow push-in, dust drifting right to left", seed: 7 };

describe("renderLtxClip", () => {
  it("uploads, queues, polls, views and frees, in that order, with the request's values on the graph's nodes", async () => {
    const { f, seen } = fake();
    const clip = await renderLtxClip(request, deps(f));
    expect(seen.map((x) => `${x.method} ${x.path.split("?")[0]}`)).toEqual(["GET /system_stats", "POST /upload/image", "POST /prompt", "GET /history/p-1", "GET /queue", "GET /history/p-1", "GET /view", "POST /free"]);

    const up = seen[1]?.body as FormData;
    const file = up.get("image") as File;
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
    expect(file.name).toMatch(/^[0-9a-f]{16}\.png$/);
    expect(up.get("subfolder")).toBe("gravitone");

    const sent = (seen[2]?.body as { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>; client_id: string });
    expect(sent.client_id).toMatch(/^gravitone-/);
    const at = (k: keyof typeof LTX_NODES) => sent.prompt[LTX_NODES[k].id]?.inputs;
    expect(at("image")?.["image"]).toBe("gravitone/0123456789abcdef.png");
    expect(at("prompt")?.["value"]).toBe("slow push-in, dust drifting right to left");
    expect([at("width")?.["value"], at("height")?.["value"], at("seconds")?.["value"], at("fps")?.["value"]]).toEqual([960, 576, 5, 24]);
    expect([at("seed")?.["noise_seed"], at("seed2")?.["noise_seed"]]).toEqual([7, 8]);
    expect(at("save")?.["filename_prefix"]).toMatch(/^gravitone\/ltx-[0-9a-f]{16}$/);
    // The encoder reads the raw prompt: the enhancer branch is not in the graph.
    expect(Object.values(sent.prompt).some((n) => n.class_type === "TextGenerateLTX2Prompt")).toBe(false);

    expect(seen[6]?.path).toBe("/view?filename=ltx-abc_00001_.mp4&subfolder=gravitone&type=output");
    expect(seen[7]?.body).toEqual({ unload_models: true, free_memory: true });
    expect(clip).toMatchObject({ mime: "video/mp4", model: "ltx-2.5-distilled", promptId: "p-1", output: "gravitone/ltx-abc_00001_.mp4", width: 960, height: 576, frames: 121 });
    expect(clip.bytes).toEqual(MP4);
  });

  it("refuses, sending nothing, when ComfyUI is not reachable", async () => {
    const { f, seen } = fake({ stats: () => Promise.reject(new TypeError("fetch failed")) as unknown as Response });
    await expect(renderLtxClip(request, deps(f))).rejects.toMatchObject({ code: "unavailable", message: expect.stringMatching(/^ComfyUI is not reachable at http:\/\/comfy\.test:8188, so no local clip was rendered/) });
    expect(seen.map((x) => x.path)).toEqual(["/system_stats"]);
  });

  it("keeps a node's error verbatim, and still frees", async () => {
    const said = "Allocation on device would exceed allowed memory. (out of memory)";
    const failed = { "p-1": { status: { status_str: "error", completed: false, messages: [["execution_start", {}], ["execution_error", { node_id: "452:428", node_type: "SamplerCustomAdvanced", exception_message: `${said}\n`, exception_type: "torch.OutOfMemoryError" }]] }, outputs: {} } };
    const { f, seen } = fake({ history: [failed] });
    await expect(renderLtxClip(request, deps(f))).rejects.toMatchObject({ code: "unavailable", message: `ComfyUI SamplerCustomAdvanced (node 452:428) failed: ${said}` });
    expect(seen.at(-1)).toMatchObject({ method: "POST", path: "/free" });
  });

  it("keeps the validator's node errors when /prompt refuses the graph", async () => {
    const refusal = { error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation", details: "" }, node_errors: { "452:411": { class_type: "UNETLoader", errors: [{ message: "Value not in list", details: "unet_name: 'ltx.safetensors' not in [...]" }] } } };
    const { f, seen } = fake({ prompt: () => new Response(JSON.stringify(refusal), { status: 400 }) });
    await expect(renderLtxClip(request, deps(f))).rejects.toMatchObject({ message: "ComfyUI refused the graph (400): Prompt outputs failed validation - UNETLoader 452:411: Value not in list (unet_name: 'ltx.safetensors' not in [...])" });
    expect(seen.some((x) => x.path === "/free")).toBe(false);
  });

  it("stops at the 20-minute cap with a sentence, interrupting only its own prompt", async () => {
    const { f, seen } = fake({ history: [{}] });
    await expect(renderLtxClip(request, deps(f))).rejects.toMatchObject({ code: "unavailable", message: "ComfyUI did not finish prompt p-1 within 20 min (waited 1200 s); it was still running, and was interrupted" });
    expect(seen.filter((x) => x.path === "/interrupt").map((x) => x.body)).toEqual([{ prompt_id: "p-1" }]);
    expect(seen.at(-1)?.path).toBe("/free");
  });

  it("withdraws its own prompt from the pending list at the cap, behind another session's", async () => {
    const { f, seen } = fake({ history: [{}], queue: { queue_running: [[0, "someone-else", {}, {}, []]], queue_pending: [[1, "p-1", {}, {}, []]] } });
    await expect(renderLtxClip(request, deps(f))).rejects.toMatchObject({ message: expect.stringMatching(/it was still queued behind other prompts, and was withdrawn$/) });
    expect(seen.filter((x) => x.method === "POST" && x.path === "/queue").map((x) => x.body)).toEqual([{ delete: ["p-1"] }]);
    expect(seen.some((x) => x.path === "/interrupt")).toBe(false);
  });

  it("calls a prompt lost when ComfyUI holds it nowhere for six polls", async () => {
    const { f } = fake({ history: [{}], queue: { queue_running: [], queue_pending: [] } });
    await expect(renderLtxClip(request, deps(f))).rejects.toMatchObject({ message: expect.stringMatching(/lost prompt p-1: .* for 6 polls/) });
  });

  it("refuses a size off the 64-pixel grid before anything is sent", async () => {
    const { f, seen } = fake();
    await expect(renderLtxClip({ ...request, height: 544 }, deps(f))).rejects.toMatchObject({ code: "invalid", message: expect.stringMatching(/^an LTX clip is 960x544: each side must be a multiple of 64/) });
    expect(seen).toEqual([]);
  });
});

describe("the graph's weights", () => {
  it("names the five model files its loaders load", async () => {
    expect(graphModels(await loadGraph()).map((m) => m.file).sort()).toEqual([
      "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
      "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
      "ltx-2.5-audio-vae-bf16.safetensors",
      "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
      "ltx-2.5-video-vae-bf16.safetensors",
    ]);
  });

  it("reads both combo spellings of /object_info and names a file ComfyUI does not list", async () => {
    const info: Record<string, unknown> = {
      UNETLoader: { input: { required: { unet_name: [["ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors"]] } } },
      VAELoader: { input: { required: { vae_name: [["ltx-2.5-video-vae-bf16.safetensors"]] } } },
      CLIPLoader: { input: { required: { clip_name: [["gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors"]] } } },
      LatentUpscaleModelLoader: { input: { required: { model_name: ["COMBO", { options: ["ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"] }] } } },
    };
    const f: ComfyFetch = async (url) => {
      const cls = decodeURIComponent(new URL(url).pathname.replace("/object_info/", ""));
      return ok({ [cls]: info[cls] });
    };
    expect(await missingModels({ fetch: f, base: BASE })).toEqual({ present: 4, missing: ["ltx-2.5-audio-vae-bf16.safetensors"] });
  });
});
