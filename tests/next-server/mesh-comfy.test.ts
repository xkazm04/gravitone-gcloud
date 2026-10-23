// THE COMFYUI CLIENT AGAINST A FAKE COMFYUI (spark game-3d-assets WP2; lib/foundry/mesh/comfy.ts):
// a node:http server on a free port answering /system_stats, /upload/image, /prompt, /history/<id>
// and /view the way ComfyUI 0.42 does, recording every request. The real ComfyUI on :8188 is never
// reached. The assertion that matters most is on the recorded paths: submit, poll, view - and
// never /free, /interrupt or anything that would touch a queue other executors share.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comfyHealth, comfyQueued, nodeComfyPorts, readWorkflow, runTrellis, trellisPrompt, type Workflow } from "../../lib/foundry/mesh/comfy.ts";
import { readBack } from "../../lib/foundry/mesh/glb.ts";
import { standInGlb } from "../../lib/foundry/mesh/standin.ts";

type Seen = { method: string; url: string; body: string };
const seen: Seen[] = [];
let mode: "ok" | "error" | "refuse" | "slow" = "ok";
let polls = 0;
let server: Server;
let base = "";
const GLB = standInGlb("weapon");

const bodyOf = (req: IncomingMessage): Promise<string> =>
  new Promise((r) => {
    const parts: Buffer[] = [];
    req.on("data", (b: Buffer) => parts.push(b));
    req.on("end", () => r(Buffer.concat(parts).toString("latin1")));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await bodyOf(req);
    seen.push({ method: req.method ?? "", url: req.url ?? "", body });
    const json = (code: number, doc: unknown): void => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(doc));
    };
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/system_stats") return json(200, { system: { comfyui_version: "0.42.1" } });
    if (url.pathname === "/queue") return json(200, { queue_running: [], queue_pending: [["x"]] });
    if (url.pathname === "/upload/image") return json(200, { name: "gravitone_axe-a.png", subfolder: "", type: "input" });
    if (url.pathname === "/prompt") return mode === "refuse" ? json(400, { error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation" }, node_errors: {} }) : json(200, { prompt_id: "p-1", number: 1 });
    if (url.pathname === "/history/p-1") {
      polls++;
      if (polls < 3 || mode === "slow") return json(200, {});
      if (mode === "error") return json(200, { "p-1": { outputs: {}, status: { status_str: "error", completed: false, messages: [["execution_error", { node_id: "147", node_type: "BakeTextureFromVoxel", exception_message: "CUDA out of memory." }]] } } });
      return json(200, { "p-1": { outputs: { "164": { images: [{ filename: "ComfyUI_temp_x.png", subfolder: "", type: "temp" }] }, "322": { "3d": [{ filename: "axe-a_t1_00001_.glb", subfolder: "gravitone", type: "output" }] } }, status: { status_str: "success", completed: true, messages: [] } } });
    }
    if (url.pathname === "/view") {
      res.writeHead(200, { "content-type": "model/gltf-binary" });
      return res.end(Buffer.from(GLB));
    }
    json(404, { error: "no such route" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ports = { ...nodeComfyPorts, sleep: async () => undefined };
const ask = { concept: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), conceptName: "gravitone_axe-a.png", targetFaces: 15_000, seed: 23, prefix: "gravitone/axe-a_t1" };

describe("the workflow", () => {
  it("the checked-in workflow carries the nodes the client sets, and they are set", async () => {
    const w = await readWorkflow();
    const p = trellisPrompt(w, { image: "c.png", targetFaces: 38_000, seed: 5, prefix: "gravitone/a_t1" }) as Workflow;
    expect(typeof p).toBe("object");
    expect([p["122"]?.inputs["image"], p["186"]?.inputs["target_face_count"], p["322"]?.inputs["filename_prefix"]]).toEqual(["c.png", 38_000, "gravitone/a_t1"]);
    expect(["3", "12", "18", "23"].map((id) => p[id]?.inputs["seed"])).toEqual([5, 5, 5, 5]);
    expect(w["186"]?.inputs["target_face_count"]).toBe(700_000);
    const noSeed = trellisPrompt(w, { image: "c.png", targetFaces: 1, prefix: "x" }) as Workflow;
    expect(noSeed["3"]?.inputs["seed"]).toBe(w["3"]?.inputs["seed"]);
  });

  it("a workflow without the decimate node is refused by name, before anything is queued", () => {
    expect(trellisPrompt({ "122": { class_type: "LoadImage", inputs: {} } }, { image: "c", targetFaces: 1, prefix: "p" })).toMatch(/no node 186 DecimateMesh/);
  });
});

describe("one TRELLIS run", () => {
  it("submits, polls, views: the glb comes back, and nothing else on ComfyUI was touched", async () => {
    seen.length = 0;
    polls = 0;
    mode = "ok";
    const r = await runTrellis(base, await readWorkflow(), ask, ports, { pollMs: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(readBack(r.glb).tris).toBe(432);
    expect(r.file).toBe("gravitone/axe-a_t1_00001_.glb");
    const paths = seen.map((s) => `${s.method} ${new URL(s.url, "http://x").pathname}`);
    expect(paths).toEqual(["POST /upload/image", "POST /prompt", "GET /history/p-1", "GET /history/p-1", "GET /history/p-1", "GET /view"]);
    expect(seen.some((s) => /\/(free|interrupt)\b/.test(s.url))).toBe(false);
    const sent = JSON.parse(seen[1]?.body ?? "{}") as { prompt: Workflow };
    expect(sent.prompt["186"]?.inputs["target_face_count"]).toBe(15_000);
    expect(sent.prompt["122"]?.inputs["image"]).toBe("gravitone_axe-a.png");
    expect(sent.prompt["23"]?.inputs["seed"]).toBe(23);
    expect(new URL(seen[5]?.url ?? "", "http://x").searchParams.get("subfolder")).toBe("gravitone");
  });

  it("a node error is the run's failure, with ComfyUI's own words", async () => {
    polls = 0;
    mode = "error";
    const r = await runTrellis(base, await readWorkflow(), ask, ports, { pollMs: 1 });
    expect(r).toEqual({ ok: false, kind: "failed", message: "TRELLIS prompt p-1 failed: BakeTextureFromVoxel (node 147): CUDA out of memory." });
  });

  it("a refused prompt is a failure carrying the refusal", async () => {
    mode = "refuse";
    const r = await runTrellis(base, await readWorkflow(), ask, ports, { pollMs: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^ComfyUI refused the TRELLIS prompt: .*prompt_outputs_failed_validation/);
  });

  it("a run that outlives its bound is failed and left on the queue (no interrupt)", async () => {
    seen.length = 0;
    polls = 0;
    mode = "slow";
    let t = 0;
    const r = await runTrellis(base, await readWorkflow(), ask, { ...ports, now: () => (t += 1000) }, { pollMs: 1, timeoutMs: 5000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/did not finish in 5 s; it is left on ComfyUI's queue/);
    expect(seen.some((s) => /\/(free|interrupt)\b/.test(s.url))).toBe(false);
  });

  it("a ComfyUI that does not answer is `unreachable` (the job's breaker), not a failed variant", async () => {
    const r = await runTrellis("http://127.0.0.1:9", await readWorkflow(), ask, ports, { pollMs: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("unreachable");
  });
});

describe("health and queue", () => {
  it("health is /system_stats answering; the queue is running plus pending, read-only", async () => {
    expect(await comfyHealth(base)).toEqual({ ok: true });
    expect((await comfyHealth("http://127.0.0.1:9")).ok).toBe(false);
    expect(await comfyQueued(base)).toBe(1);
    expect(await comfyQueued("http://127.0.0.1:9")).toBeUndefined();
  });
});
