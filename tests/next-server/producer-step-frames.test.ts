// THE FRAMES PART ACTS AS KERNEL JOBS (Phase 4 wave C, L37): a receipt priced from the act's own
// units, its confirm, the job driven on the part's lane, the plates landed as BLOBS in the frames
// record (no data: URL), the verdict moved; a crash mid-batch resumes without re-buying a booked
// plate (v1 extract's never-re-spend, per plate); a refusal lands on its unit; the direction pass
// lands as a proposal, never applied.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { get, list, retry } from "@gt/kernel/job";
import { recover } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";

import { framesProducer, framesUnits, type ImagingEngines } from "../../lib/producers/frames.ts";
import { driveStep, effectsOf, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";
import { partVerdict } from "../../lib/parts/verdict.ts";
import { ImagingError } from "../../lib/imaging/errors.ts";
import type { GenerateRequest, GeneratedImages } from "../../lib/imaging/types.ts";

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

const unit = (id: string, at: string, plate: Record<string, unknown> = { state: "empty" }) => ({
  id,
  sourceId: "r1",
  beatRef: { at },
  ordinal: 1,
  ofBeat: 1,
  startS: 0,
  holdS: 5,
  kind: "beat",
  beatKind: "hook",
  title: `beat ${id}`,
  line: "a line",
  plate: { subject: `a wide quiet field of soft grey shapes, ${id}`, ...plate },
  clip: { status: "not-started", motion: "" },
  elements: [],
  texts: [],
});

function universe(id: string, units: unknown[]): { store: Store; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-step-frames-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  must(compose(store, { recipe: "film/short-educational-video" }, OP, { id }));
  must(writePart(store, { projectId: id, partId: `${id}/frames`, baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "test" }, next: () => ok({ frames: { units, renderId: "r1" } }) }));
  return { store, dir };
}

const framesOf = (store: Store, id: string) => must(readPart(store, { projectId: id, partId: `${id}/frames` })).records.get("frames") as { units: { id: string; plate: Record<string, unknown> }[]; proposal?: { units: unknown[] }; direction?: { runs: number } };

const verdictOf = (store: Store, id: string) =>
  partVerdict("frames", { projectId: id, title: id, discipline: "educational", targetS: null, plansVoice: false, records: must(readPart(store, { projectId: id, partId: `${id}/frames` })).records });

async function confirm(store: Store, id: string, act: string, o: { target?: string; live?: boolean } = {}): Promise<string> {
  const ref = { projectId: id, partId: `${id}/frames`, act, ...(o.target === undefined ? {} : { target: o.target }) };
  const mode = o.live === true ? "live" : "dry";
  const r = must(partActReceipt(store, ref, framesUnits, { mode, now: NOW }));
  const l = must(launchPartAct(store, ref, framesUnits, { mode, now: NOW, token: r.token, actor: OP, dryOnly: o.live !== true }));
  if (l.kind !== "launched") throw new Error("stale");
  return l.jobId;
}

describe("render plates", () => {
  it("a dry batch renders every empty plate as a blob ref (no data: URL), books would-calls and spends nothing; the verdict reads READY", async () => {
    const { store } = universe("fx", [unit("u1", "0:00"), unit("u2", "0:05"), unit("u3", "0:10")]);
    expect(verdictOf(store, "fx")).toMatchObject({ state: "empty" });
    const r = must(partActReceipt(store, { projectId: "fx", partId: "fx/frames", act: "render-plates" }, framesUnits, { mode: "dry", now: NOW }));
    expect(r).toMatchObject({ mode: "dry", subject: { kind: "part", act: "render-plates" }, lines: [{ lane: "gpu.local", units: 1 }] });
    const jobId = await confirm(store, "fx", "render-plates");
    const run = must(await driveStep(framesProducer, store, jobId, { dryOnly: true }));
    expect(run.outcome).toBe("done");
    expect(run.wouldCalls?.length).toBe(3);
    const fr = framesOf(store, "fx");
    for (const u of fr.units) {
      expect(u.plate).toMatchObject({ state: "ready", blob: { mime: "image/png" } });
      expect(u.plate["src"]).toBeUndefined();
      const blob = u.plate["blob"] as { sha256: string; bytes: number; mime: string };
      expect(must(await blobStore(path.join(path.dirname(store.location), "blobs")).read(blob)).byteLength).toBe(blob.bytes);
    }
    expect(verdictOf(store, "fx")).toMatchObject({ state: "ready", codes: [{ code: "plates-composed", text: "3 of 3 plates composed" }] });
    expect(must(get(store, jobId as never)).job.spend.usd).toBe(0);
  });

  it("a stale token launches nothing; a single plate and an alternative land on their unit", async () => {
    const { store } = universe("fy", [unit("u1", "0:00"), unit("u2", "0:05")]);
    const stale = must(launchPartAct(store, { projectId: "fy", partId: "fy/frames", act: "render-plate", target: "u2" }, framesUnits, { mode: "dry", now: NOW, token: "nope", actor: OP }));
    expect(stale.kind).toBe("stale");
    expect(must(list(store))).toEqual([]);
    must(await driveStep(framesProducer, store, await confirm(store, "fy", "render-plate", { target: "u2" }), { dryOnly: true }));
    expect(framesOf(store, "fy").units.map((u) => u.plate["state"])).toEqual(["empty", "ready"]);
    must(await driveStep(framesProducer, store, await confirm(store, "fy", "render-alternative", { target: "u2" }), { dryOnly: true }));
    const alts = must(readPart(store, { projectId: "fy", partId: "fy/frames" })).records.get("frames-alts") as { byFrame: Record<string, { alts: { plate: { blob?: unknown } }[] }> };
    expect(alts.byFrame["u2"]?.alts[0]?.plate.blob).toBeDefined();
  });

  it("LIVE, a crash after the second plate was booked resumes at the third: no plate is bought twice, spend reconciles to the meter", async () => {
    const { store } = universe("fz", [unit("u1", "0:00"), unit("u2", "0:05"), unit("u3", "0:10")]);
    const asked: string[] = [];
    const CRASH = { crash: true };
    let crashOn: string | null = "u3";
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const eng: ImagingEngines = {
      generate: async (req: GenerateRequest): Promise<GeneratedImages> => {
        const which = /u\d/.exec(req.prompt)?.[0] ?? "?";
        if (which === crashOn) {
          crashOn = null;
          throw CRASH; // a process death: not an Error, so nothing records it
        }
        asked.push(which);
        return { images: [{ base64: pixel, mime: "image/png" }], provenance: { provider: "google", model: "fake-image", modelBasis: "requested", durationMs: 1, costUsd: 0.04, costBasis: "vendor-reported" } as GeneratedImages["provenance"] };
      },
      recognize: async () => {
        throw new Error("not asked");
      },
    };
    const first: Holder = { bootId: "a", pid: 7001, host: "box" };
    const second: Holder = { bootId: "b", pid: 7002, host: "box" };
    const jobId = await confirm(store, "fz", "render-plates", { live: true });
    await expect(driveStep((lane, hooks) => framesProducer(lane, hooks, eng), store, jobId, { dryOnly: false, run: { holder: first, alive: () => true } })).rejects.toBe(CRASH);
    expect(asked).toEqual(["u1", "u2"]);
    must(recover(effectsOf(store), { holder: second, alive: () => false }));
    expect(must(get(store, jobId as never)).job).toMatchObject({ state: "interrupted", interruption: { stage: "unit:plate:u3" } });
    must(retry(store, jobId as never, OP));
    const run = must(await driveStep((lane, hooks) => framesProducer(lane, hooks, eng), store, jobId, { dryOnly: false, run: { holder: second, alive: (pid) => pid !== first.pid } }));
    expect(run.outcome).toBe("done");
    expect(asked).toEqual(["u1", "u2", "u3"]);
    const rec = must(store.read((r) => reconcileJobSpend(r, jobId)));
    expect(rec.drift).toBeUndefined();
    expect(rec.job.usd).toBeCloseTo(0.12, 6);
  });

  it("LIVE, a vendor refusal lands on its plate and the batch goes on; the verdict says blocked by the refusal", async () => {
    const { store } = universe("fr", [unit("u1", "0:00"), unit("u2", "0:05")]);
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const eng: ImagingEngines = {
      generate: async (req) => {
        if (req.prompt.includes("u1")) throw new ImagingError("the vendor's safety layer declined this plate", "refused", "google");
        return { images: [{ base64: pixel, mime: "image/png" }], provenance: { provider: "google", model: "fake", modelBasis: "requested", durationMs: 1, costUsd: 0.04, costBasis: "vendor-reported" } as GeneratedImages["provenance"] };
      },
      recognize: async () => {
        throw new Error("not asked");
      },
    };
    const jobId = await confirm(store, "fr", "render-plates", { live: true });
    const run = must(await driveStep((lane, hooks) => framesProducer(lane, hooks, eng), store, jobId, { dryOnly: false }));
    expect(run.outcome).toBe("done");
    expect(framesOf(store, "fr").units.map((u) => [u.plate["state"], u.plate["note"]])).toEqual([
      ["refused", "the vendor's safety layer declined this plate"],
      ["ready", undefined],
    ]);
    expect(verdictOf(store, "fr")).toMatchObject({ state: "blocked", codes: [{ code: "plate-refused" }] });
  });
});

describe("direct the cut", () => {
  it("a dry pass lands a PROPOSAL and its spend; nothing on the units is applied", async () => {
    const { store } = universe("fd", [unit("u1", "0:00"), unit("u2", "0:05")]);
    const before = framesOf(store, "fd").units;
    must(await driveStep(framesProducer, store, await confirm(store, "fd", "direct-cut"), { dryOnly: true }));
    const fr = framesOf(store, "fd");
    expect(fr.proposal?.units.length).toBe(2);
    expect(fr.direction?.runs).toBe(1);
    expect(fr.units).toEqual(before);
  });

  it("an act the part cannot do is refused on its receipt, before anything is priced to run", () => {
    const { store } = universe("fe", [unit("u1", "0:00", { state: "ready", blob: { sha256: "a".repeat(64), bytes: 1, mime: "image/png" }, renderedSubject: "a wide quiet field of soft grey shapes, u1" })]);
    const r = partActReceipt(store, { projectId: "fe", partId: "fe/frames", act: "render-plates" }, framesUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("every plate is composed");
  });
});
