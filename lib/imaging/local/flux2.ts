// FLUX 2 DEV TEXT-TO-IMAGE ON THIS BOX - a storyboard's frames (spark scout-storyboards), over the HTTP API
// of the ComfyUI that already runs here (`COMFY_URL`, default http://127.0.0.1:8188). Server-only. No shell,
// no websocket, no Python: four plain requests, each bounded by its own timeout, the whole draw by one cap.
//
//   1. GET  /system_stats   reachable, or refused with a sentence before anything is queued;
//   1b. POST /upload/image  each reference still (spark scout-vision S3), named by its bytes (comfyLtx.ts's rule);
//   2. POST /prompt         the graph below, our prompt, size and seed set, under our own client id;
//   3. GET  /history/{id}   every 3 s until it is there, capped at 15 min (another session's prompts
//                           may run ahead of ours; that wait counts against the cap);
//   4. GET  /view           the PNG SaveImage wrote.
//
// THE GRAPH is pipeline/vlm-probe/consistency.py `flux_workflow()` ported node for node. With no reference it is
// text-to-image only: no LoadImage, no VAEEncode, no ReferenceLatent - the idea's artboard is read as words, never
// handed in as a reference latent (operator, 2026-10-24: the frames are a plan, not the final video's baseline).
// 20 steps, euler, guidance 4.0, the Python's own numbers; 1280x720 for 16:9 (flux_still.py `W, H`), 720x1280 for
// 9:16, 1024x1024 for 1:1 (a reference sheet).
//
// WITH REFERENCES (spark scout-vision S3: a kept character's portrait for her sheet, her kept sheet for a cast frame
// - OUR stills only, each passed by lib/foundry/scout/cast.ts `castStillOf`): each one LoadImage -> VAEEncode ->
// ReferenceLatent, chained between CLIPTextEncode and FluxGuidance (the probe's order: guidance first silently drops
// the references), and ADMITTED LATE - the text has the denoise to itself until `late`, then the reference joins
// (ConditioningSetTimestepRange x2 + ConditioningCombine). Registry character-identity-continuity /
// reference-admitted-late: composition is decided early and identity late; a reference at full strength replaces the
// shot (the probe measured a look distance of 0.0002, the camera ignored). The value is frozen per model and tuned by
// trials, never chosen per call: REFERENCE_LATE.
//
// A SHARED SERVICE, TREATED AS ONE (lib/foundry/mesh/comfy.ts, docs/resources.md): this client never POSTs
// /free - another tenant's models stay loaded - and never restarts anything. At the cap ours, and only ours,
// leaves the queue: deleted while pending, interrupted BY ITS ID while running. Admission already waited on
// the ComfyUI queue before the job started (@gt/domain/resource `admit`, engine "comfy").
//
// A COMFYUI ERROR IS KEPT VERBATIM (comfyLtx.ts's rule): the node's class, its id and its exception text, or
// the /prompt validator's node errors. Errors are AppError `unavailable` (the box's), `invalid` (refused here).

import { createHash, randomInt, randomUUID } from "node:crypto";

import { AppError } from "@gt/domain/errors";

import { sleep as realSleep } from "../../sleep";

export const FLUX_MODEL = "flux2-dev-fp8";
/** The three files the graph's loaders name, by loader class and input (consistency.py `flux_workflow`). */
export const FLUX_FILES = [
  { cls: "UNETLoader", input: "unet_name", file: "flux2_dev_fp8mixed.safetensors" },
  { cls: "CLIPLoader", input: "clip_name", file: "mistral_3_small_flux2_fp8.safetensors" },
  { cls: "VAELoader", input: "vae_name", file: "flux2-vae.safetensors" },
] as const;
export const FLUX_STEPS = 20;
export const FLUX_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type FluxAspect = (typeof FLUX_ASPECTS)[number];
export const FLUX_SIZE: Readonly<Record<FluxAspect, { readonly width: number; readonly height: number }>> = { "16:9": { width: 1280, height: 720 }, "9:16": { width: 720, height: 1280 }, "1:1": { width: 1024, height: 1024 } };
/**
 * Where a reference joins the denoise, 0..1, for flux2-dev-fp8 (registry reference-admitted-late: frozen per model,
 * tuned by trials). 0.25 is the probe's measured operating point (pipeline/vlm-probe/CONSISTENCY-FINDINGS.md, lane
 * `reference-face-e25`: worst identity 0.371 against a real-film floor of 0.364, the camera obeyed; 0 overrides the
 * camera, 0.45 loosens identity to 0.577). The probe's CLI default, 0.0, is the always-on lane it measured as a slideshow.
 */
export const REFERENCE_LATE = 0.25;
/** The references one frame takes: a cast's kept sheets (lib/foundry/scout/cast.ts CAST_MAX). */
export const FLUX_REFS_MAX = 3;
const MAX_REF_BYTES = 16 * 1024 * 1024;
/** The seed range ComfyUI's RandomNoise takes and a JSON number holds exactly. */
export const FLUX_SEED_MAX = 2 ** 48 - 1;
const SAVE = "13";
const POLL_MS = 3_000;
const CAP_MS = 15 * 60_000;
const LOST_POLLS = 6;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const PROMPT_MAX = 2_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export type FluxFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type FluxDeps = {
  readonly fetch?: FluxFetch;
  /** Default `COMFY_URL`, else 127.0.0.1:8188. */
  readonly base?: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly capMs?: number;
  /** The seed drawn when the request names none (default a random one). */
  readonly seed?: () => number;
};

/** `refs` - OUR OWN stills only (a kept character's sheet or portrait, guarded by the caller - spark scout-vision S3),
 *  admitted `late` (0..1 of the steps; registry reference-admitted-late). Absent: text-to-image as before. */
export type FluxRequest = { readonly prompt: string; readonly aspect?: FluxAspect; readonly seed?: number; readonly refs?: readonly Uint8Array[]; readonly late?: number };

export type FluxStill = {
  readonly png: Uint8Array;
  readonly seed: number;
  readonly model: typeof FLUX_MODEL;
  readonly promptId: string;
  readonly width: number;
  readonly height: number;
  readonly wallMs: number;
};

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
type Ctx = { readonly f: FluxFetch; readonly base: string };

export const fluxBase = (env: Readonly<Record<string, string | undefined>> = process.env): string => (env["COMFY_URL"]?.trim() || "http://127.0.0.1:8188").replace(/\/+$/, "");

const unavailable = (m: string): AppError => new AppError("unavailable", m);
const short = (s: string): string => (s.length > 600 ? `${s.slice(0, 599)}…` : s);

async function call(c: Ctx, rel: string, init: RequestInit & { readonly ms: number }): Promise<Response> {
  const { ms, ...rest } = init;
  try {
    return await c.f(`${c.base}${rel}`, { ...rest, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw unavailable(`ComfyUI at ${c.base} did not answer ${rel.split("?")[0]}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function json<T>(c: Ctx, rel: string, init: RequestInit & { readonly ms: number }): Promise<T> {
  const r = await call(c, rel, init);
  const text = await r.text();
  if (!r.ok) throw unavailable(`ComfyUI ${rel.split("?")[0]} answered ${r.status}: ${short(text)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw unavailable(`ComfyUI ${rel.split("?")[0]} answered with something that is not JSON: ${short(text)}`);
  }
}

/* ── The weights (the doctor reads this) ─────────────────────────────────── */

/** The Flux files ComfyUI does not list (its /object_info combo options). Empty: all present. */
export async function missingFluxModels(deps: Pick<FluxDeps, "fetch" | "base"> = {}): Promise<{ readonly present: number; readonly missing: readonly string[] }> {
  const c: Ctx = { f: deps.fetch ?? fetch, base: deps.base ?? fluxBase() };
  const missing: string[] = [];
  for (const w of FLUX_FILES) {
    const info = (await json<Record<string, Record<string, unknown>>>(c, `/object_info/${encodeURIComponent(w.cls)}`, { method: "GET", ms: 20_000 }))[w.cls] ?? {};
    const spec = ((info["input"] as { required?: Record<string, unknown[]> } | undefined)?.required ?? {})[w.input];
    // Two combo spellings: `[[...files]]` and `["COMBO", { options: [...] }]`.
    const head = spec?.[0];
    const options = Array.isArray(head) ? head : ((spec?.[1] as { options?: unknown[] } | undefined)?.options ?? []);
    if (!options.includes(w.file)) missing.push(w.file);
  }
  return { present: FLUX_FILES.length - missing.length, missing };
}

/* ── The graph ───────────────────────────────────────────────────────────── */

/**
 * consistency.py `flux_workflow(prompt, seed, refs=(), width, height, steps=20, prefix, late=0.0)`, its node ids kept:
 * `refs` are the uploaded names LoadImage takes, `late` (0..1) where they join. No refs: the text-only graph.
 */
export function fluxGraph(v: { readonly prompt: string; readonly seed: number; readonly width: number; readonly height: number; readonly steps?: number; readonly prefix: string; readonly refs?: readonly string[]; readonly late?: number }): Graph {
  const [unet, clip, vae] = FLUX_FILES;
  const steps = v.steps ?? FLUX_STEPS;
  const g: Graph = {
    "1": { class_type: unet.cls, inputs: { unet_name: unet.file, weight_dtype: "default" } },
    "2": { class_type: clip.cls, inputs: { clip_name: clip.file, type: "flux2", device: "default" } },
    "3": { class_type: vae.cls, inputs: { vae_name: vae.file } },
    "4": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: v.prompt } },
    "6": { class_type: "EmptyFlux2LatentImage", inputs: { width: v.width, height: v.height, batch_size: 1 } },
    "7": { class_type: "Flux2Scheduler", inputs: { steps, width: v.width, height: v.height } },
    "8": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "9": { class_type: "RandomNoise", inputs: { noise_seed: v.seed } },
  };
  let cond: [string, number] = ["4", 0];
  const refs = v.refs ?? [];
  refs.forEach((name, i) => {
    const [load, enc, ref] = [`20${i}`, `21${i}`, `22${i}`];
    g[load] = { class_type: "LoadImage", inputs: { image: name } };
    g[enc] = { class_type: "VAEEncode", inputs: { pixels: [load, 0], vae: ["3", 0] } };
    g[ref] = { class_type: "ReferenceLatent", inputs: { conditioning: cond, latent: [enc, 0] } };
    cond = [ref, 0];
  });
  if (refs.length > 0 && v.late !== undefined && v.late > 0) {
    // The text alone until `late`, then the referenced conditioning: composition first, identity after.
    g["30"] = { class_type: "ConditioningSetTimestepRange", inputs: { conditioning: ["4", 0], start: 0.0, end: v.late } };
    g["31"] = { class_type: "ConditioningSetTimestepRange", inputs: { conditioning: cond, start: v.late, end: 1.0 } };
    g["32"] = { class_type: "ConditioningCombine", inputs: { conditioning_1: ["30", 0], conditioning_2: ["31", 0] } };
    cond = ["32", 0];
  }
  g["5"] = { class_type: "FluxGuidance", inputs: { conditioning: cond, guidance: 4.0 } };
  g["10"] = { class_type: "BasicGuider", inputs: { model: ["1", 0], conditioning: ["5", 0] } };
  g["11"] = { class_type: "SamplerCustomAdvanced", inputs: { noise: ["9", 0], guider: ["10", 0], sampler: ["8", 0], sigmas: ["7", 0], latent_image: ["6", 0] } };
  g["12"] = { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["3", 0] } };
  g[SAVE] = { class_type: "SaveImage", inputs: { images: ["12", 0], filename_prefix: v.prefix } };
  return g;
}

function checkRequest(r: FluxRequest): { readonly aspect: FluxAspect; readonly prompt: string; readonly refs: readonly Uint8Array[]; readonly late: number } {
  const prompt = r.prompt.trim();
  if (prompt === "") throw new AppError("invalid", "a Flux frame needs a prompt");
  if (prompt.length > PROMPT_MAX) throw new AppError("invalid", `a Flux prompt is at most ${PROMPT_MAX} characters, got ${prompt.length}`);
  const aspect = r.aspect ?? "16:9";
  if (!FLUX_ASPECTS.includes(aspect)) throw new AppError("invalid", `a Flux frame is ${FLUX_ASPECTS.join(" or ")}, got ${String(aspect)}`);
  if (r.seed !== undefined && (!Number.isInteger(r.seed) || r.seed < 0 || r.seed > FLUX_SEED_MAX)) throw new AppError("invalid", `a Flux seed is a whole number from 0 to ${FLUX_SEED_MAX}, got ${r.seed}`);
  const refs = r.refs ?? [];
  if (refs.length > FLUX_REFS_MAX) throw new AppError("invalid", `a Flux frame takes at most ${FLUX_REFS_MAX} reference stills, got ${refs.length}`);
  for (const [i, b] of refs.entries()) {
    if (b.byteLength === 0 || b.byteLength > MAX_REF_BYTES) throw new AppError("invalid", `reference ${i + 1} is ${b.byteLength} bytes; a reference is 1 byte to ${MAX_REF_BYTES / 1024 ** 2} MB`);
    if (!PNG_MAGIC.every((x, k) => b[k] === x)) throw new AppError("invalid", `reference ${i + 1} is not a PNG`);
  }
  const late = r.late ?? REFERENCE_LATE;
  if (!Number.isFinite(late) || late < 0 || late >= 1) throw new AppError("invalid", `a reference joins at 0 to under 1 of the denoise, got ${late}`);
  return { aspect, prompt, refs, late };
}

type Upload = { name?: string; subfolder?: string };

/** One reference still onto the box, named by its bytes (comfyLtx.ts's rule): a retry uploads the same name. */
async function upload(c: Ctx, bytes: Uint8Array): Promise<string> {
  const sha = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `ref-${sha}.png`);
  form.append("type", "input");
  form.append("subfolder", "gravitone");
  form.append("overwrite", "true");
  const up = await json<Upload>(c, "/upload/image", { method: "POST", body: form, ms: 120_000 });
  if (typeof up.name !== "string" || up.name === "") throw unavailable(`ComfyUI took a reference still but named no file: ${short(JSON.stringify(up))}`);
  return up.subfolder ? `${up.subfolder}/${up.name}` : up.name;
}

/* ── The draw ────────────────────────────────────────────────────────────── */

type Queued = { prompt_id?: string };
type Refusal = { error?: { message?: string; details?: string }; node_errors?: Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }> };
type Entry = { status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] }; outputs?: Record<string, Record<string, unknown>> };
type QueueDoc = { queue_running?: unknown[][]; queue_pending?: unknown[][] };

function refusalOf(status: number, text: string): string {
  let r: Refusal;
  try {
    r = JSON.parse(text) as Refusal;
  } catch {
    return `ComfyUI refused the Flux graph (${status}): ${short(text)}`;
  }
  const nodes = Object.entries(r.node_errors ?? {}).map(([id, n]) => `${n.class_type ?? "?"} ${id}: ${(n.errors ?? []).map((e) => `${e.message ?? ""}${e.details ? ` (${e.details})` : ""}`).join("; ")}`);
  const head = `${r.error?.message ?? "invalid prompt"}${r.error?.details ? `: ${r.error.details}` : ""}`;
  return `ComfyUI refused the Flux graph (${status}): ${head}${nodes.length > 0 ? ` - ${nodes.join(" | ")}` : ""}`;
}

function failureOf(id: string, e: Entry): string | null {
  if (e.status?.status_str !== "error") return null;
  for (const [type, d] of e.status.messages ?? []) {
    if (type === "execution_error") return `ComfyUI ${String(d["node_type"] ?? "?")} (node ${String(d["node_id"] ?? "?")}) failed: ${String(d["exception_message"] ?? "").trim()}`;
    if (type === "execution_interrupted") return `ComfyUI interrupted prompt ${id} at ${String(d["node_type"] ?? "?")} (node ${String(d["node_id"] ?? "?")})`;
  }
  return `ComfyUI ended prompt ${id} with an error and no message`;
}

/** The PNG SaveImage wrote: the first image in the save node's output. */
function imageOf(e: Entry): { filename: string; subfolder: string; type: string } | undefined {
  const imgs = e.outputs?.[SAVE]?.["images"];
  if (!Array.isArray(imgs)) return undefined;
  for (const x of imgs as Record<string, unknown>[]) if (typeof x?.["filename"] === "string") return { filename: x["filename"], subfolder: typeof x["subfolder"] === "string" ? x["subfolder"] : "", type: typeof x["type"] === "string" ? x["type"] : "output" };
  return undefined;
}

const holds = (q: QueueDoc, id: string, which: "queue_running" | "queue_pending"): boolean => (q[which] ?? []).some((row) => row[1] === id);

/** Ours, and only ours, out of the queue. */
async function withdraw(c: Ctx, id: string): Promise<string> {
  const q = await json<QueueDoc>(c, "/queue", { method: "GET", ms: 10_000 }).catch(() => ({}) as QueueDoc);
  if (holds(q, id, "queue_pending")) {
    await call(c, "/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delete: [id] }), ms: 10_000 }).catch(() => undefined);
    return "still queued behind other prompts, and was withdrawn";
  }
  if (holds(q, id, "queue_running")) {
    await call(c, "/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt_id: id }), ms: 10_000 }).catch(() => undefined);
    return "still running, and was interrupted";
  }
  return "in neither queue";
}

/** One frame from one prompt: reachable, queue, wait, fetch. The seed is the request's, else a random one, and is returned. */
export async function drawFlux(req: FluxRequest, deps: FluxDeps = {}): Promise<FluxStill> {
  const { aspect, prompt, refs, late } = checkRequest(req);
  const { width, height } = FLUX_SIZE[aspect];
  const seed = req.seed ?? (deps.seed ?? (() => randomInt(0, 2 ** 47)))();
  const c: Ctx = { f: deps.fetch ?? fetch, base: deps.base ?? fluxBase() };
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const t0 = now();
  await json<unknown>(c, "/system_stats", { method: "GET", ms: 10_000 }).catch((e: unknown) => {
    throw unavailable(`ComfyUI is not reachable at ${c.base}, so no Flux frame was drawn (${e instanceof Error ? e.message : String(e)})`);
  });
  const names: string[] = [];
  for (const b of refs) names.push(await upload(c, b));
  const graph = fluxGraph({ prompt, seed, width, height, prefix: `gravitone/flux2-${seed}`, ...(names.length === 0 ? {} : { refs: names, late }) });
  const sent = await call(c, "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph, client_id: `gravitone-${randomUUID()}` }), ms: 30_000 });
  const sentText = await sent.text();
  if (!sent.ok) throw unavailable(refusalOf(sent.status, sentText));
  let id: string | undefined;
  try {
    id = (JSON.parse(sentText) as Queued).prompt_id;
  } catch {
    id = undefined;
  }
  if (typeof id !== "string" || id === "") throw unavailable(`ComfyUI queued the Flux graph but returned no prompt id: ${short(sentText)}`);
  const cap = deps.capMs ?? CAP_MS;
  let lost = 0;
  let entry: Entry | undefined;
  for (;;) {
    const h = await json<Record<string, Entry>>(c, `/history/${encodeURIComponent(id)}`, { method: "GET", ms: 15_000 }).catch(() => null);
    entry = h?.[id];
    if (entry !== undefined && (entry.status?.completed === true || entry.status?.status_str === "error" || imageOf(entry) !== undefined)) break;
    if (h === null) lost++;
    else {
      const q = await json<QueueDoc>(c, "/queue", { method: "GET", ms: 10_000 }).catch(() => null);
      lost = q === null || (!holds(q, id, "queue_running") && !holds(q, id, "queue_pending") && entry === undefined) ? lost + 1 : 0;
    }
    if (lost >= LOST_POLLS) throw unavailable(`ComfyUI at ${c.base} lost prompt ${id}: unreachable, or holding it in neither its queue nor its history, for ${LOST_POLLS} polls (restarted?)`);
    const waited = now() - t0;
    if (waited >= cap) {
      const was = await withdraw(c, id);
      throw unavailable(`ComfyUI did not finish Flux prompt ${id} within ${Math.round(cap / 60_000)} min (waited ${Math.round(waited / 1000)} s); it was ${was}`);
    }
    await sleep(deps.pollMs ?? POLL_MS);
  }
  const failed = failureOf(id, entry);
  if (failed !== null) throw unavailable(failed);
  const img = imageOf(entry);
  if (img === undefined) throw unavailable(`ComfyUI finished Flux prompt ${id} but its SaveImage node ${SAVE} wrote no file`);
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
  const r = await call(c, `/view?${q.toString()}`, { method: "GET", ms: 60_000 });
  if (!r.ok) throw unavailable(`ComfyUI /view answered ${r.status} for ${img.subfolder}/${img.filename}: ${short(await r.text())}`);
  const png = new Uint8Array(await r.arrayBuffer());
  if (png.byteLength === 0 || png.byteLength > MAX_IMAGE_BYTES) throw unavailable(`ComfyUI's ${img.filename} is ${png.byteLength} bytes; a frame is 1 byte to ${MAX_IMAGE_BYTES / 1024 ** 2} MB`);
  if (!PNG_MAGIC.every((b, i) => png[i] === b)) throw unavailable(`ComfyUI's ${img.filename} is not a PNG`);
  return { png, seed, model: FLUX_MODEL, promptId: id, width, height, wallMs: now() - t0 };
}
