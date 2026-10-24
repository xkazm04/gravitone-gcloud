// THE PAPER COSMOS ENGINE, HELD TO WHAT ITS HEADERS CLAIM (app/_landing/cosmos/engine).
//
// The engine is DOM and canvas code with no browser in this lane, so each case stands up
// the few globals the module under test touches (a Worker that records its messages, a
// document whose elements count the layouts their reads force) and nothing else. The
// claims are the ones the modules' own headers make:
//
//   1. raster.ts: "the main thread only places them". A job asked for while the worker
//      is still saying hello (a resize in the first moments of the page) waited for no
//      one: `mode` starts as "main", so pump() painted it on the main thread instead.
//   2. life.ts: everything with a lifetime stops at destroy(). The handshake's worker is
//      held only in startWorker's closure until hello, and its 4 s timer is a bare
//      setTimeout, so destroy() during the handshake (React's strict-mode remount does it
//      on every dev mount) left the worker running, and its hello or the timer then ran
//      the main-thread fallback - a WebGL context and the grain - for a page that was gone.
//   3. A failure says why. The worker posts its paint error and raster.ts dropped it; the
//      main path's catch dropped its own; a worker that could not paint fell back to the
//      main thread with the tier line saying only "raster main". Each now reports its
//      reason on the console; run() still resolves null.
//   4. worlds.ts: "One at a time; a world nobody opened is let go." buildWorld adopted a
//      matching prewarm and otherwise painted the opened world beside it, leaving the
//      other prewarm painting and its full-viewport layers held in cx.worldPre until the
//      next hover.
//
// raster.ts is loaded natively (ESM) because it spells `new URL(..., import.meta.url)`
// for the bundler, which the Playwright node lane cannot load as CommonJS.
import { afterEach, describe, expect, test, vi } from "vitest";

import { Raster } from "../../app/_landing/cosmos/engine/raster.ts";
import type { Job } from "../../app/_landing/cosmos/engine/rasterJobs.ts";

type G = Record<string, unknown>;
const G = globalThis as unknown as G;
const saved = new Map<string, unknown>();
/** sets a global for this test; afterEach puts the old value back */
function stub(name: string, value: unknown): void {
  if (!saved.has(name)) saved.set(name, G[name]);
  G[name] = value;
}
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete G[k];
    else G[k] = v;
  }
  saved.clear();
});

/** anything: every property and every call is another one, so paint code runs to the end */
const anything = (): unknown =>
  new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : anything()),
    apply: () => anything(),
    set: () => true,
  });

/** a document that counts the elements made on the main thread */
function countingDocument(): { made: string[] } {
  const made: string[] = [];
  stub("document", {
    createElement(tag: string) {
      made.push(tag);
      return anything();
    },
  });
  return { made };
}

/** a Worker that records what it is sent and lets the case answer for it */
class FakeWorker {
  static last: FakeWorker | null = null;
  posted: { id: number; job: Job }[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: { id: number; job: Job }): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  say(data: unknown): void {
    this.onmessage?.({ data });
  }
}
function withWorker(): void {
  FakeWorker.last = null;
  stub("Worker", FakeWorker);
  stub("OffscreenCanvas", function OffscreenCanvas() {});
}
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const JOB: Job = { rs: 1, layers: [{ w: 8, h: 8, ops: [{ p: "haze", w: 8, h: 8, col: "#000000" }] }] };
const HELLO = { t: "hello", ok: true, ren: null, grain: new Blob(["g"], { type: "image/png" }) };

describe("raster.ts: the worker paints, the main thread places", () => {
  test("a job asked for during the worker's handshake waits for the worker, and is painted there", async () => {
    withWorker();
    const doc = countingDocument();
    const r = new Raster(false);
    const w = FakeWorker.last!;
    let settled = false;
    void r.run(JOB, 0, "scene").then(() => (settled = true));
    await tick();
    expect(doc.made, "nothing is painted on the main thread while the worker says hello").toEqual([]);
    expect(settled, "the job is still waiting").toBe(false);
    w.say(HELLO);
    await r.ready;
    expect(r.mode).toBe("worker");
    expect(w.posted.map((m) => m.job)).toEqual([JOB]);
    expect(doc.made).toEqual([]);
    r.destroy();
  });

  test("destroyed during the handshake, the raster stops its worker and starts nothing on the main thread", async () => {
    withWorker();
    const doc = countingDocument();
    const r = new Raster(false);
    const w = FakeWorker.last!;
    r.destroy();
    expect(w.terminated, "destroy() stops the worker it is still waiting on").toBe(true);
    const hello = await Promise.race([r.ready, tick(50).then(() => "pending" as const)]);
    expect(hello, "ready settles, with nothing to show").toEqual({ ren: null, grain: "" });
    // a hello already in flight when it was terminated changes nothing
    w.say(HELLO);
    await tick();
    expect(doc.made, "no WebGL probe and no grain painted for a page that is gone").toEqual([]);
  });
});

describe("raster.ts: a failure says why", () => {
  const warned = () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    return { said: () => spy.mock.calls.map((c) => c.map(String).join(" ")), done: () => spy.mockRestore() };
  };

  test("a job the worker could not paint resolves null and reports the worker's error", async () => {
    withWorker();
    countingDocument();
    const log = warned();
    const r = new Raster(false);
    const w = FakeWorker.last!;
    w.say(HELLO);
    await r.ready;
    const p = r.run(JOB, 0, "scene");
    const { id } = w.posted[0];
    w.say({ t: "fail", id, err: "RangeError: canvas too large" });
    expect(await p).toBeNull();
    expect(log.said().some((s) => s.includes("RangeError: canvas too large"))).toBe(true);
    log.done();
    r.destroy();
  });

  test("a job the main thread could not paint resolves null and reports the error", async () => {
    countingDocument();
    const log = warned();
    const r = new Raster(true);
    await r.ready;
    // a medallion builds Path2D, which this lane has not got: the paint throws
    const p = r.run({ rs: 1, layers: [{ w: 8, h: 8, ops: [{ p: "medal", id: "x", D: 8 }] }] }, 0, "scene");
    expect(await p).toBeNull();
    expect(log.said().some((s) => s.includes("Path2D"))).toBe(true);
    log.done();
    r.destroy();
  });

  test("a worker that cannot paint falls back to the main thread and says so", async () => {
    withWorker();
    countingDocument();
    const log = warned();
    const r = new Raster(false);
    FakeWorker.last!.say({ ...HELLO, ok: false });
    await r.ready;
    expect(r.mode).toBe("main");
    expect(log.said().some((s) => s.includes("main thread"))).toBe(true);
    log.done();
    r.destroy();
  });
});

/* ---------- a document of plain objects, for the modules that build DOM ---------- */
class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  className = "";
  innerHTML = "";
  dataset: Record<string, string> = {};
  props = new Map<string, string>();
  style = { cssText: "", setProperty: (k: string, v: string) => void this.props.set(k, v) } as Record<string, unknown>;
  classes = new Set<string>();
  classList = { add: (...c: string[]) => c.forEach((x) => this.classes.add(x)), remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)) };
  constructor(public tag: string) {}
  get isConnected(): boolean {
    return !!this.parent;
  }
  appendChild(c: FakeEl): FakeEl {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  querySelectorAll(): FakeEl[] {
    return [];
  }
  setAttribute(): void {}
  getContext(): unknown {
    return { transferFromImageBitmap() {}, drawImage() {} };
  }
}
function fakeDom(): void {
  stub("document", { createElement: (tag: string) => new FakeEl(tag) });
  stub("HTMLCanvasElement", class {});
  stub("performance", performance);
}
/** a bitmap that knows whether it was closed */
const bitmap = () => ({ width: 4, height: 4, closed: false, close() {
  this.closed = true;
} });

describe("worlds.ts: one prewarm at a time, and a world nobody opened is let go", () => {
  test("opening another world than the one prewarmed releases the prewarm's layers and drops its job", async () => {
    fakeDom();
    const { buildWorld, prewarmWorld } = await import("../../app/_landing/cosmos/engine/worlds.ts");
    const runs: { prio: number; tag: string; part?: (i: number, s: unknown) => void }[] = [];
    const drops: string[] = [];
    const cx = {
      g: { W: 1280, H: 800, portrait: false, RS: 1, DPR: 1, S: 800 },
      tier: "full",
      life: { dead: false, want() {} },
      els: { world: new FakeEl("div") },
      worldTok: 0,
      worldReady: false,
      worldReadyAt: 0,
      worldPre: null as unknown,
      wplanes: [],
      raster: {
        run: (_job: unknown, prio: number, tag: string, part?: (i: number, s: unknown) => void) => {
          runs.push({ prio, tag, part });
          return new Promise(() => {});
        },
        drop: (tag: string) => void drops.push(tag),
      },
    };
    // a pointer rested on type A: its world starts painting, two layers land
    prewarmWorld(cx as never, "type-a");
    const a = runs[0];
    expect(a.tag).toBe("prewarm");
    const [a0, a1, a2] = [bitmap(), bitmap(), bitmap()];
    a.part!(0, a0);
    a.part!(1, a1);
    // ...and type B is the one clicked
    buildWorld(cx as never, "type-b");
    expect(runs.at(-1)!.tag, "B paints as the open world").toBe("world");
    expect(cx.worldPre, "A is no longer the prewarm").toBeNull();
    expect(drops, "A's job, if still queued, is dropped").toContain("prewarm");
    expect([a0.closed, a1.closed], "A's landed layers are released").toEqual([true, true]);
    a.part!(2, a2);
    expect(a2.closed, "a layer of A that lands later is released too").toBe(true);
  });
});
