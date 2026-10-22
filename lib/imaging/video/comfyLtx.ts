// LTX-2.5 IMAGE-TO-VIDEO ON THIS BOX - the local clip engine, over the HTTP API of the ComfyUI
// that already runs here (`COMFY_URL`, default http://127.0.0.1:8188). Server-only. No shell, no
// websocket: five plain requests, each bounded by its own timeout, and the whole render by one cap.
//
//   1. GET  /system_stats      reachable, or the render is refused with a sentence before anything
//                              is sent (a night on a box whose ComfyUI is down says so; it does not
//                              queue into a void);
//   2. POST /upload/image      OUR still, multipart, named by its content (`gravitone/<sha>.png`),
//                              so a retry uploads the same file to the same name;
//   3. POST /prompt            pipeline/video/ltx-i2v-api.json with the image, prompt, size, length
//                              and seeds set (the node ids are its sibling .md's table);
//   4. GET  /history/{id}      every 5 s until it is there, capped at 20 min (the Lynx bench
//                              measured ~6-7 min for a 5 s 1280x704 clip alone on the card, and
//                              2-3x that with another session's jobs in the same queue);
//   5. GET  /view              the mp4 SaveVideo wrote, then POST /free.
//
// THE FREE IS NOT OPTIONAL (lynx-bench replication EXECUTOR-BRIEF, the commit-charge lesson): on
// this box the binding limit is Windows' commit charge, not VRAM, and a 22B transformer left
// loaded between jobs is what pushed the next one over. So every render that reached the queue
// ends with `{"unload_models": true, "free_memory": true}`, served or failed.
//
// THE QUEUE IS SHARED. Another session's prompts may run ahead of ours, and that wait counts
// against the cap. Nothing here touches a prompt that is not ours: at the cap ours is deleted
// from the pending list, or interrupted BY ITS ID if it is the one running.
//
// A COMFYUI ERROR IS KEPT VERBATIM - the node's class, its id and its exception text, or the
// /prompt validator's node errors - because "the render failed" tells nobody which file is
// missing. Errors are AppError: `unavailable` for anything the box did (a retry of the same graph
// on the same card fails the same way, and a night must move on), `invalid` for a request this
// module refuses before sending.

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@gt/domain/errors";

import { sleep as realSleep } from "../../sleep";

export const COMFY_DEFAULT_URL = "http://127.0.0.1:8188";
export const LTX_MODEL = "ltx-2.5-distilled";
export const LTX_GRAPH = path.join("pipeline", "video", "ltx-i2v-api.json");

/** The graph's node ids this engine sets (pipeline/video/ltx-i2v-api.md), with the class each must be. */
export const LTX_NODES = {
  image: { id: "1", cls: "LoadImage" },
  save: { id: "2", cls: "SaveVideo" },
  prompt: { id: "452:409", cls: "PrimitiveStringMultiline" },
  width: { id: "452:418", cls: "PrimitiveInt" },
  height: { id: "452:421", cls: "PrimitiveInt" },
  seconds: { id: "452:413", cls: "PrimitiveInt" },
  fps: { id: "452:425", cls: "PrimitiveInt" },
  seed: { id: "452:423", cls: "RandomNoise" },
  seed2: { id: "452:442", cls: "RandomNoise" },
} as const;

/** 960x576: the 16:9 the replicas are drawn at, generated at 480x288 and upscaled x2 in latent space. */
export const LTX_DEFAULTS = { width: 960, height: 576, seconds: 5, fps: 24 } as const;
const POLL_MS = 5_000;
const CAP_MS = 20 * 60_000;
/** Consecutive polls ComfyUI may miss (unreachable, or our prompt in neither queue nor history) before the render is called lost. */
const LOST_POLLS = 6;
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

export type ComfyFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type ComfyDeps = {
  readonly fetch?: ComfyFetch;
  /** Default `COMFY_URL`, else 127.0.0.1:8188. */
  readonly base?: string;
  /** The repo root the graph is read under (default the process's cwd). */
  readonly root?: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly capMs?: number;
};

export type LtxRequest = {
  readonly image: { readonly bytes: Uint8Array; readonly mime: "image/png" | "image/jpeg" | "image/webp" };
  /** The motion line, verbatim. */
  readonly prompt: string;
  readonly seed?: number;
  readonly width?: number;
  readonly height?: number;
  readonly seconds?: number;
};

export type LtxClip = {
  readonly bytes: Uint8Array;
  readonly mime: "video/mp4";
  readonly model: typeof LTX_MODEL;
  readonly promptId: string;
  /** ComfyUI's output file, `<subfolder>/<name>`. */
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly wallMs: number;
};

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
type Ctx = { readonly f: ComfyFetch; readonly base: string };

export const comfyBase = (env: Readonly<Record<string, string | undefined>> = process.env): string => (env["COMFY_URL"]?.trim() || COMFY_DEFAULT_URL).replace(/\/+$/, "");

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

/* ── Reachability and the weights (the doctor reads these too) ───────────── */

type Stats = { system?: { comfyui_version?: string; ram_total?: number; ram_free?: number }; devices?: { name?: string; vram_total?: number; vram_free?: number }[] };

const gb = (n: number | undefined): string => (typeof n === "number" ? (n / 1024 ** 3).toFixed(1) : "?");

/** `ComfyUI 0.42.1 · VRAM 109.2/109.7 GB free · RAM 35.3/64.0 GB free`, or throws the unreachable sentence. */
export async function comfyStats(deps: ComfyDeps = {}): Promise<string> {
  const c: Ctx = { f: deps.fetch ?? fetch, base: deps.base ?? comfyBase() };
  const s = await json<Stats>(c, "/system_stats", { method: "GET", ms: 10_000 });
  const d = s.devices?.[0];
  return `ComfyUI ${s.system?.comfyui_version ?? "?"} · VRAM ${gb(d?.vram_free)}/${gb(d?.vram_total)} GB free · RAM ${gb(s.system?.ram_free)}/${gb(s.system?.ram_total)} GB free`;
}

export async function loadGraph(root: string = process.cwd()): Promise<Graph> {
  const file = path.join(root, LTX_GRAPH);
  const text = await readFile(file, "utf8").catch(() => {
    throw new AppError("internal", `the LTX graph could not be read from ${file}`);
  });
  return JSON.parse(text) as Graph;
}

/** The model files the graph's loaders name, as `<LoaderClass>.<input>: <file>`. */
export function graphModels(g: Graph): { readonly cls: string; readonly input: string; readonly file: string }[] {
  const out: { cls: string; input: string; file: string }[] = [];
  for (const n of Object.values(g)) {
    if (!n.class_type.endsWith("Loader")) continue;
    for (const [input, v] of Object.entries(n.inputs)) if (typeof v === "string" && v.endsWith(".safetensors")) out.push({ cls: n.class_type, input, file: v });
  }
  return out;
}

/** The graph's model files ComfyUI does not list (its /object_info combo options). Empty: all present. */
export async function missingModels(deps: ComfyDeps = {}): Promise<{ readonly present: number; readonly missing: readonly string[] }> {
  const c: Ctx = { f: deps.fetch ?? fetch, base: deps.base ?? comfyBase() };
  const want = graphModels(await loadGraph(deps.root));
  const missing: string[] = [];
  const info = new Map<string, Record<string, unknown>>();
  for (const w of want) {
    if (!info.has(w.cls)) info.set(w.cls, (await json<Record<string, Record<string, unknown>>>(c, `/object_info/${encodeURIComponent(w.cls)}`, { method: "GET", ms: 20_000 }))[w.cls] ?? {});
    const spec = ((info.get(w.cls)?.["input"] as { required?: Record<string, unknown[]> } | undefined)?.required ?? {})[w.input];
    // Two combo spellings: `[[...files]]` and `["COMBO", { options: [...] }]`.
    const head = spec?.[0];
    const options = Array.isArray(head) ? head : ((spec?.[1] as { options?: unknown[] } | undefined)?.options ?? []);
    if (!options.includes(w.file)) missing.push(w.file);
  }
  return { present: want.length - missing.length, missing };
}

/* ── The graph, set ──────────────────────────────────────────────────────── */

/** The graph with the request's values on its nodes; refuses a graph whose node ids drifted from the table. */
export function setGraph(g: Graph, v: { readonly image: string; readonly prompt: string; readonly width: number; readonly height: number; readonly seconds: number; readonly fps: number; readonly seed: number; readonly prefix: string }): Graph {
  const out = structuredClone(g);
  const node = (k: keyof typeof LTX_NODES): Record<string, unknown> => {
    const want = LTX_NODES[k];
    const n = out[want.id];
    if (n?.class_type !== want.cls) throw new AppError("internal", `${LTX_GRAPH}: node ${want.id} should be ${want.cls} (the ${k}) but is ${n?.class_type ?? "absent"}; the graph and comfyLtx.ts LTX_NODES disagree`);
    return n.inputs;
  };
  node("image")["image"] = v.image;
  node("prompt")["value"] = v.prompt;
  node("width")["value"] = v.width;
  node("height")["value"] = v.height;
  node("seconds")["value"] = v.seconds;
  node("fps")["value"] = v.fps;
  node("seed")["noise_seed"] = v.seed;
  node("seed2")["noise_seed"] = v.seed + 1;
  node("save")["filename_prefix"] = v.prefix;
  return out;
}

function checkRequest(r: LtxRequest): { width: number; height: number; seconds: number } {
  const width = r.width ?? LTX_DEFAULTS.width;
  const height = r.height ?? LTX_DEFAULTS.height;
  const seconds = r.seconds ?? LTX_DEFAULTS.seconds;
  // Both passes must sit on LTX's 32-pixel latent grid, and the first runs at half size.
  if (width % 64 !== 0 || height % 64 !== 0 || width < 256 || height < 256 || width > 1920 || height > 1920) throw new AppError("invalid", `an LTX clip is ${width}x${height}: each side must be a multiple of 64 between 256 and 1920 (the first pass runs at half size on a 32-pixel grid)`);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 10) throw new AppError("invalid", `an LTX clip of ${seconds} s: whole seconds from 1 to 10`);
  if (r.prompt.trim() === "") throw new AppError("invalid", "an LTX clip needs a motion line");
  return { width, height, seconds };
}

/* ── The render ──────────────────────────────────────────────────────────── */

type Upload = { name?: string; subfolder?: string };
type Queued = { prompt_id?: string };
type Refusal = { error?: { message?: string; details?: string }; node_errors?: Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }> };
type Entry = { status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] }; outputs?: Record<string, Record<string, unknown>> };
type QueueDoc = { queue_running?: unknown[][]; queue_pending?: unknown[][] };

/** The /prompt validator's refusal, every node's errors kept. */
function refusalOf(status: number, text: string): string {
  let r: Refusal;
  try {
    r = JSON.parse(text) as Refusal;
  } catch {
    return `ComfyUI refused the graph (${status}): ${short(text)}`;
  }
  const nodes = Object.entries(r.node_errors ?? {}).map(([id, n]) => `${n.class_type ?? "?"} ${id}: ${(n.errors ?? []).map((e) => `${e.message ?? ""}${e.details ? ` (${e.details})` : ""}`).join("; ")}`);
  const head = `${r.error?.message ?? "invalid prompt"}${r.error?.details ? `: ${r.error.details}` : ""}`;
  return `ComfyUI refused the graph (${status}): ${head}${nodes.length > 0 ? ` - ${nodes.join(" | ")}` : ""}`;
}

/** A finished entry's error, verbatim, or null when it succeeded. */
function failureOf(id: string, e: Entry): string | null {
  if (e.status?.status_str !== "error") return null;
  for (const [type, d] of e.status.messages ?? []) {
    if (type === "execution_error") return `ComfyUI ${String(d["node_type"] ?? "?")} (node ${String(d["node_id"] ?? "?")}) failed: ${String(d["exception_message"] ?? "").trim()}`;
    if (type === "execution_interrupted") return `ComfyUI interrupted prompt ${id} at ${String(d["node_type"] ?? "?")} (node ${String(d["node_id"] ?? "?")})`;
  }
  return `ComfyUI ended prompt ${id} with an error and no message`;
}

/** The video SaveVideo wrote: the first file in the save node's output. */
function videoOf(e: Entry): { filename: string; subfolder: string; type: string } | undefined {
  const out = e.outputs?.[LTX_NODES.save.id] ?? {};
  for (const v of Object.values(out)) {
    if (!Array.isArray(v)) continue;
    for (const x of v as Record<string, unknown>[]) if (typeof x?.["filename"] === "string") return { filename: x["filename"], subfolder: typeof x["subfolder"] === "string" ? x["subfolder"] : "", type: typeof x["type"] === "string" ? x["type"] : "output" };
  }
  return undefined;
}

const holds = (q: QueueDoc, id: string, which: "queue_running" | "queue_pending"): boolean => (q[which] ?? []).some((row) => row[1] === id);

async function free(c: Ctx): Promise<void> {
  // Best effort: a free that fails leaves the models loaded, which the next render survives.
  await call(c, "/free", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }), ms: 30_000 }).catch(() => undefined);
}

/** Ours, and only ours, out of the queue: deleted while pending, interrupted by id while running. */
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

/** One clip from one still: upload, queue, wait, fetch, free. */
export async function renderLtxClip(req: LtxRequest, deps: ComfyDeps = {}): Promise<LtxClip> {
  const { width, height, seconds } = checkRequest(req);
  const c: Ctx = { f: deps.fetch ?? fetch, base: deps.base ?? comfyBase() };
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const graph = await loadGraph(deps.root);
  const t0 = now();
  // 1. reachable, or refused before anything is sent.
  await comfyStats({ fetch: c.f, base: c.base }).catch((e: unknown) => {
    throw unavailable(`ComfyUI is not reachable at ${c.base}, so no local clip was rendered (${e instanceof Error ? e.message : String(e)})`);
  });
  // 2. our still, named by its bytes.
  const sha = createHash("sha256").update(req.image.bytes).digest("hex").slice(0, 16);
  const ext = req.image.mime === "image/jpeg" ? "jpg" : req.image.mime === "image/webp" ? "webp" : "png";
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(req.image.bytes)], { type: req.image.mime }), `${sha}.${ext}`);
  form.append("type", "input");
  form.append("subfolder", "gravitone");
  form.append("overwrite", "true");
  const up = await json<Upload>(c, "/upload/image", { method: "POST", body: form, ms: 120_000 });
  if (typeof up.name !== "string" || up.name === "") throw unavailable(`ComfyUI took the still but named no file: ${short(JSON.stringify(up))}`);
  const image = up.subfolder ? `${up.subfolder}/${up.name}` : up.name;
  // 3. the graph, set, queued under our client id.
  const fps = LTX_DEFAULTS.fps;
  const seed = req.seed ?? 1;
  const prompt = setGraph(graph, { image, prompt: req.prompt, width, height, seconds, fps, seed, prefix: `gravitone/ltx-${sha}` });
  const sent = await call(c, "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, client_id: `gravitone-${randomUUID()}` }), ms: 30_000 });
  const sentText = await sent.text();
  if (!sent.ok) throw unavailable(refusalOf(sent.status, sentText));
  const id = (JSON.parse(sentText) as Queued).prompt_id;
  if (typeof id !== "string" || id === "") throw unavailable(`ComfyUI queued the graph but returned no prompt id: ${short(sentText)}`);
  try {
    // 4. wait for it, bounded.
    const cap = deps.capMs ?? CAP_MS;
    let lost = 0;
    let entry: Entry | undefined;
    for (;;) {
      const h = await json<Record<string, Entry>>(c, `/history/${encodeURIComponent(id)}`, { method: "GET", ms: 15_000 }).catch(() => null);
      entry = h?.[id];
      if (entry !== undefined && (entry.status?.completed === true || entry.status?.status_str === "error" || videoOf(entry) !== undefined)) break;
      if (h === null) lost++;
      else {
        const q = await json<QueueDoc>(c, "/queue", { method: "GET", ms: 10_000 }).catch(() => null);
        lost = q === null || (!holds(q, id, "queue_running") && !holds(q, id, "queue_pending") && entry === undefined) ? lost + 1 : 0;
      }
      if (lost >= LOST_POLLS) throw unavailable(`ComfyUI at ${c.base} lost prompt ${id}: unreachable, or holding it in neither its queue nor its history, for ${LOST_POLLS} polls (restarted?)`);
      const waited = now() - t0;
      if (waited >= cap) {
        const was = await withdraw(c, id);
        throw unavailable(`ComfyUI did not finish prompt ${id} within ${Math.round(cap / 60_000)} min (waited ${Math.round(waited / 1000)} s); it was ${was}`);
      }
      await sleep(deps.pollMs ?? POLL_MS);
    }
    const failed = failureOf(id, entry);
    if (failed !== null) throw unavailable(failed);
    const v = videoOf(entry);
    if (v === undefined) throw unavailable(`ComfyUI finished prompt ${id} but its SaveVideo node ${LTX_NODES.save.id} wrote no file`);
    // 5. the mp4.
    const q = new URLSearchParams({ filename: v.filename, subfolder: v.subfolder, type: v.type });
    const r = await call(c, `/view?${q.toString()}`, { method: "GET", ms: 120_000 });
    if (!r.ok) throw unavailable(`ComfyUI /view answered ${r.status} for ${v.subfolder}/${v.filename}: ${short(await r.text())}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_VIDEO_BYTES) throw unavailable(`ComfyUI's ${v.filename} is ${bytes.byteLength} bytes; a clip is 1 byte to ${MAX_VIDEO_BYTES / 1024 ** 2} MB`);
    return { bytes, mime: "video/mp4", model: LTX_MODEL, promptId: id, output: v.subfolder ? `${v.subfolder}/${v.filename}` : v.filename, width, height, frames: seconds * fps + 1, wallMs: now() - t0 };
  } finally {
    await free(c);
  }
}
