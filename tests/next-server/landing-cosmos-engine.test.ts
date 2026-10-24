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
//
// raster.ts is loaded natively (ESM) because it spells `new URL(..., import.meta.url)`
// for the bundler, which the Playwright node lane cannot load as CommonJS.
import { afterEach, describe, expect, test } from "vitest";

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
});
