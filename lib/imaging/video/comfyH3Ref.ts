// MINIMAX H3 REF2VA WITH A VOICE REFERENCE (spark concept-casting-stages S5): a cast character speaking, the picture and
// the sound conditioned on the character's still and on that character's voice line. Behind a switch: nothing runs this
// until a stored proof says it held (lib/producers/productionAudio.ts). A take that needs lines dubs them in the cut until
// then.
//
// Node facts read from a running ComfyUI's /object_info (no prompt submitted; S5): `MiniMaxH3ReferenceToVideo` takes
// required clip, prompt, width, height, length, ref_image_size; optional vae, audio_vae, and the autogrow groups
// ref_images (ref_image_0..), ref_audios (ref_audio_0.., AUDIO, "standalone reference audio"), ref_video_audios. Its
// description asks for `<Picture i>` and `<Audio j>` tags in the prompt.
//
// The graph is the fl2v-api graph's frame: the ref2va model and its turbo LoRA (pipeline/vlm-probe/motion.py's names, the
// int8 checkpoint on this box), the reference node, and the same decode and save tail, so its output is a video with
// sound, H3's own, conditioned on the reference. Measured so far: ~63 minutes for a 3 s ref2va clip
// (pipeline/video/README.md), not 20.

import { createHash } from "node:crypto";

import { AppError } from "@gt/domain/errors";

import { sleep as realSleep } from "../../sleep";
import { comfyBase, comfyStats, runGraphToVideo, uploadStill, type ComfyCtx, type ComfyDeps } from "./comfyLtx.ts";
import { H3_FPS, H3_FRAMES, H3_LANDSCAPE, H3_SECONDS, loadH3Graph, type H3Still } from "./comfyH3.ts";

export const H3_REF_ENGINE = "minimax-h3-ref2va-voice";
export const H3_REF2VA_UNET = "minimax_h3_ref2va_pruned_int8_convrot.safetensors";
export const H3_REF_LORA = "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors";
const CAP_MS = 90 * 60_000;
const SAVE_NODE = "92";

type GraphNode = { class_type: string; inputs: Record<string, unknown> };
type Graph = Record<string, GraphNode>;

export type H3VoiceRequest = { readonly image: H3Still; readonly voice: { readonly bytes: Uint8Array; readonly mime: string }; readonly prompt: string; readonly seed: number; readonly width?: number; readonly height?: number };
export type H3VoiceClip = { readonly bytes: Uint8Array; readonly model: typeof H3_REF_ENGINE; readonly promptId: string; readonly output: string; readonly durationS: number; readonly wallMs: number };

/** Names the character and the voice to the model. */
export const speakingPrompt = (line: string, direction?: string): string => `${direction === undefined || direction === "" ? "" : `${direction} `}<Picture 1> speaks, in the voice of <Audio 1>, saying: "${line}"`;

/**
 * The ref2va graph a voice reference runs on: the fl2v graph's frame with its t2v branch gone, the model swapped, and
 * `first_frame` traded for the two references. Refuses a graph whose nodes drifted. Pure.
 */
export function setRef2VaGraph(g: Graph, v: { readonly image: string; readonly audio: string; readonly prompt: string; readonly width: number; readonly height: number; readonly seed: number; readonly prefix: string }): Graph {
  const out = structuredClone(g);
  delete out["115"];
  delete out["140:132"];
  delete out["140:133"];
  const node = (id: string, cls?: string): GraphNode => {
    const n = out[id];
    if (n === undefined || (cls !== undefined && n.class_type !== cls)) throw new AppError("internal", `the H3 graph: node ${id} ${cls === undefined ? "is absent" : `should be ${cls} but is ${n?.class_type ?? "absent"}`}; the graph and comfyH3Ref.ts drifted`);
    return n;
  };
  node("140:127", "UNETLoader").inputs["unet_name"] = H3_REF2VA_UNET;
  node("140:134", "LoraLoaderModelOnly").inputs["lora_name"] = H3_REF_LORA;
  const clip = node("140:131", "MiniMaxH3ImageToVideo");
  const inputs = clip.inputs;
  clip.class_type = "MiniMaxH3ReferenceToVideo";
  clip.inputs = { clip: inputs["clip"], vae: inputs["vae"], audio_vae: ["140:120", 0], prompt: v.prompt, width: v.width, height: v.height, length: H3_FRAMES, ref_image_size: "match", "ref_images.ref_image_0": ["s1", 0], "ref_audios.ref_audio_0": ["s2", 0] };
  out["s1"] = { class_type: "LoadImage", inputs: { image: v.image } };
  out["s2"] = { class_type: "LoadAudio", inputs: { audio: v.audio } };
  node("140:139", "PrimitiveBoolean").inputs["value"] = true;
  node("140:138", "PrimitiveInt").inputs["value"] = 4;
  node("140:129", "RandomNoise").inputs["noise_seed"] = v.seed;
  node("140:130", "CreateVideo").inputs["fps"] = H3_FPS;
  node(SAVE_NODE, "SaveVideo").inputs["filename_prefix"] = v.prefix;
  return out;
}

async function uploadAudio(c: ComfyCtx, audio: { readonly bytes: Uint8Array; readonly mime: string }): Promise<string> {
  const sha = createHash("sha256").update(audio.bytes).digest("hex").slice(0, 16);
  const ext = audio.mime === "audio/mpeg" ? "mp3" : audio.mime === "audio/flac" ? "flac" : "wav";
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }), `gv-${sha}.${ext}`);
  form.append("type", "input");
  form.append("overwrite", "true");
  const up = await c.f(`${c.base}/upload/image`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  if (!up.ok) throw new AppError("unavailable", `ComfyUI refused the voice reference: ${up.status}`);
  const named = (await up.json()) as { name?: string };
  if (typeof named.name !== "string" || named.name === "") throw new AppError("unavailable", "ComfyUI took the voice reference but named no file");
  return named.name;
}

/** One speaking clip: upload, queue, wait, fetch. */
export async function renderH3Speaking(req: H3VoiceRequest, deps: ComfyDeps = {}): Promise<H3VoiceClip> {
  if (req.prompt.trim() === "") throw new AppError("invalid", "a speaking clip needs a line");
  const c: ComfyCtx = { f: deps.fetch ?? fetch, base: deps.base ?? comfyBase() };
  const now = deps.now ?? Date.now;
  const width = req.width ?? H3_LANDSCAPE.width;
  const height = req.height ?? H3_LANDSCAPE.height;
  const graph = (await loadH3Graph(deps.root)) as Graph;
  const t0 = now();
  await comfyStats({ fetch: c.f, base: c.base }).catch((e: unknown) => {
    throw new AppError("unavailable", `ComfyUI is not reachable at ${c.base}, so no speaking clip was rendered (${e instanceof Error ? e.message : String(e)})`);
  });
  const image = await uploadStill(c, req.image);
  const audio = await uploadAudio(c, req.voice);
  const prompt = setRef2VaGraph(graph, { image: image.name, audio, prompt: req.prompt, width, height, seed: req.seed, prefix: `gravitone/h3-voice-${image.sha}` });
  const got = await runGraphToVideo(c, prompt, { deps, saveNode: SAVE_NODE, now, sleep: deps.sleep ?? realSleep, t0, capMs: deps.capMs ?? CAP_MS });
  return { bytes: got.bytes, model: H3_REF_ENGINE, promptId: got.promptId, output: got.output, durationS: Math.round(H3_SECONDS * 100) / 100, wallMs: now() - t0 };
}
