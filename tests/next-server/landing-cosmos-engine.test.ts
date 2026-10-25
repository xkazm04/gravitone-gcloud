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
//   5. banner.ts: "one read, then only writes". A name too wide for the stage wrote its
//      smaller size and then read the name's height: a second synchronous layout on the
//      hover, and the height it read was already the shrunk one the formula subtracts from.
//   6. The header chips (a type's template count, a family's item count, a locked family's
//      lock) were <span aria-label=...>: a name on a generic, which ARIA 1.2 prohibits and
//      screen readers drop, so the lock chip read as nothing at all.
//
// raster.ts is loaded natively (ESM) because it spells `new URL(..., import.meta.url)`
// for the bundler, which the Playwright node lane cannot load as CommonJS.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { Raster } from "../../app/_landing/cosmos/engine/raster.ts";
import { rendererOf, type Job } from "../../app/_landing/cosmos/engine/rasterJobs.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

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

describe("rasterJobs.ts: the one renderer probe both raster paths ask", () => {
  const gl = (unmasked: boolean) => {
    const lost: string[] = [];
    const ctx = {
      RENDERER: 1,
      getExtension: (n: string) =>
        n === "WEBGL_debug_renderer_info" ? (unmasked ? { UNMASKED_RENDERER_WEBGL: 2 } : null) : n === "WEBGL_lose_context" ? { loseContext: () => lost.push("lost") } : null,
      getParameter: (p: number) => (p === 2 ? "ANGLE (NVIDIA)" : "WebKit WebGL"),
    };
    return { ctx: ctx as unknown as WebGLRenderingContext, lost };
  };
  test("names the unmasked renderer where it may, the masked one otherwise, and lets the context go", () => {
    const a = gl(true),
      b = gl(false);
    expect(rendererOf(a.ctx)).toBe("ANGLE (NVIDIA)");
    expect(rendererOf(b.ctx)).toBe("WebKit WebGL");
    expect([a.lost, b.lost]).toEqual([["lost"], ["lost"]]);
    expect(rendererOf(null)).toBeNull();
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
        paint: (_job: unknown, prio: number, tag: string, part?: (i: number, s: unknown) => void) => {
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

describe("banner.ts: one read, then only writes", () => {
  /** elements whose box reads force a layout when a write came before them */
  function layoutCounter() {
    const st = { dirty: true, layouts: 0 };
    const node = (wh: [number, number]) => {
      const style = new Proxy({ setProperty: () => void (st.dirty = true) } as Record<string, unknown>, {
        set: (t, k, v) => ((st.dirty = true), (t[k as string] = v), true),
      });
      const read = (v: number) => {
        if (st.dirty) st.layouts++;
        st.dirty = false;
        return v;
      };
      return {
        style,
        classList: { add: () => void (st.dirty = true) },
        set textContent(_v: string) {
          st.dirty = true;
        },
        set innerHTML(_v: string) {
          st.dirty = true;
        },
        get offsetWidth() {
          return read(wh[0]);
        },
        get offsetHeight() {
          return read(wh[1]);
        },
      };
    };
    const parts: Record<string, ReturnType<typeof node>> = {
      ".bn-name": node([900, 100]),
      ".bn-meta": node([0, 0]),
      ".bn-front": node([1000, 120]),
      ".bn-back": node([1000, 120]),
    };
    const own = node([0, 0]);
    const banner = { style: own.style, classList: own.classList, querySelector: (sel: string) => parts[sel] };
    return { st, banner };
  }

  test("a name too wide for the stage is measured in one layout, not two", async () => {
    const { showBanner } = await import("../../app/_landing/cosmos/engine/banner.ts");
    const { st, banner } = layoutCounter();
    const cx = { g: { W: 1280, H: 800, S: 800, portrait: false }, els: { banner } };
    showBanner(cx as never, { name: "A name far wider than sixty per cent of the stage", x: 640, y: 400 });
    expect(st.layouts).toBe(1);
  });
});

describe("the engine's markup names only what can carry a name", () => {
  test("no generic <span> in the engine's HTML strings carries an aria-label without a role", () => {
    const dir = path.join(ROOT, "app/_landing/cosmos/engine");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    // a walk that reads nothing would pass in a voice indistinguishable from success
    expect(files.length).toBeGreaterThan(8);
    const bad: string[] = [];
    let spans = 0;
    for (const f of files) {
      // comment-only lines out: a header may quote the markup it is about
      const src = readFileSync(path.join(dir, f), "utf8")
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
        .join("\n");
      for (const m of src.matchAll(/<span\b[^>]*>/g)) {
        spans++;
        if (/\baria-label=/.test(m[0]) && !/\brole=/.test(m[0])) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(spans, "the walk found the engine's spans").toBeGreaterThan(3);
    expect(bad, "ARIA 1.2 prohibits naming a generic: a screen reader drops these labels").toEqual([]);
  });
});

/* ============ THE SHELL (landing-cosmos-shell): perf, stage, search, keyboard, the first paint ============
 *
 *   7. perf.ts's header is the tier contract: a probe verdict, lowered (never raised) by what an
 *      earlier visit's governor measured on the same signature within a day; and a governor that
 *      steps down when the 90th-percentile frame is over 22 ms across at least 45 frames, once per
 *      window per tier, never in a hidden tab, never when forced. None of it was pinned.
 */

/** Node 21+ defines `navigator` as a getter: an assignment is ignored, so define it, and put it back */
const defined = new Map<string, PropertyDescriptor | undefined>();
function define(name: string, value: unknown): void {
  if (!defined.has(name)) defined.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
afterEach(() => {
  for (const [k, d] of defined) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete G[k];
  }
  defined.clear();
});

/** a Storage over a Map; `broken` throws on every call, like a blocked or private one */
function storage(broken = false): Map<string, string> {
  const m = new Map<string, string>();
  const no = () => {
    throw new Error("SecurityError: storage is blocked");
  };
  define("localStorage", {
    getItem: (k: string) => (broken ? no() : (m.get(k) ?? null)),
    setItem: (k: string, v: string) => (broken ? no() : void m.set(k, v)),
  });
  return m;
}

describe("perf.ts: the tier a machine gets", () => {
  const GPU = "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)";

  test("the probe: no WebGL, a software renderer, two cores, 2 GB or Save-Data is lite; a hardware renderer is full", async () => {
    const { classify } = await import("../../app/_landing/cosmos/engine/perf.ts");
    define("navigator", { hardwareConcurrency: 8, deviceMemory: 8 });
    expect(classify(null).tier).toBe("lite");
    expect(classify("Google SwiftShader").tier).toBe("lite");
    expect(classify("llvmpipe (LLVM 15.0.7, 256 bits)").tier).toBe("lite");
    expect(classify(GPU)).toEqual({ tier: "full", why: "hardware renderer: " + GPU.slice(0, 80) });
    define("navigator", { hardwareConcurrency: 2, deviceMemory: 8 });
    expect(classify(GPU)).toEqual({ tier: "lite", why: "cores 2" });
    define("navigator", { hardwareConcurrency: 8, deviceMemory: 2 });
    expect(classify(GPU).tier).toBe("lite");
    define("navigator", { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } });
    expect(classify(GPU)).toEqual({ tier: "lite", why: "Save-Data" });
  });

  test("a governor's downgrade is remembered for a day under the same signature, and only ever lowers", async () => {
    const { decide, remember, signature } = await import("../../app/_landing/cosmos/engine/perf.ts");
    define("navigator", { hardwareConcurrency: 8, deviceMemory: 8 });
    const m = storage();
    expect(decide(GPU).tier, "a first visit is the probe's").toBe("full");
    remember(signature(GPU), { tier: "lite", why: "governor: p90 31.0 ms" });
    const v = decide(GPU);
    expect(v.tier, "the next visit starts where the governor left it").toBe("lite");
    expect(v.why).toBe("remembered: governor: p90 31.0 ms");
    expect(v.sig).toBe(signature(GPU));
    // the same verdict a day and an hour old is a busy afternoon long gone
    const [key] = [...m.keys()];
    m.set(key, JSON.stringify({ ...JSON.parse(m.get(key)!), at: Date.now() - 25 * 3600 * 1000 }));
    expect(decide(GPU).tier).toBe("full");
    // another machine's verdict is not this one's
    m.set(key, JSON.stringify({ sig: "other|8|8|0", tier: "still", why: "x", at: Date.now() }));
    expect(decide(GPU).tier).toBe("full");
    // a remembered tier never RAISES the probe's
    m.set(key, JSON.stringify({ sig: signature("Google SwiftShader"), tier: "full", why: "x", at: Date.now() }));
    expect(decide("Google SwiftShader").tier).toBe("lite");
  });

  test("storage that throws is a first visit, and remembering into it throws nothing", async () => {
    const { decide, remember } = await import("../../app/_landing/cosmos/engine/perf.ts");
    define("navigator", { hardwareConcurrency: 8, deviceMemory: 8 });
    storage(true);
    expect(decide(GPU).tier).toBe("full");
    expect(() => remember("s", { tier: "lite", why: "w" })).not.toThrow();
  });
});

describe("perf.ts: the governor", () => {
  async function governor() {
    const { Governor } = await import("../../app/_landing/cosmos/engine/perf.ts");
    const steps = new Map<string, (now: number) => boolean>();
    const downs: [number, number, string][] = [];
    const g = new Governor({ want: (n, s) => void steps.set(n, s), stepDown: (p90, n, w) => void downs.push([p90, n, w]) });
    /** frames `dt` ms apart for as long as the governor wants them; returns how many it took */
    const frames = (dt: number) => {
      const s = steps.get("governor");
      steps.delete("governor");
      if (!s) return 0;
      let now = 1000,
        n = 1;
      while (s(now) && n < 5000) {
        now += dt;
        n++;
      }
      return n;
    };
    return { g, downs, frames, wanted: () => steps.has("governor") };
  }

  test("a window of slow frames steps the tier down once, with its p90; fast frames step nothing", async () => {
    define("document", { hidden: false });
    const slow = await governor();
    slow.g.kick("boot", 3000);
    slow.frames(30);
    expect(slow.downs).toEqual([[30, expect.any(Number), "boot"]]);
    expect(slow.downs[0][1]).toBeGreaterThanOrEqual(45);
    const fast = await governor();
    fast.g.kick("boot", 3000);
    expect(fast.frames(16.7)).toBeGreaterThan(150);
    expect(fast.downs).toEqual([]);
  });

  test("a window past its duration with fewer than 45 frames keeps sampling until it has them", async () => {
    define("document", { hidden: false });
    const { g, downs, frames } = await governor();
    g.kick("move", 200);
    // 100 ms frames: the 200 ms are over after three, a verdict needs 45 intervals
    expect(frames(100)).toBe(46);
    expect(downs.map((d) => d[1])).toEqual([45]);
  });

  test("each window runs once per tier, one at a time, and again after a reset; an off governor opens none", async () => {
    define("document", { hidden: false });
    const { g, frames, wanted } = await governor();
    g.kick("boot", 300);
    g.kick("level", 300); // asked for while boot samples: not run, and not spent
    frames(16);
    g.kick("boot", 300);
    expect(wanted(), "boot already ran in this tier").toBe(false);
    g.kick("level", 300);
    expect(wanted(), "level was never run, so it runs now").toBe(true);
    frames(16);
    g.reset();
    g.kick("boot", 300);
    expect(wanted(), "a new tier is watched the same way").toBe(true);
    frames(16);
    g.off = true;
    g.kick("move", 300);
    expect(wanted()).toBe(false);
  });

  test("a hidden tab has no frames worth judging: the window is given back, unjudged", async () => {
    define("document", { hidden: true });
    const { g, downs, frames, wanted } = await governor();
    g.kick("boot", 3000);
    expect(frames(30), "the first frame in a hidden tab ends it").toBe(1);
    expect(downs).toEqual([]);
    define("document", { hidden: false });
    g.kick("boot", 3000);
    expect(wanted(), "the same window may be asked for again").toBe(true);
  });
});

/* ---------- a document just rich enough for the shell's builders: a tree, classes, a focus ---------- */
const DOC = { activeElement: null as DomEl | null, body: null as unknown as DomEl, createElement: (t: string) => new DomEl(t) };
/** `tag`, `.class` and `[data-x="v"]` compounds, joined by descendant spaces: what the shell asks */
const SIMPLE = /^([a-z][a-z0-9]*)?((?:\.[\w-]+)*)((?:\[[\w-]+="[^"]*"\])*)$/i;
class DomEl {
  tagName: string;
  children: DomEl[] = [];
  parent: DomEl | null = null;
  classes = new Set<string>();
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: Record<string, unknown> = { cssText: "", setProperty() {} };
  textContent = "";
  value = "";
  disabled = false;
  type = "";
  inert = false;
  onclick: (() => void) | null = null;
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  get className(): string {
    return [...this.classes].join(" ");
  }
  set className(v: string) {
    this.classes = new Set(v.split(/\s+/).filter(Boolean));
  }
  classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    toggle: (c: string, on?: boolean) => {
      const want = on ?? !this.classes.has(c);
      if (want) this.classes.add(c);
      else this.classes.delete(c);
      return want;
    },
    contains: (c: string) => this.classes.has(c),
  };
  get innerHTML(): string {
    return "";
  }
  set innerHTML(html: string) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    // the stage's nav buttons are an icon string and one <span>, which they then fill
    if (html.includes("<span></span>")) this.appendChild(new DomEl("span"));
  }
  insertAdjacentHTML(): void {}
  appendChild(c: DomEl): DomEl {
    c.remove();
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  get isConnected(): boolean {
    return DOC.body.contains(this);
  }
  contains(n: DomEl | null): boolean {
    for (let x = n; x; x = x.parent) if (x === this) return true;
    return false;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  focus(): void {
    DOC.activeElement = this;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
  }
  get offsetWidth(): number {
    return 0;
  }
  get offsetHeight(): number {
    return 0;
  }
  is(sel: string): boolean {
    const m = SIMPLE.exec(sel);
    if (!m) throw new Error("DomEl cannot match " + sel);
    if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
    for (const c of m[2].split(".").filter(Boolean)) if (!this.classes.has(c)) return false;
    for (const [, k, v] of m[3].matchAll(/\[([\w-]+)="([^"]*)"\]/g)) {
      const got = k.startsWith("data-") ? this.dataset[k.slice(5).replace(/-(\w)/g, (_x, ch: string) => ch.toUpperCase())] : this.attrs.get(k);
      if (got !== v) return false;
    }
    return true;
  }
  querySelectorAll(sel: string): DomEl[] {
    const parts = sel.trim().split(/\s+/);
    const out: DomEl[] = [];
    const fits = (e: DomEl) => {
      if (!e.is(parts[parts.length - 1])) return false;
      let i = parts.length - 2;
      for (let a = e.parent; a && a !== this && i >= 0; a = a.parent) if (a.is(parts[i])) i--;
      return i < 0;
    };
    const walk = (e: DomEl) =>
      e.children.forEach((c) => {
        if (fits(c)) out.push(c);
        walk(c);
      });
    walk(this);
    return out;
  }
  querySelector(sel: string): DomEl | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}
function shellDom(): DomEl {
  DOC.body = new DomEl("body");
  DOC.activeElement = DOC.body;
  stub("document", DOC);
  stub("HTMLCanvasElement", class {});
  stub("Image", function Image() {
    return new DomEl("img");
  });
  const root = new DomEl("div");
  DOC.body.appendChild(root);
  return root;
}
const kid = (root: DomEl, tag = "div") => root.appendChild(new DomEl(tag));
/** an open family whose three categories have pictures, so the stage paints no diorama */
function familyCx(root: DomEl) {
  const cats = ["a", "b", "c"].map((id) => ({ id, label: "Category " + id, items: 3, art: `/presets/${id}.png` }));
  const fam = { id: "styles", label: "Styles", status: "live" as const, categories: cats };
  return {
    root,
    els: { stageView: kid(root, "section"), crumbs: kid(root, "nav"), depth: kid(root, "nav"), back: kid(root, "button") },
    g: { W: 1280, H: 800, S: 800, DPR: 1, RS: 1, portrait: false },
    tier: "full",
    RM: true,
    ST: { lv: "cat", type: null, tpl: null, fam: "styles", cat: "a", opener: null },
    SV: { kind: "cat", idx: 0, list: cats },
    famById: new Map([["styles", fam]]),
    typeById: new Map(),
    templates: [],
    steps: [],
    strips: [],
    stageTok: 0,
    life: { dead: false, timeout() {}, observe: (x: unknown) => x, unobserve() {} },
    raster: { run: () => new Promise(() => {}) },
  };
}

describe("stage.ts: Previous and Next keep the focus they were pressed with", () => {
  //   8. renderStage rebuilds the whole stage (v.innerHTML = ""), its Previous / Next with it, so the
  //      button a keyboard user had just pressed left the document and the focus fell to <body>:
  //      the next Tab started from the top of the page, and a second Enter did nothing.
  const navBtn = (cx: ReturnType<typeof familyCx>, dir: "Previous" | "Next") =>
    cx.els.stageView.querySelectorAll(".sv-nav button").find((b) => (b.getAttribute("aria-label") || "").startsWith(dir + ":"))!;

  test("Next pressed from the keyboard leaves the focus on the new Next, and on Previous at the end", async () => {
    const root = shellDom();
    const { renderStage } = await import("../../app/_landing/cosmos/engine/stage.ts");
    const cx = familyCx(root);
    renderStage(cx as never, "cat", 0, null);
    navBtn(cx, "Next").focus();
    navBtn(cx, "Next").onclick!();
    expect(cx.SV.idx).toBe(1);
    const a = DOC.activeElement!;
    expect(cx.els.stageView.contains(a), "the focus is still on the stage").toBe(true);
    expect(a.getAttribute("aria-label")).toBe("Next: Category c");
    a.onclick!();
    expect(cx.SV.idx).toBe(2);
    expect(DOC.activeElement!.getAttribute("aria-label"), "the last item has no Next: its Previous takes the focus").toBe("Previous: Category b");
  });

  test("the arrow keys, pressed with the focus elsewhere, do not pull it onto the stage", async () => {
    const root = shellDom();
    const { renderStage, stageGo } = await import("../../app/_landing/cosmos/engine/stage.ts");
    const cx = familyCx(root);
    renderStage(cx as never, "cat", 0, null);
    stageGo(cx as never, 1);
    expect(DOC.activeElement).toBe(DOC.body);
  });
});

describe("search.ts: closing the slip gives the focus back", () => {
  //   9. #search is display:none once closed, so its input took the focus with it to <body>: Esc
  //      (or the scrim, or the search button) left a keyboard user at the top of the page, not on
  //      the medallion or the button the slip was opened from.
  function searchCx(root: DomEl) {
    const els = { search: kid(root), q: kid(root, "input"), res: kid(root, "ul"), searchBtn: kid(root, "button"), banner: kid(root) };
    return { root, els, searchOpen: false, SIDX: null, sres: [], sel: 0, types: [], library: [], templates: [], typeById: new Map(), searchFrom: null };
  }

  test("Esc after '/' on a medallion puts the focus back on the medallion", async () => {
    const root = shellDom();
    const { closeSearch, openSearch } = await import("../../app/_landing/cosmos/engine/search.ts");
    const cx = searchCx(root);
    const med = kid(root, "button");
    med.focus();
    openSearch(cx as never);
    expect(DOC.activeElement, "the slip takes the focus").toBe(cx.els.q);
    closeSearch(cx as never);
    expect(DOC.activeElement).toBe(med);
  });

  test("opened with nothing focused, closing it lands on the search button, not on <body>", async () => {
    const root = shellDom();
    const { closeSearch, openSearch } = await import("../../app/_landing/cosmos/engine/search.ts");
    const cx = searchCx(root);
    openSearch(cx as never);
    closeSearch(cx as never);
    expect(DOC.activeElement).toBe(cx.els.searchBtn);
  });

  test("an opener that a rebuild has since removed is not focused", async () => {
    const root = shellDom();
    const { closeSearch, openSearch } = await import("../../app/_landing/cosmos/engine/search.ts");
    const cx = searchCx(root);
    const med = kid(root, "button");
    med.focus();
    openSearch(cx as never);
    med.remove();
    closeSearch(cx as never);
    expect(DOC.activeElement).toBe(cx.els.searchBtn);
  });
});

describe("keyboard.ts: an input method's keys are its own", () => {
  //  10. With the search slip open the window's keydown took Enter and the arrows for the results,
  //      including the Enter an IME (Japanese, Chinese, Korean...) sends to commit its candidate:
  //      typing a query that way flew to the first result before the query was written.
  async function keyed(isComposing: boolean, keyCode = 0) {
    const root = shellDom();
    stub("window", {});
    const { wireKeyboard } = await import("../../app/_landing/cosmos/engine/keyboard.ts");
    let onKey: ((e: unknown) => void) | null = null;
    const els = { search: kid(root), q: kid(root, "input"), res: kid(root, "ul"), searchBtn: kid(root, "button"), banner: kid(root) };
    const hit = { k: "fam", id: "nowhere", label: "Styles", sub: "", col: "", l: "styles" };
    const cx = {
      root,
      els,
      introOn: false,
      searchOpen: true,
      searchFrom: null,
      sres: [hit, hit],
      sel: 0,
      ST: { lv: "root" },
      famById: new Map(),
      life: { on: (_t: unknown, _type: string, fn: (e: unknown) => void) => ((onKey = fn), () => {}) },
    };
    wireKeyboard(cx as never);
    let prevented = 0;
    const press = (key: string) => onKey!({ key, isComposing, keyCode, target: els.q, preventDefault: () => void prevented++ });
    return { cx, press, prevented: () => prevented };
  }

  test("Enter and the arrows while composing pick and move nothing", async () => {
    const { cx, press, prevented } = await keyed(true);
    press("ArrowDown");
    press("Enter");
    expect(cx.searchOpen, "still open: the Enter committed the candidate").toBe(true);
    expect(cx.sel).toBe(0);
    expect(prevented(), "the IME gets its keys").toBe(0);
  });

  test("Safari's composition Enter (keyCode 229, isComposing false) picks nothing either", async () => {
    const { cx, press } = await keyed(false, 229);
    press("Enter");
    expect(cx.searchOpen).toBe(true);
  });

  test("outside a composition, ArrowDown moves the choice and Enter picks it", async () => {
    const { cx, press } = await keyed(false);
    press("ArrowDown");
    expect(cx.sel).toBe(1);
    press("Enter");
    expect(cx.searchOpen).toBe(false);
  });
});

describe("cosmos.css: the first paint stays until there is something to replace it", () => {
  //  11. boot() catches a scene build that throws (intro.ts) and goes on: the intro's timers still
  //      add `booted`, and `.pc.booted .sky0{visibility:hidden}` then took away the dusk sky that
  //      was the page's first paint, leaving the flat app ground behind the HUD. data-ready is set
  //      only once a build has placed the scene (intro.ts ready()), so the sky waits for it.
  test("every rule that hides .sky0 also asks for [data-ready]", () => {
    const css = readFileSync(path.join(ROOT, "app/_landing/cosmos/cosmos.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const hides: string[] = [];
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0(?![.\d])/.test(body)) continue;
      for (const s of sel.split(",")) if (/\.sky0\b/.test(s)) hides.push(s.trim());
    }
    // a walk that finds no rule would pass in a voice indistinguishable from success
    expect(hides.length, "the stylesheet still hides the sky once the scene is up").toBeGreaterThan(0);
    expect(hides.filter((s) => !s.includes("[data-ready]"))).toEqual([]);
  });

  test("data-ready is set only by a build that placed the scene", () => {
    const src = readFileSync(path.join(ROOT, "app/_landing/cosmos/engine/intro.ts"), "utf8");
    expect(src).toMatch(/if \(built\) ready\(cx\);/);
    expect(src).toMatch(/if \(!\(await buildScene\(cx, "swap"\)\)\) return false;\r?\n\s*ready\(cx\);/);
  });
});

/* ---------- a failed paint is not a dropped one (raster.ts, carousel.ts, worlds.ts) ---------- */
describe("raster.ts: paint() tells a failed job from a dropped one", () => {
  test("a job the worker fails is 'failed'; a queued job dropped by its tag, or lost with the raster, is 'dropped'", async () => {
    withWorker();
    countingDocument();
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = new Raster(false);
    const w = FakeWorker.last!;
    w.say(HELLO);
    await r.ready;
    const failing = r.paint(JOB, 0, "a"),
      second = r.paint(JOB, 0, "a"),
      queued = r.paint(JOB, 1, "b"),
      lost = r.paint(JOB, 2, "c");
    r.drop("b");
    expect(await queued).toBe("dropped");
    w.say({ t: "fail", id: w.posted[0].id, err: "RangeError: canvas too large" });
    expect(await failing).toBe("failed");
    r.destroy();
    expect(await lost).toBe("dropped");
    expect(await second, "a job painting when the raster went is lost, not failed").toBe("dropped");
    expect(await r.run(JOB), "run() keeps resolving null for both").toBeNull();
    log.mockRestore();
  });
});

describe("carousel.ts: a card whose art failed is not asked for again", () => {
  /** a type view of 12 templates without key art, in a raster whose every job ends as `how` */
  async function glide(how: "failed" | "dropped", frames: number) {
    const root = shellDom();
    const { syncCarousel } = await import("../../app/_landing/cosmos/engine/carousel.ts");
    const { carMetrics } = await import("../../app/_landing/cosmos/engine/layout.ts");
    const g = { W: 1280, H: 800, S: 800, DPR: 1, RS: 1, portrait: false };
    const list = Array.from({ length: 12 }, (_x, i) => ({ id: "t" + i, label: "T" + i, type: "film" }));
    const cards = list.map(() => {
      const c = kid(root, "button");
      kid(kid(c, "span"), "canvas").parent!.classes.add("art");
      return c;
    });
    let asked = 0;
    const cx = {
      g,
      tier: "full",
      RM: true,
      carTok: 0,
      life: { dead: false },
      els: { typeView: kid(root, "section") },
      CAR: { ...carMetrics(g, list.length), pos: 0, target: 0, cards, list, idx: 0, hov: null, drag: null, snap: 0, moved: false, t: 0 },
      raster: {
        run: () => (asked++, Promise.resolve(null)),
        paint: () => (asked++, Promise.resolve(how)),
        drop() {},
      },
    };
    for (let i = 0; i < frames; i++) {
      syncCarousel(cx as never, 0);
      await tick(1);
    }
    return { asked, near: cards.filter((_c, i) => i <= 4).length };
  }

  test("ten glide frames over a diorama that throws ask the raster once per near card, not once per frame", async () => {
    const one = await glide("failed", 1);
    const ten = await glide("failed", 10);
    expect(one.asked, "the first frame asks for the cards near focus").toBeGreaterThan(0);
    expect(ten.asked, "and the nine after it ask for nothing").toBe(one.asked);
  });

  test("a dropped job is still asked for again on the next frame", async () => {
    const one = await glide("dropped", 1);
    const ten = await glide("dropped", 10);
    expect(ten.asked).toBeGreaterThan(one.asked);
  });
});

describe("worlds.ts: a world that could not be painted lands empty instead of holding the overview", () => {
  function worldCx(how: "failed" | "dropped") {
    fakeDom();
    return {
      g: { W: 1280, H: 800, portrait: false, RS: 1, DPR: 1, S: 800 },
      tier: "full",
      life: { dead: false, want() {} },
      els: { world: new FakeEl("div") },
      worldTok: 0,
      worldReady: false,
      worldReadyAt: 0,
      worldPre: null as unknown,
      wplanes: [],
      raster: { run: () => Promise.resolve(null), paint: () => Promise.resolve(how), drop() {}, bump() {} },
    };
  }
  test("a failed world job sets worldReady (tryCover stops polling); a dropped one leaves it unset", async () => {
    const { buildWorld } = await import("../../app/_landing/cosmos/engine/worlds.ts");
    const failed = worldCx("failed");
    buildWorld(failed as never, "type-a");
    await tick(1);
    expect(failed.worldReady).toBe(true);
    const dropped = worldCx("dropped");
    buildWorld(dropped as never, "type-a");
    await tick(1);
    expect(dropped.worldReady).toBe(false);
  });
});


/* ---------- an opened world does not wait behind the tiles it was prewarmed beside (raster.ts, worlds.ts) ---------- */
describe("worlds.ts: a prewarmed world is promoted when it is opened", () => {
  test("its job is the first to start after the two in flight, not behind the family's queued tiles", async () => {
    withWorker();
    fakeDom();
    const { buildWorld, prewarmWorld } = await import("../../app/_landing/cosmos/engine/worlds.ts");
    const raster = new Raster(false);
    const w = FakeWorker.last!;
    w.say(HELLO);
    await raster.ready;
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
      raster,
    };
    // a family opens: six tiles at 1+k, then the prewarm of its world at 3
    for (let k = 0; k < 6; k++) void raster.run({ ...JOB, rs: 100 + k }, 1 + k, "lib");
    prewarmWorld(cx as never, "fam");
    // a category is clicked before the tiles drain
    buildWorld(cx as never, "fam");
    // the worker answers each job as it is sent; the order they were sent in is the order they painted in
    let answered = 0;
    while (answered < w.posted.length) {
      w.say({ t: "done", id: w.posted[answered].id, out: [], ret: [] });
      answered++;
    }
    const order = w.posted.map((m) => (m.job.parts ? "world" : "lib" + (m.job.rs - 100)));
    expect(order.slice(0, 3), "two tiles were already painting; the world is next").toEqual(["lib0", "lib1", "world"]);
    expect(order.filter((x) => x === "world")).toHaveLength(1);
    raster.destroy();
  });

  test("bump() raises only queued jobs of the tag, keeps their order, and leaves the ones painting alone", async () => {
    withWorker();
    countingDocument();
    const r = new Raster(false);
    const w = FakeWorker.last!;
    w.say(HELLO);
    await r.ready;
    const mark = (n: number): Job => ({ ...JOB, rs: n });
    void r.run(mark(1), 0, "a");
    void r.run(mark(2), 0, "a");
    void r.run(mark(3), 5, "x");
    void r.run(mark(4), 4, "slow");
    void r.run(mark(5), 4, "slow");
    r.bump("slow", -1, "fast");
    r.bump("a", -9);
    for (let n = 0; n < w.posted.length; n++) w.say({ t: "done", id: w.posted[n].id, out: [], ret: [] });
    expect(w.posted.map((m) => m.job.rs)).toEqual([1, 2, 4, 5, 3]);
    r.destroy();
  });
});


/* ---------- a glide frame touches only the cards that can be seen (carousel.ts) ---------- */
describe("carousel.ts: placeCards leaves hidden cards alone", () => {
  /** 14 cards with a duration chip each; every style write, class toggle and query is counted */
  async function frames() {
    const { syncCarousel } = await import("../../app/_landing/cosmos/engine/carousel.ts");
    const { carMetrics } = await import("../../app/_landing/cosmos/engine/layout.ts");
    const g = { W: 1280, H: 800, S: 800, DPR: 1, RS: 1, portrait: false };
    const st = { writes: 0, queries: 0 };
    const n = 14;
    const cards = Array.from({ length: n }, () => {
      const dur = { style: new Proxy({} as Record<string, unknown>, { set: (t, k, v) => (st.writes++, (t[k as string] = v), true) }) };
      const style = new Proxy({ setProperty: () => void st.writes++ } as Record<string, unknown>, { set: (t, k, v) => (st.writes++, (t[k as string] = v), true) });
      return {
        style,
        tabIndex: 0, setAttribute() {},
        classList: { toggle: () => void st.writes++ },
        querySelector: () => (st.queries++, dur),
      };
    });
    // key art on every template: no raster, so the frame is the pose and nothing else
    const list = cards.map((_c, i) => ({ id: "t" + i, label: "T" + i, type: "film", art: "/a.png" }));
    const cx = { g, RM: true, els: { typeView: { querySelector: () => null } }, CAR: { ...carMetrics(g, n), pos: 0, target: 0, cards, list, idx: 0, hov: null } };
    const frame = (pos: number) => {
      st.writes = st.queries = 0;
      syncCarousel(cx as never, pos);
      return { ...st };
    };
    return { frame, cards };
  }

  test("a steady frame queries no chip and writes only to the cards that are visible", async () => {
    const { frame, cards } = await frames();
    frame(0); // the first frame poses every card and finds every chip
    const steady = frame(0);
    expect(steady.queries, "no card is searched for its chip again").toBe(0);
    const visible = cards.filter((c) => (c.style as { visibility?: string }).visibility !== "hidden").length;
    expect(visible, "only the near cards are visible").toBeLessThan(cards.length);
    // five style writes, a class toggle and the chip's opacity per visible card
    expect(steady.writes).toBe(visible * 7);
  });

  test("a card that comes back into view gets its pose, and the frame it turns hidden still writes", async () => {
    const { frame, cards } = await frames();
    frame(0);
    const far = cards[13].style as { opacity?: string; visibility?: string };
    expect(far.visibility).toBe("hidden");
    frame(0);
    const before = far.opacity;
    frame(10);
    expect(far.visibility, "glided to").toBe("visible");
    expect(far.opacity).not.toBe(before);
    const gone = cards[0].style as { visibility?: string };
    expect(gone.visibility, "the card left behind is hidden on the frame it leaves").toBe("hidden");
  });
});


/* ---------- a category hover forces one layout (library.ts) ---------- */
describe("library.ts: hotCat reads the area's box before it writes the hot classes", () => {
  const LAY = { dirty: false, layouts: 0 };
  const read = () => {
    if (LAY.dirty) LAY.layouts++;
    LAY.dirty = false;
  };
  /** a DomEl whose style, class and box reads are counted the way a browser's layout is */
  class LEl extends DomEl {
    constructor(tag: string) {
      super(tag);
      this.style = new Proxy(this.style, {
        set: (t, k, v) => ((LAY.dirty = true), (t[k as string] = v), true),
        get: (t, k) => (k === "setProperty" ? () => void (LAY.dirty = true) : t[k as string]),
      });
      for (const m of ["add", "remove", "toggle"] as const) {
        const f = this.classList[m] as (...a: never[]) => unknown;
        this.classList[m] = ((...a: never[]) => ((LAY.dirty = true), f(...a))) as never;
      }
    }
    get parentElement() {
      return this.parent;
    }
    getBoundingClientRect() {
      read();
      return super.getBoundingClientRect();
    }
    get offsetWidth(): number {
      read();
      return 0;
    }
    get offsetHeight(): number {
      read();
      return 0;
    }
  }

  test("hovering a tile from rest forces the one layout showBanner needs, not two", async () => {
    const root = shellDom();
    const was = DOC.createElement;
    DOC.createElement = (t: string) => new LEl(t);
    try {
      const { rebuildLib } = await import("../../app/_landing/cosmos/engine/library.ts");
      const cats = ["a", "b", "c"].map((id) => ({ id, label: "Category " + id, items: 3, art: `/presets/${id}.png` }));
      const fam = { id: "styles", label: "Styles", status: "live" as const, categories: cats };
      const banner = new LEl("div");
      for (const c of ["bn-name", "bn-meta", "bn-front", "bn-back"]) banner.appendChild(new LEl("div")).classes.add(c);
      const cx = {
        root,
        els: { libView: root.appendChild(new LEl("section")), banner },
        g: { W: 1280, H: 800, S: 800, DPR: 1, RS: 1, portrait: false },
        tier: "full",
        ST: { lv: "fam", type: null, tpl: null, fam: "styles", cat: null },
        famById: new Map([["styles", fam]]),
        famSorted: [],
        libTok: 0,
        raster: { drop() {}, run: () => new Promise(() => {}) },
      };
      rebuildLib(cx as never, "styles");
      const tile = cx.els.libView.querySelector(".cat") as unknown as { onpointerenter: () => void };
      expect(tile, "the sheet drew its tiles").toBeTruthy();
      LAY.dirty = false; // a frame has run since the build: the layout is clean
      LAY.layouts = 0;
      tile.onpointerenter();
      expect(LAY.layouts).toBe(1);
    } finally {
      DOC.createElement = was;
    }
  });
});
