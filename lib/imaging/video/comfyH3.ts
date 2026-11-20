// MINIMAX H3 FIRST-LAST-FRAME ON THIS BOX - a production's take (spark concept-casting-stages S1), over the same ComfyUI
// HTTP API and the same five bounded requests as ./comfyLtx.ts, whose upload and wait this client shares.
//
// The graph and its settings are pipeline/music-clip/clips-h3.py's, measured there (`.claude/skills/music-clip/SKILL.md`):
// pipeline/video/h3-fl2v-api.json with its resolution, duration and t2v branch removed and first_frame / last_frame
// wired in; 124 frames (5.2 s at 24 fps, the model's trained floor) at 1280x704. The sampler runs the six-step Flex FL2VA
// adapter on its own sigma knots (lcm, ManualSigmas): the operator's blind pick of 2026-11-19 chose it over the 8-step fl2v
// turbo on a hero beat (ai-registry backlog row shift-proof-h3-flex-fl2va-6step, verdict better, mode render, n=1).
// Measured 2026-11-11 alone on the card: 325.77 s a clip on six steps against 413.0 s on the turbo, about 21 % less GPU;
// the turbo stays reachable as `schedule: "turbo8"`. The cap stays 40 min. A location change between two frames makes the
// model cut inside the clip: the operator picks frames that belong to one shot.
//
// The graph is tracked, its prompt blank: setH3Graph writes the take's own. A box missing it is told so by name, before
// anything is uploaded.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@gt/domain/errors";

import { sleep as realSleep } from "../../sleep";
import { comfyBase, comfyStats, runGraphToVideo, uploadStill, type ComfyCtx, type ComfyDeps } from "./comfyLtx.ts";

export const H3_ENGINE = "minimax-h3-fl2v-turbo";
export const H3_GRAPH = path.join("pipeline", "video", "h3-fl2v-api.json");
const CAP_MS = 40 * 60_000;
export const H3_FPS = 24;
export const H3_FRAMES = 124;
/** One clip's length in seconds: the frames the graph renders at its frame rate. */
export const H3_SECONDS = H3_FRAMES / H3_FPS;
export const H3_LANDSCAPE = { width: 1280, height: 704 } as const;
const SAVE_NODE = "92";
/** The FL2VA sampler: the six-step Flex adapter on its vendor sigma knots (the default), or the graph's 8-step fl2v turbo. */
export type H3Schedule = "flex6" | "turbo8";
export const H3_FLEX_LORA = "pika_h3_flex_fl2va_comfy_bf16.safetensors";
/** The adapter's knots 1000, 750, 500, 250, 100, 40, 0 through the video shift 12 (sigma = 12t / (1 + 11t)). */
export const H3_FLEX_SIGMAS = "1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0";
const SIGMAS_NODE = "140:143";

type GraphNode = { class_type: string; inputs: Record<string, unknown> };
type Graph = Record<string, GraphNode>;

export type H3Still = { readonly bytes: Uint8Array; readonly mime: "image/png" | "image/jpeg" | "image/webp" };
export type H3Request = { readonly first: H3Still; readonly last?: H3Still; readonly prompt: string; readonly seed: number; readonly width?: number; readonly height?: number; readonly schedule?: H3Schedule };
export type H3Clip = { readonly bytes: Uint8Array; readonly mime: "video/mp4"; readonly model: typeof H3_ENGINE; readonly promptId: string; readonly output: string; readonly width: number; readonly height: number; readonly durationS: number; readonly wallMs: number };

export async function loadH3Graph(root: string = process.cwd()): Promise<Graph> {
  const at = path.join(root, H3_GRAPH);
  let text: string;
  try {
    text = await readFile(at, "utf8");
  } catch {
    throw new AppError("unavailable", `the H3 graph ${H3_GRAPH} is not on this checkout (machine-local, git-excluded); no clip was rendered`);
  }
  return JSON.parse(text) as Graph;
}

/**
 * clips-h3.py's graph: the t2v branch gone, the prompt and frames wired. `flex6` (the default) swaps the turbo LoRA for the
 * Flex adapter and the step switch for its sigma knots; `turbo8` keeps the graph's turbo. Refuses a graph whose nodes drifted.
 */
export function setH3Graph(g: Graph, v: { readonly first: string; readonly last?: string; readonly prompt: string; readonly width: number; readonly height: number; readonly seed: number; readonly prefix: string; readonly schedule?: H3Schedule }): Graph {
  const out = structuredClone(g);
  delete out["115"];
  delete out["140:132"];
  delete out["140:133"];
  const node = (id: string, cls?: string): GraphNode => {
    const n = out[id];
    if (n === undefined || (cls !== undefined && n.class_type !== cls)) throw new AppError("internal", `${H3_GRAPH}: node ${id} ${cls === undefined ? "is absent" : `should be ${cls} but is ${n?.class_type ?? "absent"}`}; the graph and comfyH3.ts drifted`);
    return n;
  };
  node("140:131").inputs = { ...node("140:131").inputs, prompt: v.prompt, width: v.width, height: v.height, length: H3_FRAMES, first_frame: ["s1", 0] };
  out["s1"] = { class_type: "LoadImage", inputs: { image: v.first } };
  if (v.last !== undefined) {
    out["s2"] = { class_type: "LoadImage", inputs: { image: v.last } };
    node("140:131").inputs["last_frame"] = ["s2", 0];
  }
  node("140:139", "PrimitiveBoolean").inputs["value"] = true;
  node("140:129", "RandomNoise").inputs["noise_seed"] = v.seed;
  node("140:130", "CreateVideo").inputs["fps"] = H3_FPS;
  node(SAVE_NODE, "SaveVideo").inputs["filename_prefix"] = v.prefix;
  if ((v.schedule ?? "flex6") === "flex6") {
    node("140:134", "LoraLoaderModelOnly").inputs["lora_name"] = H3_FLEX_LORA;
    node("140:123", "KSamplerSelect").inputs["sampler_name"] = "lcm";
    node("140:125", "SamplerCustomAdvanced").inputs["sigmas"] = [SIGMAS_NODE, 0];
    for (const id of ["140:124", "140:136", "140:137", "140:138"]) delete out[id];
    out[SIGMAS_NODE] = { class_type: "ManualSigmas", inputs: { sigmas: H3_FLEX_SIGMAS } };
  }
  return out;
}

/** One clip from one or two stills: upload, queue, wait, fetch, free. */
export async function renderH3Clip(req: H3Request, deps: ComfyDeps = {}): Promise<H3Clip> {
  if (req.prompt.trim() === "") throw new AppError("invalid", "an H3 clip needs a motion line");
  const c: ComfyCtx = { f: deps.fetch ?? fetch, base: deps.base ?? comfyBase() };
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const width = req.width ?? H3_LANDSCAPE.width;
  const height = req.height ?? H3_LANDSCAPE.height;
  const graph = await loadH3Graph(deps.root);
  const t0 = now();
  await comfyStats({ fetch: c.f, base: c.base }).catch((e: unknown) => {
    throw new AppError("unavailable", `ComfyUI is not reachable at ${c.base}, so no H3 clip was rendered (${e instanceof Error ? e.message : String(e)})`);
  });
  const first = await uploadStill(c, req.first);
  const last = req.last === undefined ? undefined : await uploadStill(c, req.last);
  const prompt = setH3Graph(graph, { first: first.name, ...(last === undefined ? {} : { last: last.name }), prompt: req.prompt, width, height, seed: req.seed, prefix: `gravitone/h3-${first.sha}`, ...(req.schedule === undefined ? {} : { schedule: req.schedule }) });
  const got = await runGraphToVideo(c, prompt, { deps, saveNode: SAVE_NODE, now, sleep, t0, capMs: deps.capMs ?? CAP_MS });
  return { bytes: got.bytes, mime: "video/mp4", model: H3_ENGINE, promptId: got.promptId, output: got.output, width, height, durationS: Math.round(H3_SECONDS * 100) / 100, wallMs: now() - t0 };
}
