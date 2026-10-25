// RASTER SERVICE: where the paper gets cut, and in what order.
//
// Two paths, one job format (./rasterJobs):
//   worker - ./raster.worker.ts paints on OffscreenCanvas and transfers
//            ImageBitmaps back; the main thread only places them.
//   main   - the fallback when the worker cannot start or says it cannot paint
//            (no OffscreenCanvas 2D, Path2D or patterns there): the same job
//            runner on canvas elements, yielding to the event loop between
//            layers (scheduler.yield when the browser has it).
// `?raster=main` forces the fallback, so its cost can be measured on its own.
//
// Jobs queue by priority (lower first, FIFO among equals) with at most two in
// flight, so a stage picture asked for later still overtakes a carousel's far
// cards; a queued job can be dropped by its tag when the view it was for is
// rebuilt.

import { GRAIN_N, paintGrain, setGrainSource } from "./paper";
import { paintLayer, rendererOf, sharedRng, type Job } from "./rasterJobs";

export type Surface = ImageBitmap | HTMLCanvasElement;
export interface Painted {
  out: Surface[];
  /** a png job's layers, as object URLs (kept for the page's life: see artUrl) */
  urls: string[];
  ret: number[];
}

/** how a job ended: painted, let go (dropped by its tag, or lost with a worker that died, or the
 *  raster destroyed: asking again may paint it), or it threw (asking again throws again) */
export type Outcome = Painted | "dropped" | "failed";

interface Pending {
  id: number;
  job: Job;
  prio: number;
  tag: string;
  res: (p: Outcome) => void;
  /** a `parts` job's layers, each as it lands (the final Painted then has none) */
  part?: (i: number, s: Surface) => void;
}

/** gives the main thread back to the event loop (input, frames) before going on */
export const yieldMain = (): Promise<void> => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s && typeof s.yield === "function") return s.yield();
  return new Promise((r) => setTimeout(r, 0));
};

/** the grain tile as a CSS url, made once per page (it is the same pixels every time) */
let grainUrl = "";
let grainCanvas: HTMLCanvasElement | null = null;
function mainGrain(): string {
  if (!grainCanvas) {
    grainCanvas = document.createElement("canvas");
    grainCanvas.width = grainCanvas.height = GRAIN_N;
    paintGrain(grainCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D, GRAIN_N);
  }
  setGrainSource(grainCanvas);
  if (!grainUrl) grainUrl = "url(" + grainCanvas.toDataURL("image/png") + ")";
  return grainUrl;
}

export interface Hello {
  /** the WebGL renderer a throwaway context named, or null (no WebGL) */
  ren: string | null;
  /** the grain tile url for the stylesheet */
  grain: string;
}

export class Raster {
  mode: "worker" | "main" = "main";
  private worker: Worker | null = null;
  private q: Pending[] = [];
  private live = new Map<number, Pending>();
  private seq = 0;
  private pumping = false;
  private dead = false;
  /** the worker is still saying hello: a job asked for now waits for it, and is
   *  not painted here (`mode` reads "main" until the worker answers) */
  private starting: boolean;
  private abortStart: (() => void) | null = null;
  readonly ready: Promise<Hello>;

  constructor(forceMain: boolean) {
    this.starting = !forceMain;
    this.ready = forceMain ? Promise.resolve(this.startMain()) : this.startWorker();
  }

  private startMain(): Hello {
    this.mode = "main";
    this.starting = false;
    return { ren: probeRendererMain(), grain: mainGrain() };
  }

  private startWorker(): Promise<Hello> {
    let w: Worker;
    try {
      if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function") return Promise.resolve(this.startMain());
      w = new Worker(new URL("./raster.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return Promise.resolve(this.startMain());
    }
    return new Promise<Hello>((resolve) => {
      let settled = false;
      const fallback = (why?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        this.abortStart = null;
        w.terminate();
        this.worker = null;
        // destroyed while the worker was starting: no fallback for a page that is gone
        if (this.dead) return resolve({ ren: null, grain: "" });
        console.warn("[cosmos raster] painting on the main thread:", why);
        resolve(this.startMain());
        this.pump();
      };
      // until hello the worker lives only in this closure; destroy() ends it through here
      this.abortStart = () => fallback();
      const t = setTimeout(() => fallback("the worker did not answer in 4 s"), 4000);
      w.onerror = () => {
        clearTimeout(t);
        if (!settled) return fallback("the worker failed to start");
        // the worker died after it started: what was painting there is lost,
        // what is still queued paints on the main thread
        w.terminate();
        this.worker = null;
        this.mode = "main";
        console.warn("[cosmos raster] the worker died; what was painting there is lost");
        mainGrain();
        this.failAll();
        this.pump();
      };
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { t: string; ok?: boolean; ren?: string | null; grain?: Blob | null; id?: number; i?: number; bmp?: ImageBitmap; out?: ImageBitmap[]; blobs?: Blob[]; ret?: number[]; err?: string };
        if (m.t === "hello") {
          clearTimeout(t);
          if (!m.ok || this.dead) return fallback("the worker cannot paint here (OffscreenCanvas 2D, Path2D, DOMMatrix or a pattern)");
          settled = true;
          this.abortStart = null;
          this.mode = "worker";
          this.worker = w;
          this.starting = false;
          resolve({ ren: m.ren ?? null, grain: m.grain ? blobGrain(m.grain) : mainGrain() });
          this.pump();
          return;
        }
        const p = this.live.get(m.id ?? -1);
        if (!p) {
          m.out?.forEach((b) => b.close());
          m.bmp?.close();
          return;
        }
        if (m.t === "part" && m.bmp) {
          if (p.part) p.part(m.i ?? 0, m.bmp);
          else m.bmp.close();
          return;
        }
        this.live.delete(p.id);
        if (m.t === "done" && m.out) {
          p.res({ out: m.out, urls: (m.blobs || []).map((b) => URL.createObjectURL(b)), ret: m.ret || [] });
        } else {
          if (m.t === "fail") console.warn("[cosmos raster] the worker could not paint a job:", m.err);
          p.res(m.t === "fail" ? "failed" : "dropped");
        }
        this.pump();
      };
    });
  }

  /** queues a job; resolves with its surfaces, or null when it was dropped or failed
   *  (`paint` tells those two apart, for a caller that would otherwise ask again and again) */
  run(job: Job, prio = 0, tag = "", part?: (i: number, s: Surface) => void): Promise<Painted | null> {
    return this.paint(job, prio, tag, part).then((r) => (typeof r === "string" ? null : r));
  }

  paint(job: Job, prio = 0, tag = "", part?: (i: number, s: Surface) => void): Promise<Outcome> {
    if (this.dead) return Promise.resolve("dropped");
    return new Promise((res) => {
      const p: Pending = { id: ++this.seq, job, prio, tag, res, part };
      let i = this.q.length;
      while (i > 0 && this.q[i - 1].prio > prio) i--;
      this.q.splice(i, 0, p);
      this.pump();
    });
  }

  /** drops every queued job with this tag (jobs already painting finish, and their caller ignores them) */
  drop(tag: string): void {
    this.q = this.q.filter((p) => {
      if (p.tag !== tag) return true;
      p.res("dropped");
      return false;
    });
  }

  private pump(): void {
    if (this.dead || this.starting) return;
    if (this.worker) {
      while (this.live.size < 2 && this.q.length) {
        const p = this.q.shift()!;
        this.live.set(p.id, p);
        this.worker.postMessage({ id: p.id, job: p.job });
      }
      return;
    }
    if (this.mode !== "main" || this.pumping) return;
    this.pumping = true;
    void this.drainMain();
  }

  private async drainMain(): Promise<void> {
    while (this.q.length && !this.dead) {
      const p = this.q.shift()!;
      try {
        const shared = sharedRng(p.job),
          ret: number[] = [],
          out: HTMLCanvasElement[] = [];
        for (let i = 0; i < p.job.layers.length; i++) {
          await yieldMain();
          if (this.dead) break;
          if (p.part && i) p.part(i - 1, out[i - 1]);
          out.push(
            paintLayer(
              p.job,
              i,
              (w, h) => {
                const cv = document.createElement("canvas");
                cv.width = w;
                cv.height = h;
                // CPU canvases, as in the worker (see raster.worker.ts)
                return { surface: cv, ctx: cv.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D };
              },
              shared,
              ret,
            ),
          );
        }
        if (p.part && out.length && !this.dead) {
          p.part(out.length - 1, out[out.length - 1]);
          out.length = 0;
        }
        if (this.dead) p.res("dropped");
        else if (p.job.png) {
          const blobs = await Promise.all(out.map((c) => new Promise<Blob | null>((r) => c.toBlob(r, "image/png"))));
          p.res({ out: [], urls: blobs.map((b) => (b ? URL.createObjectURL(b) : "")), ret });
        } else p.res({ out, urls: [], ret });
      } catch (err) {
        console.warn("[cosmos raster] the main thread could not paint a job:", err);
        p.res("failed");
      }
    }
    this.pumping = false;
  }

  private failAll(): void {
    for (const p of this.live.values()) p.res("dropped");
    this.live.clear();
  }

  destroy(): void {
    this.dead = true;
    this.abortStart?.();
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.q) p.res("dropped");
    this.q = [];
    this.failAll();
  }
}

function blobGrain(b: Blob): string {
  if (!grainUrl) grainUrl = "url(" + URL.createObjectURL(b) + ")";
  return grainUrl;
}

/** the main thread's renderer probe, for when no worker can ask */
function probeRendererMain(): string | null {
  try {
    return rendererOf(document.createElement("canvas").getContext("webgl"));
  } catch {
    return null;
  }
}

/* ---------- placing surfaces ---------- */

/** a canvas element showing `s` at css w x h; a bitmap is handed over (bitmaprenderer), not copied */
export function surfaceCanvas(s: Surface, w: number, h: number): HTMLCanvasElement {
  let cv: HTMLCanvasElement;
  if (s instanceof HTMLCanvasElement) cv = s;
  else {
    cv = document.createElement("canvas");
    cv.width = s.width;
    cv.height = s.height;
    const br = cv.getContext("bitmaprenderer");
    if (br) br.transferFromImageBitmap(s);
    else {
      cv.getContext("2d")?.drawImage(s, 0, 0);
      s.close();
    }
  }
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  return cv;
}

/** copies a (kept) surface into an existing canvas element */
export function drawInto(cv: HTMLCanvasElement, s: Surface): void {
  cv.width = s.width;
  cv.height = s.height;
  cv.getContext("2d")?.drawImage(s, 0, 0);
}

export const release = (s: Surface): void => {
  if (!(s instanceof HTMLCanvasElement)) s.close();
};

/* ---------- the session's small pictures, as files ----------
 * A medallion or a ream is the same pixels every time it is asked for at the
 * same size, so its PNG's object URL is kept for the page's life (a few hundred
 * KB in all) and every later mount and resize reuses it. */
const URLS = new Map<string, string>();
export const urlGet = (key: string): string | undefined => URLS.get(key);
export const urlPut = (key: string, url: string): void => {
  const old = URLS.get(key);
  if (old && old !== url) URL.revokeObjectURL(old);
  URLS.set(key, url);
};

/* ---------- the session's picture cache ----------
 * Medallions and dioramas are the same pixels every time they are asked for at
 * the same size, so they are kept for the page's life (across resizes and
 * remounts), keyed by what they depend on, within a pixel budget; the least
 * recently used go first. Each use copies them into its own canvas, so
 * evicting one never blanks a canvas on screen. */
const ART = new Map<string, Surface>();
let artPx = 0;
const ART_BUDGET = 12_000_000; // pixels, ~48 MB

export function artGet(key: string): Surface | undefined {
  const s = ART.get(key);
  if (s) {
    ART.delete(key);
    ART.set(key, s);
  }
  return s;
}
export function artPut(key: string, s: Surface): void {
  const old = ART.get(key);
  if (old) {
    artPx -= old.width * old.height;
    release(old);
    ART.delete(key);
  }
  ART.set(key, s);
  artPx += s.width * s.height;
  for (const [k, v] of ART) {
    if (artPx <= ART_BUDGET || k === key) break;
    ART.delete(k);
    artPx -= v.width * v.height;
    release(v);
  }
}
