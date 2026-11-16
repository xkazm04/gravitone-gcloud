import { createHash, randomUUID } from "node:crypto";

import { AppError } from "@gt/domain/errors";

import { sleep as realSleep } from "../../sleep";

// SHEETSAGE2 AND YUE2 ON THIS BOX'S COMFYUI (spark track-mirror-studio), over its HTTP API (`COMFY_URL`, default
// http://127.0.0.1:8188) - lib/imaging/local/flux2.ts's client, for audio. No shell, no websocket, no Python.
//
//   transcribe  POST /upload/image the section wav into input/gravitone/ (ComfyUI 0.42.1's upload writes any file's
//               bytes; LoadAudio validates by path, not by its combo list), queue transcribeGraph, read the ABC text
//               from the PreviewAny node's `text` in /history.
//   render      queue renderGraph, then GET /view the flac SaveAudio wrote.
//
// The graphs are pipeline/track-mirror/comfy.py `transcribe_graph` and `render_graph`, node ids kept, with the knobs the
// cover route fixes (docs/concepts/yue2-audio-experiments-2026-11-06.md): mode full, temperature 0.8, top_p 0.95,
// top_k 100, repetition_penalty 1.2, cfg_scale 1, 32 steps of dpm_2 / sgm_uniform at cfg 1, max_duration 360.
//
// A SHARED SERVICE, TREATED AS ONE: never /free, never a restart; at the cap ours, and only ours, leaves the queue.
// A NODE'S EXCEPTION IS KEPT VERBATIM: ComfyError carries ComfyUI's own exception_message as its whole message, so the
// take and the job say exactly what ComfyUI said.

export const YUE2_CHECKPOINT = "yue2_3b_int8_convrot.safetensors";
export const SHEETSAGE2_ENCODER = "sheetsage2_bf16.safetensors";
export const YUE2_KNOBS = { mode: "full", temperature: 0.8, top_p: 0.95, top_k: 100, repetition_penalty: 1.2, cfg_scale: 1, max_duration: 360, steps: 32, cfg: 1, sampler_name: "dpm_2", scheduler: "sgm_uniform" } as const;

const PREVIEW = "4";
const SAVE = "7";
const POLL_MS = 2_000;
const CAP_MS = 20 * 60_000;
const LOST_POLLS = 6;
const MAX_AUDIO_BYTES = 256 * 1024 * 1024;

export type ComfyFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Yue2Deps = {
  readonly fetch?: ComfyFetch;
  /** Default `COMFY_URL`, else 127.0.0.1:8188. */
  readonly base?: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly capMs?: number;
};

/** A node failed while ComfyUI ran the graph: `message` is its exception text, verbatim. */
export class ComfyError extends AppError {
  readonly node: string;
  constructor(message: string, node: string) {
    super("unavailable", message);
    this.name = "ComfyError";
    this.node = node;
  }
}

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
type Ctx = { readonly f: ComfyFetch; readonly base: string; readonly now: () => number; readonly sleep: (ms: number) => Promise<void>; readonly pollMs: number; readonly capMs: number };
type Entry = { status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] }; outputs?: Record<string, Record<string, unknown>> };
type QueueDoc = { queue_running?: unknown[][]; queue_pending?: unknown[][] };

export const comfyBase = (env: Readonly<Record<string, string | undefined>> = process.env): string => (env["COMFY_URL"]?.trim() || "http://127.0.0.1:8188").replace(/\/+$/, "");

const ctxOf = (d: Yue2Deps): Ctx => ({ f: d.fetch ?? fetch, base: d.base ?? comfyBase(), now: d.now ?? Date.now, sleep: d.sleep ?? realSleep, pollMs: d.pollMs ?? POLL_MS, capMs: d.capMs ?? CAP_MS });
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

/* ── The graphs ──────────────────────────────────────────────────────────── */

export function transcribeGraph(input: string): Graph {
  return {
    "1": { class_type: "LoadAudio", inputs: { audio: input } },
    "2": { class_type: "AudioEncoderLoader", inputs: { audio_encoder_name: SHEETSAGE2_ENCODER } },
    "3": { class_type: "SheetSage2AudioToABC", inputs: { audio_encoder: ["2", 0], audio: ["1", 0], mode: YUE2_KNOBS.mode } },
    [PREVIEW]: { class_type: "PreviewAny", inputs: { source: ["3", 0] } },
  };
}

export type Take = { readonly abc: string; readonly style: string; readonly lyrics: string; readonly seed: number; readonly prefix: string };

export function renderGraph(t: Take): Graph {
  const k = YUE2_KNOBS;
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: YUE2_CHECKPOINT } },
    "2": { class_type: "YuE2GenerateMusic", inputs: { clip: ["1", 1], style: t.style, lyrics: t.lyrics, abc: t.abc, seed: t.seed, mode: k.mode, max_duration: k.max_duration, temperature: k.temperature, top_p: k.top_p, top_k: k.top_k, repetition_penalty: k.repetition_penalty, cfg_scale: k.cfg_scale } },
    "3": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["2", 0] } },
    "4": { class_type: "EmptyYuE2LatentAudio", inputs: { seconds: ["2", 1], batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: t.seed, steps: k.steps, cfg: k.cfg, sampler_name: k.sampler_name, scheduler: k.scheduler, denoise: 1 } },
    "6": { class_type: "VAEDecodeAudio", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    [SAVE]: { class_type: "SaveAudio", inputs: { audio: ["6", 0], filename_prefix: t.prefix } },
  };
}

/* ── Queue, wait, read ───────────────────────────────────────────────────── */

const holds = (q: QueueDoc, id: string, which: "queue_running" | "queue_pending"): boolean => (q[which] ?? []).some((row) => row[1] === id);

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

function refusalOf(status: number, text: string): string {
  try {
    const r = JSON.parse(text) as { error?: { message?: string; details?: string }; node_errors?: Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }> };
    const nodes = Object.entries(r.node_errors ?? {}).map(([id, n]) => `${n.class_type ?? "?"} ${id}: ${(n.errors ?? []).map((e) => `${e.message ?? ""}${e.details ? ` (${e.details})` : ""}`).join("; ")}`);
    return `ComfyUI refused the graph (${status}): ${r.error?.message ?? "invalid prompt"}${r.error?.details ? `: ${r.error.details}` : ""}${nodes.length > 0 ? ` - ${nodes.join(" | ")}` : ""}`;
  } catch {
    return `ComfyUI refused the graph (${status}): ${short(text)}`;
  }
}

/** One graph through the queue to its history entry. A node's failure throws ComfyError with its exception verbatim. */
async function runGraph(c: Ctx, graph: Graph, done: (e: Entry) => boolean): Promise<{ readonly id: string; readonly entry: Entry }> {
  const t0 = c.now();
  const sent = await call(c, "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph, client_id: `gravitone-${randomUUID()}` }), ms: 30_000 });
  const sentText = await sent.text();
  if (!sent.ok) throw unavailable(refusalOf(sent.status, sentText));
  let id: string | undefined;
  try {
    id = (JSON.parse(sentText) as { prompt_id?: string }).prompt_id;
  } catch {
    id = undefined;
  }
  if (typeof id !== "string" || id === "") throw unavailable(`ComfyUI queued the graph but returned no prompt id: ${short(sentText)}`);
  let lost = 0;
  for (;;) {
    const h = await json<Record<string, Entry>>(c, `/history/${encodeURIComponent(id)}`, { method: "GET", ms: 15_000 }).catch(() => null);
    const entry = h?.[id];
    if (entry !== undefined && (entry.status?.completed === true || entry.status?.status_str === "error" || done(entry))) {
      if (entry.status?.status_str === "error") {
        for (const [type, d] of entry.status.messages ?? []) {
          if (type === "execution_error") throw new ComfyError(String(d["exception_message"] ?? "").trim() || `${String(d["node_type"] ?? "?")} failed with no message`, String(d["node_id"] ?? "?"));
          if (type === "execution_interrupted") throw unavailable(`ComfyUI interrupted prompt ${id} at ${String(d["node_type"] ?? "?")} (node ${String(d["node_id"] ?? "?")})`);
        }
        throw unavailable(`ComfyUI ended prompt ${id} with an error and no message`);
      }
      return { id, entry };
    }
    if (h === null) lost++;
    else {
      const q = await json<QueueDoc>(c, "/queue", { method: "GET", ms: 10_000 }).catch(() => null);
      lost = q === null || (!holds(q, id, "queue_running") && !holds(q, id, "queue_pending") && entry === undefined) ? lost + 1 : 0;
    }
    if (lost >= LOST_POLLS) throw unavailable(`ComfyUI at ${c.base} lost prompt ${id}: unreachable, or holding it in neither its queue nor its history, for ${LOST_POLLS} polls (restarted?)`);
    const waited = c.now() - t0;
    if (waited >= c.capMs) {
      const was = await withdraw(c, id);
      throw unavailable(`ComfyUI did not finish prompt ${id} within ${Math.round(c.capMs / 60_000)} min (waited ${Math.round(waited / 1000)} s); it was ${was}`);
    }
    await c.sleep(c.pollMs);
  }
}

const textOf = (e: Entry): string | undefined => {
  const t = e.outputs?.[PREVIEW]?.["text"];
  const s = Array.isArray(t) ? t[0] : t;
  return typeof s === "string" ? s : undefined;
};

function audioOf(e: Entry): { filename: string; subfolder: string; type: string } | undefined {
  const a = e.outputs?.[SAVE]?.["audio"];
  if (!Array.isArray(a)) return undefined;
  for (const x of a as Record<string, unknown>[]) if (typeof x?.["filename"] === "string") return { filename: x["filename"], subfolder: typeof x["subfolder"] === "string" ? x["subfolder"] : "", type: typeof x["type"] === "string" ? x["type"] : "output" };
  return undefined;
}

/** The section's ABC score. `name` keys the upload (a cover's id): the bytes' digest makes it unique per section. */
export async function transcribeAbc(wav: Uint8Array, name: string, deps: Yue2Deps = {}): Promise<{ readonly abc: string; readonly promptId: string }> {
  const c = ctxOf(deps);
  if (wav.byteLength === 0) throw new AppError("invalid", "the section wav is empty");
  const sha = createHash("sha256").update(wav).digest("hex").slice(0, 16);
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), `cover-${name}-${sha}.wav`);
  form.append("type", "input");
  form.append("subfolder", "gravitone");
  form.append("overwrite", "true");
  const up = await json<{ name?: string; subfolder?: string }>(c, "/upload/image", { method: "POST", body: form, ms: 120_000 });
  if (typeof up.name !== "string" || up.name === "") throw unavailable(`ComfyUI took the section but named no file: ${short(JSON.stringify(up))}`);
  const input = up.subfolder ? `${up.subfolder}/${up.name}` : up.name;
  const { id, entry } = await runGraph(c, transcribeGraph(input), (e) => textOf(e) !== undefined);
  const abc = textOf(entry);
  if (abc === undefined || abc.trim() === "") throw unavailable(`ComfyUI finished SheetSage2 prompt ${id} but its PreviewAny node ${PREVIEW} returned no text`);
  return { abc, promptId: id };
}

/** One take: its flac's bytes. */
export async function renderTake(t: Take, deps: Yue2Deps = {}): Promise<{ readonly flac: Uint8Array; readonly promptId: string }> {
  const c = ctxOf(deps);
  const { id, entry } = await runGraph(c, renderGraph(t), (e) => audioOf(e) !== undefined);
  const a = audioOf(entry);
  if (a === undefined) throw unavailable(`ComfyUI finished YuE2 prompt ${id} but its SaveAudio node ${SAVE} wrote no file`);
  const q = new URLSearchParams({ filename: a.filename, subfolder: a.subfolder, type: a.type });
  const r = await call(c, `/view?${q.toString()}`, { method: "GET", ms: 120_000 });
  if (!r.ok) throw unavailable(`ComfyUI /view answered ${r.status} for ${a.subfolder}/${a.filename}: ${short(await r.text())}`);
  const flac = new Uint8Array(await r.arrayBuffer());
  if (flac.byteLength === 0 || flac.byteLength > MAX_AUDIO_BYTES) throw unavailable(`ComfyUI's ${a.filename} is ${flac.byteLength} bytes; a take is 1 byte to ${MAX_AUDIO_BYTES / 1024 ** 2} MB`);
  if (String.fromCharCode(...flac.subarray(0, 4)) !== "fLaC") throw unavailable(`ComfyUI's ${a.filename} is not a FLAC file`);
  return { flac, promptId: id };
}
