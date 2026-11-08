// THE FAIR WAIT (lib/imaging/local/fluxWait.ts) over a scripted ComfyUI queue on a fake clock: a foreign prompt
// running ahead of ours for longer than the running cap does not kill ours; ours hanging in running is withdrawn at
// the cap, counted from when it started; a lost prompt is withdrawn too, and a withdrawal that fails never replaces
// the sentence that caused it, nor claims it succeeded.

import { describe, expect, it } from "vitest";

import { drawFlux, type FluxFetch } from "../../lib/imaging/local/flux2.ts";
import { COMFY_UNREACHABLE, isComfyUnreachable } from "../../lib/imaging/local/fluxWait.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const DONE = { "p-1": { status: { status_str: "success", completed: true }, outputs: { "13": { images: [{ filename: "a.png", subfolder: "", type: "output" }] } } } };
const MIN = 60_000;

type Where = "pending" | "running" | "neither";
type Script = { f: FluxFetch; asked: string[]; clock: { t: number }; now: () => number; sleep: (ms: number) => Promise<void> };

/** `at(t)` says where our prompt is at fake time t (ms since it was accepted); `done(t)` whether history has it. */
function script(o: { at: (t: number) => Where; done?: (t: number) => boolean; down?: (t: number) => boolean; postFails?: boolean }): Script {
  const clock = { t: 0 };
  const asked: string[] = [];
  const f: FluxFetch = async (url, init) => {
    const u = new URL(url);
    const m = init?.method ?? "GET";
    asked.push(`${m} ${u.pathname}`);
    if (u.pathname === "/system_stats") return Response.json({});
    if (u.pathname === "/prompt") return Response.json({ prompt_id: "p-1" });
    if (o.down?.(clock.t) === true) throw new TypeError("fetch failed");
    if (u.pathname === "/history/p-1") return Response.json(o.done?.(clock.t) === true ? DONE : {});
    if (u.pathname === "/queue" && m === "GET") {
      const w = o.at(clock.t);
      return Response.json({ queue_running: w === "running" ? [[1, "p-1", {}]] : w === "pending" ? [[0, "other", {}]] : [], queue_pending: w === "pending" ? [[2, "p-1", {}]] : [] });
    }
    if (u.pathname === "/queue" || u.pathname === "/interrupt") return o.postFails === true ? new Response("no", { status: 500 }) : Response.json({});
    if (u.pathname === "/view") return new Response(PNG);
    return new Response("no", { status: 404 });
  };
  return { f, asked, clock, now: () => clock.t, sleep: async (ms) => void (clock.t += ms) };
}
const run = (s: Script, extra: object = {}) => drawFlux({ prompt: "p", seed: 1 }, { fetch: s.f, base: "http://comfy.test", now: s.now, sleep: s.sleep, ...extra });
const fails = (p: Promise<unknown>): Promise<Error> => p.then(() => new Error("it did not fail"), (x: unknown) => x as Error);

describe("the fair wait", () => {
  it("a foreign prompt ahead of ours past the 15 min running cap does not kill ours: the running clock starts when ours runs", async () => {
    // 40 min pending behind another session, then ours runs 5 min and lands.
    const s = script({ at: (t) => (t < 40 * MIN ? "pending" : "running"), done: (t) => t >= 45 * MIN });
    const r = await run(s);
    expect(r.promptId).toBe("p-1");
    expect(s.clock.t).toBeGreaterThanOrEqual(45 * MIN);
    expect(s.asked.some((a) => a === "POST /queue" || a === "POST /interrupt")).toBe(false);
  });

  it("pending has its own bound (90 min): past it ours is deleted from the queue and the sentence says pending", async () => {
    const s = script({ at: () => "pending" });
    const e = await fails(run(s));
    expect(e.message).toMatch(/^ComfyUI did not start Flux prompt p-1: it waited 90 min behind other prompts \(limit 90 min, last seen pending\); it was still queued behind other prompts, and was withdrawn$/);
    expect(s.asked).toContain("POST /queue");
    expect(isComfyUnreachable(e)).toBe(false);
  });

  it("ours hanging in running is interrupted 15 min after it started, not after it was sent", async () => {
    const s = script({ at: (t) => (t < 20 * MIN ? "pending" : "running") });
    const e = await fails(run(s));
    expect(e.message).toMatch(/^ComfyUI did not finish Flux prompt p-1: it ran 15 min \(limit 15 min\); it was still running, and was interrupted$/);
    expect(s.clock.t).toBeGreaterThanOrEqual(35 * MIN);
    expect(s.asked).toContain("POST /interrupt");
    expect(isComfyUnreachable(e)).toBe(false);
  });

  it("a withdrawal ComfyUI did not accept is not reported as one", async () => {
    const s = script({ at: (t) => (t < 1 * MIN ? "pending" : "running"), postFails: true });
    const e = await fails(run(s, { capMs: 2 * MIN }));
    expect(e.message).toContain("the interrupt was not accepted, so it may still be running");
    expect(e.message).not.toContain("was interrupted");
  });

  it("a lost prompt is withdrawn (looked for) before the throw, and the sentence is typed unreachable", async () => {
    // Held for a while, then in neither queue nor history for 6 polls; the queue answers, so the withdrawal finds it gone.
    const s = script({ at: (t) => (t < 30_000 ? "running" : "neither") });
    const e = await fails(run(s));
    expect(e.message).toMatch(/^ComfyUI lost prompt p-1: .* for 6 polls \(restarted\?\); the prompt in neither queue$/);
    expect((e as { detail?: string }).detail).toBe(COMFY_UNREACHABLE);
    expect(isComfyUnreachable(e)).toBe(true);
  });

  it("the server gone mid-draw: the lost throw survives a withdrawal that cannot reach it", async () => {
    const s = script({ at: () => "running", down: (t) => t >= 9_000 });
    const e = await fails(run(s));
    expect(e.message).toMatch(/^ComfyUI lost prompt p-1: .*; the prompt not located: ComfyUI did not answer \/queue, so it may still be queued or running$/);
    expect(isComfyUnreachable(e)).toBe(true);
  });

  it("refused to start (/system_stats) is typed unreachable; a refused graph is not", async () => {
    const down: FluxFetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(isComfyUnreachable(await fails(drawFlux({ prompt: "p" }, { fetch: down, base: "http://comfy.test" })))).toBe(true);
    const refuse: FluxFetch = async (url) => (new URL(url).pathname === "/system_stats" ? Response.json({}) : new Response("{}", { status: 400 }));
    expect(isComfyUnreachable(await fails(drawFlux({ prompt: "p" }, { fetch: refuse, base: "http://comfy.test" })))).toBe(false);
  });
});
