// COMFYUI, ASKED TO LET GO (spark scout-vision S6, WP-B) - the one write admission makes to the box.
//
// ComfyUI keeps every model it loaded resident until something asks it not to: on the night of
// 2026-10-25/26 it held Flux and LTX together, commit charge headed for ~178 GB against a ~114 GB
// mark, and gpu.local's head waited five hours for memory that nothing was going to give back.
// `POST /free {"unload_models": true, "free_memory": true}` is ComfyUI's own door for it: the models
// leave memory and the next prompt loads what IT needs. The kernel gate decides WHEN (a gpu.local
// head held on commit charge past COMFY_UNLOAD_AFTER_MS, nothing running there, once per episode -
// packages/kernel/src/resources/starve.ts); this only says HOW, and is the default the worker binds
// (lib/resources/probe.ts machineAdmission). The probe beside it stays read-only.
//
// A ComfyUI another executor drives is the same process (ASSET-PIPELINE.md): an unload while ITS
// prompt runs costs that prompt a reload. The gate's guard - no gpu.local job running - cannot see a
// foreign user; ComfyUI's own queue is in the probe's reading, and a non-empty queue refuses here.

const FREE_TIMEOUT_MS = 10_000;

export type ComfyFreePorts = {
  /** POST a JSON body; the HTTP status, or undefined when nothing answered. */
  postJson(url: string, body: unknown, timeoutMs: number): Promise<number | undefined>;
  /** GET a URL as JSON; undefined on any failure. */
  getJson(url: string, timeoutMs: number): Promise<unknown>;
};

export const fetchPorts: ComfyFreePorts = {
  postJson: async (url, body, timeoutMs) => {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      return r.status;
    } catch {
      return undefined;
    }
  },
  getJson: async (url, timeoutMs) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return r.ok ? await r.json() : undefined;
    } catch {
      return undefined;
    }
  },
};

/** The ComfyUI base the rest of the box reads (`COMFY_URL`, default 127.0.0.1:8188). */
export const comfyBaseOf = (env: Readonly<Record<string, string | undefined>>): string => (env["COMFY_URL"]?.trim() || "http://127.0.0.1:8188").replace(/\/+$/, "");

/**
 * The unload, bound to a ComfyUI. Throws when it did not happen - ComfyUI down, a prompt in its
 * queue (somebody's work holds those models), or a status that is not 2xx - so the gate appends
 * nothing it cannot vouch for.
 */
export function comfyFree(env: Readonly<Record<string, string | undefined>>, ports: ComfyFreePorts = fetchPorts): () => Promise<void> {
  const base = comfyBaseOf(env);
  return async () => {
    const q = (await ports.getJson(`${base}/queue`, FREE_TIMEOUT_MS)) as { queue_running?: unknown; queue_pending?: unknown } | undefined;
    if (q === undefined || !Array.isArray(q.queue_running) || !Array.isArray(q.queue_pending)) throw new Error(`ComfyUI at ${base} did not answer /queue`);
    const queued = q.queue_running.length + q.queue_pending.length;
    if (queued > 0) throw new Error(`ComfyUI at ${base} has ${queued} prompt(s) queued; its models are in use`);
    const status = await ports.postJson(`${base}/free`, { unload_models: true, free_memory: true }, FREE_TIMEOUT_MS);
    if (status === undefined || status < 200 || status >= 300) throw new Error(`ComfyUI at ${base} answered /free with ${status ?? "nothing"}`);
  };
}
