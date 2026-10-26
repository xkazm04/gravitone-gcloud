// THE LOCAL FLUX 2 CLIENT (lib/imaging/local/flux2.ts, spark scout-storyboards) over a fake ComfyUI: the graph it
// posts (consistency.py `flux_workflow`, text-to-image only, 20 steps, the aspect's size, the seed set and
// returned), the PNG it fetches, ComfyUI's own sentences kept verbatim, ours alone withdrawn at the cap, never a
// POST /free on the shared server - and the model check the doctor reads.

import { describe, expect, it } from "vitest";

import { drawFlux, FLUX_FILES, fluxGraph, missingFluxModels, type FluxFetch } from "../../lib/imaging/local/flux2.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

function comfy(o: { refuse?: string; error?: string; never?: boolean; image?: Uint8Array<ArrayBuffer> } = {}): { f: FluxFetch; asked: string[]; posted: Graph[] } {
  const asked: string[] = [];
  const posted: Graph[] = [];
  const f: FluxFetch = async (url, init) => {
    const u = new URL(url);
    asked.push(`${init?.method ?? "GET"} ${u.pathname}`);
    if (u.pathname === "/system_stats") return Response.json({ system: { comfyui_version: "0.42.1" } });
    if (u.pathname === "/prompt") {
      if (o.refuse !== undefined) return new Response(o.refuse, { status: 400 });
      posted.push((JSON.parse(String(init?.body)) as { prompt: Graph }).prompt);
      return Response.json({ prompt_id: "p-1" });
    }
    if (u.pathname === "/history/p-1") {
      if (o.never === true) return Response.json({});
      if (o.error !== undefined) return Response.json({ "p-1": { status: { status_str: "error", messages: [["execution_error", { node_type: "UNETLoader", node_id: "1", exception_message: o.error }]] } } });
      return Response.json({ "p-1": { status: { status_str: "success", completed: true }, outputs: { "13": { images: [{ filename: "flux2-5_00001_.png", subfolder: "gravitone", type: "output" }] } } } });
    }
    if (u.pathname === "/queue" && init?.method !== "POST") return Response.json({ queue_running: [], queue_pending: [[0, "p-1"]] });
    if (u.pathname === "/queue") return Response.json({});
    if (u.pathname === "/view") return new Response(o.image ?? PNG);
    return new Response("no", { status: 404 });
  };
  return { f, asked, posted };
}

describe("drawFlux", () => {
  it("posts the text-to-image graph at the aspect's size with the seed, and returns the PNG and the seed", async () => {
    const c = comfy();
    const r = await drawFlux({ prompt: " a lantern on a stairwell ", aspect: "9:16", seed: 5 }, { fetch: c.f, base: "http://comfy.test" });
    expect(r).toMatchObject({ png: PNG, seed: 5, model: "flux2-dev-fp8", promptId: "p-1", width: 720, height: 1280 });
    const g = c.posted[0] ?? {};
    expect(g["1"]?.inputs["unet_name"]).toBe("flux2_dev_fp8mixed.safetensors");
    expect(g["2"]?.inputs).toMatchObject({ clip_name: "mistral_3_small_flux2_fp8.safetensors", type: "flux2" });
    expect(g["3"]?.inputs["vae_name"]).toBe("flux2-vae.safetensors");
    expect(g["4"]?.inputs["text"]).toBe("a lantern on a stairwell");
    expect(g["6"]?.inputs).toMatchObject({ width: 720, height: 1280, batch_size: 1 });
    expect(g["7"]?.inputs).toMatchObject({ steps: 20, width: 720, height: 1280 });
    expect(g["9"]?.inputs["noise_seed"]).toBe(5);
    expect(g["5"]?.inputs).toMatchObject({ conditioning: ["4", 0], guidance: 4 });
    // Words only: no picture is ever loaded or encoded as a reference.
    expect(Object.values(g).map((n) => n.class_type)).not.toEqual(expect.arrayContaining(["LoadImage"]));
    expect(Object.values(g).some((n) => n.class_type === "ReferenceLatent" || n.class_type === "VAEEncode")).toBe(false);
    expect(c.asked).toEqual(["GET /system_stats", "POST /prompt", "GET /history/p-1", "GET /view"]);
    expect(c.asked.some((a) => a.includes("/free"))).toBe(false);
  });

  it("16:9 is 1280x720; with no seed it draws one and says which", async () => {
    const c = comfy();
    const r = await drawFlux({ prompt: "p" }, { fetch: c.f, base: "http://comfy.test", seed: () => 4242 });
    expect([r.width, r.height, r.seed]).toEqual([1280, 720, 4242]);
    expect(c.posted[0]?.["9"]?.inputs["noise_seed"]).toBe(4242);
    expect(fluxGraph({ prompt: "p", seed: 1, width: 1280, height: 720, prefix: "x" })["13"]?.class_type).toBe("SaveImage");
  });

  it("keeps ComfyUI's sentences verbatim: unreachable, a refused graph, a node's exception, a non-PNG", async () => {
    const down: FluxFetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(drawFlux({ prompt: "p" }, { fetch: down, base: "http://comfy.test" })).rejects.toThrow("ComfyUI is not reachable at http://comfy.test, so no Flux frame was drawn (ComfyUI at http://comfy.test did not answer /system_stats: fetch failed)");
    const refused = JSON.stringify({ error: { message: "Prompt outputs failed validation" }, node_errors: { "1": { class_type: "UNETLoader", errors: [{ message: "Value not in list", details: "unet_name: 'flux2_dev_fp8mixed.safetensors' not in []" }] } } });
    await expect(drawFlux({ prompt: "p" }, { fetch: comfy({ refuse: refused }).f, base: "http://comfy.test" })).rejects.toThrow("ComfyUI refused the Flux graph (400): Prompt outputs failed validation - UNETLoader 1: Value not in list (unet_name: 'flux2_dev_fp8mixed.safetensors' not in [])");
    await expect(drawFlux({ prompt: "p" }, { fetch: comfy({ error: "CUDA out of memory" }).f, base: "http://comfy.test" })).rejects.toThrow("ComfyUI UNETLoader (node 1) failed: CUDA out of memory");
    await expect(drawFlux({ prompt: "p" }, { fetch: comfy({ image: new Uint8Array([1, 2, 3]) }).f, base: "http://comfy.test" })).rejects.toThrow("is not a PNG");
  });

  it("at the cap withdraws ours from the queue, and refuses a bad request before anything is sent", async () => {
    const c = comfy({ never: true });
    let t = 0;
    await expect(drawFlux({ prompt: "p" }, { fetch: c.f, base: "http://comfy.test", now: () => t, sleep: async (ms) => void (t += ms), capMs: 10_000, pollMs: 4_000 })).rejects.toThrow("ComfyUI did not finish Flux prompt p-1 within 0 min (waited 12 s); it was still queued behind other prompts, and was withdrawn");
    expect(c.asked).toContain("POST /queue");
    expect(c.asked.some((a) => a.includes("/free") || a.includes("/interrupt"))).toBe(false);
    const quiet = comfy();
    await expect(drawFlux({ prompt: "  " }, { fetch: quiet.f })).rejects.toThrow("a Flux frame needs a prompt");
    await expect(drawFlux({ prompt: "p", seed: -1 }, { fetch: quiet.f })).rejects.toThrow(/a Flux seed is a whole number/);
    expect(quiet.asked).toEqual([]);
  });
});

describe("missingFluxModels", () => {
  const info = (files: readonly string[]): FluxFetch => async (url) => {
    const cls = decodeURIComponent(new URL(url).pathname.replace("/object_info/", ""));
    const input = FLUX_FILES.find((f) => f.cls === cls)?.input ?? "x";
    // One loader in each combo spelling.
    const spec = cls === "VAELoader" ? ["COMBO", { options: files }] : [files];
    return Response.json({ [cls]: { input: { required: { [input]: spec } } } });
  };

  it("names the files ComfyUI does not list, in either combo spelling", async () => {
    expect(await missingFluxModels({ fetch: info(FLUX_FILES.map((f) => f.file)), base: "http://comfy.test" })).toEqual({ present: 3, missing: [] });
    expect(await missingFluxModels({ fetch: info(["flux2_dev_fp8mixed.safetensors"]), base: "http://comfy.test" })).toEqual({ present: 1, missing: ["mistral_3_small_flux2_fp8.safetensors", "flux2-vae.safetensors"] });
  });
});
