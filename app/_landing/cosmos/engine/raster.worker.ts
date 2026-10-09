// THE RASTER WORKER: the paper is cut here, off the main thread.
//
// It runs the same job runner as the main-thread fallback (./rasterJobs) onto
// OffscreenCanvas and hands each layer back as an ImageBitmap (transferred, not
// copied). On start it reports whether it can actually do that (a 2D context,
// Path2D, DOMMatrix and a pattern from an OffscreenCanvas) and, for the tier
// probe, the WebGL renderer string a throwaway context names - asked here so the
// probe costs the main thread nothing. It also encodes the grain tile the
// stylesheet repeats, so that PNG encode is not on the main thread either.
//
// Typed against the DOM lib (this repo compiles no webworker lib): the few
// worker-scope members used are declared below.

import { paintLayer, sharedRng, type Job } from "./rasterJobs";
import { GRAIN_N, paintGrain, setGrainSource, type Ctx2D } from "./paper";

interface Scope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}
const scope = self as unknown as Scope;

function probeRenderer(): string | null {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const ren = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ren;
  } catch {
    return null;
  }
}

async function hello(): Promise<void> {
  let ok = false,
    grain: Blob | null = null;
  try {
    // a CPU canvas, like every layer here: a pattern from a GPU-backed tile into
    // a CPU layer is a readback on the GPU process's main thread, every time
    const g = new OffscreenCanvas(GRAIN_N, GRAIN_N),
      gx = g.getContext("2d", { willReadFrequently: true });
    if (gx && typeof Path2D === "function" && typeof DOMMatrix === "function") {
      paintGrain(gx, GRAIN_N);
      setGrainSource(g);
      ok = !!gx.createPattern(g, "repeat");
      grain = await g.convertToBlob({ type: "image/png" });
    }
  } catch {
    ok = false;
  }
  scope.postMessage({ t: "hello", ok, ren: probeRenderer(), grain });
}

scope.onmessage = async (e: MessageEvent) => {
  const { id, job } = e.data as { id: number; job: Job };
  try {
    const shared = sharedRng(job),
      ret: number[] = [],
      out: ImageBitmap[] = [],
      blobs: Promise<Blob>[] = [];
    for (let i = 0; i < job.layers.length; i++) {
      const cv = paintLayer(
        job,
        i,
        (w, h) => {
          const surface = new OffscreenCanvas(w, h);
          // a CPU canvas on purpose: an accelerated one would send every
          // shadow-blurred sheet to the GPU process's main thread, the thread
          // that also draws the page's frames (measured: 200 ms frames while a
          // world was painting). Painted here, a layer costs that thread only
          // its upload.
          return { surface, ctx: surface.getContext("2d", { willReadFrequently: true }) as unknown as Ctx2D };
        },
        shared,
        ret,
      );
      if (job.png) blobs.push(cv.convertToBlob({ type: "image/png" }));
      else if (job.parts) {
        const bmp = cv.transferToImageBitmap();
        scope.postMessage({ t: "part", id, i, bmp }, [bmp]);
      } else out.push(cv.transferToImageBitmap());
    }
    if (job.png) scope.postMessage({ t: "done", id, out, blobs: await Promise.all(blobs), ret });
    else scope.postMessage({ t: "done", id, out, ret }, out);
  } catch (err) {
    scope.postMessage({ t: "fail", id, err: String(err) });
  }
};

void hello();
