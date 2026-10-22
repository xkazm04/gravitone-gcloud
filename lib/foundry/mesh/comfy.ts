// THE COMFYUI CLIENT FOR TRELLIS.2 (spark game-3d-assets WP2) - one image-to-3D run on the box's
// shared ComfyUI (COMFY_URL, default http://127.0.0.1:8188), as lynx-bench's run-prompt.mjs drove it
// in rounds 2-4: upload the concept, queue the API workflow with the variant's decimate target and
// seed, poll /history until the prompt ends, fetch the Save3DAdvanced glb through /view.
//
// THE WORKFLOW is pipeline/mesh/trellis-api.json, a copy of lynx-bench media/3d-trellis-api.json
// (2026-10-21). The nodes this client sets, refused by name when the file lacks them:
//   122 LoadImage          the uploaded concept
//   186 DecimateMesh       target_face_count - decimate BEFORE the texture bake (147), so the
//                          texture is baked onto the budget mesh it ships on
//   3, 12, 18, 23 KSampler the seed, when the variant names one (else the file's proven seeds)
//   322 Save3DAdvanced     filename_prefix `gravitone/<asset>_<variant>`, the glb this fetches
//
// A SHARED SERVICE, TREATED AS ONE (ASSET-PIPELINE.md, docs/resources.md): this client never POSTs
// /free, never interrupts, never restarts. Admission already waited for ComfyUI's queue to be empty
// before the job started (@gt/domain/resource `admit`, engine "comfy"); another executor's prompt
// queued after ours only makes ours wait longer, which the timeout bounds.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const COMFY_DEFAULT = "http://127.0.0.1:8188";
export const comfyUrl = (env: NodeJS.ProcessEnv = process.env): string => (env["COMFY_URL"]?.trim() || COMFY_DEFAULT).replace(/\/+$/, "");
export const TRELLIS_WORKFLOW = path.join("pipeline", "mesh", "trellis-api.json");

type Node = { inputs: Record<string, unknown>; class_type: string };
export type Workflow = Record<string, Node>;

const NODES = { image: "122", decimate: "186", save: "322", seeds: ["3", "12", "18", "23"] } as const;

export type ComfyPorts = {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
};
export const nodeComfyPorts: ComfyPorts = { fetch: (i, o) => fetch(i, o), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() };

export type TrellisAsk = {
  readonly concept: Uint8Array;
  /** The name the concept is uploaded under (ComfyUI's input folder). */
  readonly conceptName: string;
  readonly targetFaces: number;
  readonly seed?: number;
  /** Save3DAdvanced's filename_prefix. */
  readonly prefix: string;
};

/** `unreachable`: the service did not answer (a vendor failure, retried); `failed`: it answered no. */
export type TrellisRun =
  | { readonly ok: true; readonly glb: Uint8Array; readonly promptId: string; readonly file: string; readonly seconds: number }
  | { readonly ok: false; readonly kind: "unreachable" | "failed"; readonly message: string };

export async function readWorkflow(root: string = process.cwd()): Promise<Workflow> {
  return JSON.parse(await readFile(path.join(root, TRELLIS_WORKFLOW), "utf8")) as Workflow;
}

/** The workflow with the variant's concept, budget, seed and prefix set; a missing node is a sentence. */
export function trellisPrompt(base: Workflow, a: { readonly image: string; readonly targetFaces: number; readonly seed?: number; readonly prefix: string }): Workflow | string {
  const p = structuredClone(base);
  const need = (id: string, cls: string): Node | string => {
    const n = p[id];
    return n?.class_type === cls ? n : `the TRELLIS workflow has no node ${id} ${cls} (found ${n?.class_type ?? "nothing"})`;
  };
  const img = need(NODES.image, "LoadImage");
  const dec = need(NODES.decimate, "DecimateMesh");
  const save = need(NODES.save, "Save3DAdvanced");
  for (const x of [img, dec, save]) if (typeof x === "string") return x;
  (img as Node).inputs["image"] = a.image;
  (dec as Node).inputs["target_face_count"] = a.targetFaces;
  (save as Node).inputs["filename_prefix"] = a.prefix;
  if (a.seed !== undefined) {
    for (const id of NODES.seeds) {
      const s = need(id, "KSampler");
      if (typeof s === "string") return s;
      s.inputs["seed"] = a.seed;
    }
  }
  return p;
}

const said = async (r: Response): Promise<string> => {
  const t = await r.text().catch(() => "");
  return `${r.status} ${r.statusText}${t === "" ? "" : `: ${t.slice(0, 600)}`}`;
};

/** ComfyUI answers /system_stats: the mesh producer's health for a live job. */
export async function comfyHealth(base: string = comfyUrl(), ports: ComfyPorts = nodeComfyPorts): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const r = await ports.fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(3_000) });
    return r.ok ? { ok: true } : { ok: false, reason: `ComfyUI at ${base} answered /system_stats ${r.status}` };
  } catch (e) {
    return { ok: false, reason: `ComfyUI at ${base} does not answer: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Prompts running or pending on ComfyUI's queue (GET /queue, read-only); undefined when it does not answer. */
export async function comfyQueued(base: string = comfyUrl(), ports: ComfyPorts = nodeComfyPorts): Promise<number | undefined> {
  try {
    const r = await ports.fetch(`${base}/queue`, { signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return undefined;
    const q = (await r.json()) as { queue_running?: unknown; queue_pending?: unknown };
    return (Array.isArray(q.queue_running) ? q.queue_running.length : 0) + (Array.isArray(q.queue_pending) ? q.queue_pending.length : 0);
  } catch {
    return undefined;
  }
}

type HistoryFile = { readonly filename?: string; readonly subfolder?: string; readonly type?: string };
type HistoryEntry = {
  readonly outputs?: Record<string, Record<string, unknown>>;
  readonly status?: { readonly status_str?: string; readonly completed?: boolean; readonly messages?: readonly (readonly [string, Record<string, unknown>])[] };
};

/** The glb a finished prompt saved: node 322's output first, then any glb under our prefix. */
export function glbOf(entry: HistoryEntry, prefix: string): HistoryFile | undefined {
  const files = (id?: string): HistoryFile[] =>
    Object.entries(entry.outputs ?? {})
      .filter(([k]) => id === undefined || k === id)
      .flatMap(([, o]) => Object.values(o).flatMap((v) => (Array.isArray(v) ? (v as HistoryFile[]) : [])))
      .filter((f) => typeof f?.filename === "string" && f.filename.toLowerCase().endsWith(".glb"));
  const base = prefix.split("/").pop() ?? prefix;
  return files(NODES.save)[0] ?? files().find((f) => f.filename?.startsWith(base) === true);
}

function errorOf(entry: HistoryEntry): string {
  const m = entry.status?.messages?.find(([k]) => k === "execution_error")?.[1];
  if (m === undefined) return `the prompt ended ${entry.status?.status_str ?? "without a status"}`;
  return `${String(m["node_type"] ?? "a node")} (node ${String(m["node_id"] ?? "?")}): ${String(m["exception_message"] ?? "failed").trim()}`;
}

/**
 * One TRELLIS run, start to glb. Bounded by `timeoutMs` (TRELLIS took 170-405 s in the rounds);
 * a run that outlives it is `failed` with the prompt id, and its prompt is left on ComfyUI's queue -
 * interrupting a shared queue could stop someone else's work.
 */
export async function runTrellis(base: string, workflow: Workflow, ask: TrellisAsk, ports: ComfyPorts = nodeComfyPorts, o: { readonly timeoutMs?: number; readonly pollMs?: number } = {}): Promise<TrellisRun> {
  const t0 = ports.now();
  const timeoutMs = o.timeoutMs ?? 20 * 60_000;
  const pollMs = o.pollMs ?? 2_000;
  const unreachable = (e: unknown): TrellisRun => ({ ok: false, kind: "unreachable", message: `ComfyUI at ${base} did not answer: ${e instanceof Error ? e.message : String(e)}` });
  try {
    const form = new FormData();
    form.append("image", new Blob([Buffer.from(ask.concept)], { type: "image/png" }), ask.conceptName);
    form.append("type", "input");
    form.append("overwrite", "true");
    const up = await ports.fetch(`${base}/upload/image`, { method: "POST", body: form });
    if (!up.ok) return { ok: false, kind: "failed", message: `ComfyUI refused the concept upload: ${await said(up)}` };
    const uploaded = (await up.json()) as { name?: string; subfolder?: string };
    if (typeof uploaded.name !== "string") return { ok: false, kind: "failed", message: "ComfyUI's upload answer named no file" };
    const image = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;

    const prompt = trellisPrompt(workflow, { image, targetFaces: ask.targetFaces, prefix: ask.prefix, ...(ask.seed === undefined ? {} : { seed: ask.seed }) });
    if (typeof prompt === "string") return { ok: false, kind: "failed", message: prompt };
    const q = await ports.fetch(`${base}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, client_id: `gravitone-mesh-${ask.prefix.replace(/[^a-z0-9]+/gi, "-")}` }) });
    const queued = (await q.json().catch(() => ({}))) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
    if (!q.ok || typeof queued.prompt_id !== "string") return { ok: false, kind: "failed", message: `ComfyUI refused the TRELLIS prompt: ${JSON.stringify(queued.error ?? queued.node_errors ?? queued).slice(0, 800)}` };
    const id = queued.prompt_id;

    for (;;) {
      const h = await ports.fetch(`${base}/history/${encodeURIComponent(id)}`);
      if (h.ok) {
        const entry = ((await h.json()) as Record<string, HistoryEntry>)[id];
        if (entry !== undefined && (entry.status?.completed === true || entry.status?.status_str === "error")) {
          if (entry.status?.status_str === "error" || entry.status?.completed !== true) return { ok: false, kind: "failed", message: `TRELLIS prompt ${id} failed: ${errorOf(entry)}` };
          const f = glbOf(entry, ask.prefix);
          if (f?.filename === undefined) return { ok: false, kind: "failed", message: `TRELLIS prompt ${id} finished with no glb among its outputs` };
          const qs = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder ?? "", type: f.type ?? "output" });
          const v = await ports.fetch(`${base}/view?${qs.toString()}`);
          if (!v.ok) return { ok: false, kind: "failed", message: `ComfyUI would not serve ${f.filename}: ${await said(v)}` };
          const glb = new Uint8Array(await v.arrayBuffer());
          if (glb.byteLength < 12 || new TextDecoder().decode(glb.subarray(0, 4)) !== "glTF") return { ok: false, kind: "failed", message: `${f.filename} is not a glb (${glb.byteLength} bytes)` };
          return { ok: true, glb, promptId: id, file: `${f.subfolder ? `${f.subfolder}/` : ""}${f.filename}`, seconds: Math.round((ports.now() - t0) / 100) / 10 };
        }
      }
      if (ports.now() - t0 > timeoutMs) return { ok: false, kind: "failed", message: `TRELLIS prompt ${id} did not finish in ${Math.round(timeoutMs / 1000)} s; it is left on ComfyUI's queue` };
      await ports.sleep(pollMs);
    }
  } catch (e) {
    return unreachable(e);
  }
}
