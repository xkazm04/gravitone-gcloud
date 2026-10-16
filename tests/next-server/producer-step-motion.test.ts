// THE MOTION PART ACTS AS KERNEL JOBS (Phase 4 wave C, L37): direction reads the plate from the
// blob store by its content address (v1 posted it as base64), both recognize passes are declared
// calls, a decline lands as the work's own sentence and moves the verdict, a clip lands as a blob;
// the Wan option runs dry end to end and refuses LIVE with its sentence.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { get } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { LIVE_MOTION, motionProducer, motionUnits, type MotionEngines } from "../../lib/producers/motion.ts";
import { driveStep, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";
import { partVerdict } from "../../lib/parts/verdict.ts";
import type { Recognition } from "../../lib/imaging/types.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function universe(id: string, motions: readonly string[]): Promise<{ store: Store; blobs: BlobStore }> {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-step-motion-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const blobs = blobStore(path.join(dir, "blobs"));
  const blob = must(await blobs.put(new Uint8Array(PIXEL), "image/png"));
  must(compose(store, { recipe: "film/short-educational-video" }, OP, { id }));
  const units = motions.map((m, i) => ({ id: `u${i + 1}`, sourceId: "r1", beatRef: { at: `0:0${i}` }, ordinal: 1, ofBeat: 1, startS: i * 5, holdS: 5, kind: "beat", beatKind: "hook", title: "t", line: "l", plate: { state: "ready", blob, subject: "a quiet plate", renderedSubject: "a quiet plate" }, clip: { status: "not-started", motion: m }, elements: [], texts: [] }));
  must(writePart(store, { projectId: id, partId: `${id}/frames`, baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "test" }, next: () => ok({ frames: { units, renderId: "r1" } }) }));
  return { store, blobs };
}

async function act(store: Store, id: string, a: string, o: { target?: string; live?: boolean } = {}): Promise<string> {
  const ref = { projectId: id, partId: `${id}/motion`, act: a, ...(o.target === undefined ? {} : { target: o.target }) };
  const mode = o.live === true ? "live" : "dry";
  const r = must(partActReceipt(store, ref, motionUnits, { mode, now: NOW }));
  const l = must(launchPartAct(store, ref, motionUnits, { mode, now: NOW, token: r.token, actor: OP, dryOnly: o.live !== true }));
  if (l.kind !== "launched") throw new Error("stale");
  return l.jobId;
}

const records = (store: Store, id: string) => must(readPart(store, { projectId: id, partId: `${id}/motion` })).records;
const verdict = (store: Store, id: string) => partVerdict("motion", { projectId: id, title: id, discipline: "educational", targetS: null, plansVoice: false, records: records(store, id) });

describe("direct motion", () => {
  it("dry: two declared recognize passes per plate, a proposal landed against the plate's digest", async () => {
    const { store, blobs } = await universe("m1", ["", ""]);
    const run = must(await driveStep((lane, hooks) => motionProducer(lane, hooks, LIVE_MOTION, blobs), store, await act(store, "m1", "direct-motion"), { dryOnly: true }));
    expect(run.outcome).toBe("done");
    expect(run.wouldCalls?.map((w) => w.model)).toEqual(["recognize", "recognize", "recognize", "recognize"]);
    const by = (records(store, "m1").get("motion-direction") as { byFrame: Record<string, { outcome: { kind: string; motion?: string }; plate: string }> }).byFrame;
    expect(by["u1"]).toMatchObject({ outcome: { kind: "proposed", motion: expect.stringContaining("drifting shape") } });
    expect(by["u1"]?.plate).toMatch(/^[0-9a-f]{64}$/);
  });

  it("live: a plate with nothing separable is DECLINED with the work's sentence, one pass bought, and the verdict counts it", async () => {
    const { store, blobs } = await universe("m2", [""]);
    let passes = 0;
    const eng: MotionEngines = {
      ...LIVE_MOTION,
      recognize: async (): Promise<Recognition> => {
        passes++;
        return { text: "{}", json: { scene: "fog", elements: [], grounded: false }, provenance: { provider: "google", model: "fake-read", modelBasis: "requested", durationMs: 1, costUsd: 0.001, costBasis: "vendor-reported" } } as Recognition;
      },
    };
    const run = must(await driveStep((lane, hooks) => motionProducer(lane, hooks, eng, blobs), store, await act(store, "m2", "direct-motion", { target: "u1", live: true }), { dryOnly: false }));
    expect(run.outcome).toBe("done");
    expect(passes).toBe(1);
    const by = (records(store, "m2").get("motion-direction") as { byFrame: Record<string, { outcome: { kind: string; reason?: string } }> }).byFrame;
    expect(by["u1"]?.outcome).toMatchObject({ kind: "declined", reason: "no separable element: nothing in the plate can move on its own" });
    expect(verdict(store, "m2")).toMatchObject({ state: "ready", codes: [{ code: "motion-directed", text: "0 moving · 1 declined of 1" }] });
  });
});

describe("render clip", () => {
  it("dry on the Wan option: the clip lands as a blob on its unit", async () => {
    const { store, blobs } = await universe("m3", ["the shape eases right"]);
    must(await driveStep((lane, hooks) => motionProducer(lane, hooks, LIVE_MOTION, blobs), store, await act(store, "m3", "render-clip", { target: "u1" }), { dryOnly: true }));
    const fr = records(store, "m3").get("frames") as { units: { clip: Record<string, unknown> }[] };
    expect(fr.units[0]?.clip).toMatchObject({ status: "rendered", motion: "the shape eases right", blob: { mime: "video/mp4" } });
  });

  it("LIVE on the Wan option is refused with its sentence, and nothing lands", async () => {
    const { store, blobs } = await universe("m4", ["the shape eases right"]);
    const jobId = await act(store, "m4", "render-clip", { target: "u1", live: true });
    const run = must(await driveStep((lane, hooks) => motionProducer(lane, hooks, LIVE_MOTION, blobs), store, jobId, { dryOnly: false }));
    expect(run.outcome).toBe("failed");
    expect(must(get(store, jobId as never)).job.error?.message).toBe("no app path renders a Wan i2v clip from a plate yet (pipeline/video/render_preset_clips.py renders presets only)");
    const fr = records(store, "m4").get("frames") as { units: { clip: Record<string, unknown> }[] };
    expect(fr.units[0]?.clip["blob"]).toBeUndefined();
  });

  it("a clip for a plate with no accepted motion is refused on the receipt", async () => {
    const { store } = await universe("m5", [""]);
    const r = partActReceipt(store, { projectId: "m5", partId: "m5/motion", act: "render-clip", target: "u1" }, motionUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("u1 has no accepted motion");
  });
});
