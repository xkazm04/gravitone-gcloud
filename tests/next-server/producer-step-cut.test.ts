// THE CUT PART'S ACTS AS KERNEL JOBS (Phase 4 wave C, L37): the animatic export (deriveTimeline ->
// compileCut -> ffmpeg) and the ads aspect render, each a receipt, a confirm and a job on
// box.render. Dry spawns nothing - the render is declared and answered by a stand-in; the mp4 lands
// as a BLOB on the part's record and no record ever holds a data: URL (the plates are handed to
// ffmpeg as data: URLs in memory only, for the call). A blocking finish check is refused first.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-step-cut-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "k.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { ok, type Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { list } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";

import type { CutDocument } from "../../lib/cut/cutDocument.ts";
import type { CutExportResult } from "../../lib/cutExport.ts";
import { partVerdict } from "../../lib/parts/verdict.ts";
import { cutProducer, cutUnits, type CutEngines } from "../../lib/producers/cut.ts";
import { blobRootOf, driveStep, effectsOf, jobBlobRoot, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
let kernel: Kernel | undefined;
afterAll(() => {
  kernel?.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function store(): Store {
  if (kernel === undefined) {
    const k = openKernel(path.join(ROOT, "k.sqlite"));
    if (!k.ok) throw k.error;
    kernel = k.value;
  }
  return kernel.store;
}
function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

/** One opaque PNG-typed blob: what a frames job lands as a plate. */
async function plateBlob(): Promise<BlobRef> {
  return must(await blobStore(blobRootOf(store())).put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]), "image/png"));
}
const unit = (id: string, startS: number, holdS: number, blob: BlobRef) => ({ id, sourceId: "r", beatRef: { at: `0:${String(startS).padStart(2, "0")}`, beatId: id }, ordinal: 1, ofBeat: 1, startS, holdS, kind: "shot", beatKind: "hook", title: id, line: "", plate: { state: "ready", blob }, clip: { status: "not-started", motion: "" }, elements: [], texts: [] });

function land(projectId: string, part: string, recs: Record<string, unknown>): void {
  must(writePart(store(), { projectId, partId: `${projectId}/${part}`, baseRev: "current", act: "land", op: { seed: part }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok(recs) }));
}

const ref = (projectId: string, act: string, target?: string) => ({ projectId, partId: `${projectId}/cut`, act, ...(target === undefined ? {} : { target }) });

async function run(projectId: string, act: string, o: { target?: string; live?: boolean; engines?: Partial<CutEngines> } = {}) {
  const mode = o.live === true ? "live" : "dry";
  const r = must(partActReceipt(store(), ref(projectId, act, o.target), cutUnits, { mode, now: NOW }));
  const l = must(launchPartAct(store(), ref(projectId, act, o.target), cutUnits, { mode, now: NOW, token: r.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  const report = must(await driveStep((lane, h) => cutProducer(lane, h, o.engines), store(), l.jobId, { dryOnly: o.live !== true }));
  return { jobId: l.jobId, receipt: r, report };
}

const recOf = (projectId: string, key: string) => must(readPart(store(), { projectId, partId: `${projectId}/cut` })).records.get(key) ?? {};
const noInlineBytes = (x: unknown): boolean => !JSON.stringify(x).includes("data:");

describe("cut acts are jobs with receipts", () => {
  it("an animatic exports dry: ffmpeg is declared, not spawned; the stand-in mp4 lands as a blob on the cut record", async () => {
    must(compose(store(), { recipe: "film/trailer" }, OP, { id: "c1" }));
    const blob = await plateBlob();
    land("c1", "frames", { frames: { units: [unit("u1", 0, 10, blob), unit("u2", 10, 10, blob)], renderId: "r" } });
    const { jobId, receipt, report } = await run("c1", "export-animatic");
    expect(receipt).toMatchObject({ mode: "dry", lines: [{ lane: "box.render", usd: 0 }] });
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.map((w) => `${w.provider}/${w.model}`)).toEqual(["ffmpeg/cut-export"]);
    const cut = recOf("c1", "cut");
    const ex = (cut["exports"] as { blob: BlobRef; mode: string; jobId: string }[])[0];
    expect(ex).toMatchObject({ mode: "dry", jobId, blob: { mime: "video/mp4" } });
    expect(await blobStore(blobRootOf(store())).has(ex?.blob ?? blob)).toBe(true);
    expect(noInlineBytes(cut)).toBe(true);
  });

  it("no picture is refused on the receipt in the work's words", () => {
    must(compose(store(), { recipe: "film/trailer" }, OP, { id: "c2" }));
    const r = partActReceipt(store(), ref("c2", "export-animatic"), cutUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("no picture to cut");
  });

  it("live through a fake ffmpeg: the plates reach the call as data: URLs and never the record; spend equals the meter", async () => {
    must(compose(store(), { recipe: "film/trailer" }, OP, { id: "c3" }));
    const blob = await plateBlob();
    land("c3", "frames", { frames: { units: [unit("u1", 0, 10, blob)], renderId: "r" } });
    let sent: CutDocument | undefined;
    const exportCut = async (doc: CutDocument): Promise<{ result: CutExportResult; bytes: Uint8Array }> => {
      sent = doc;
      return { result: { id: "11111111-2222-3333-4444-555555555555", encoder: "libx264", width: 1920, height: 1080, fps: 25, durationS: doc.totalS, drawn: "plates", unreachable: [], sidecar: { projectId: "c3", kind: "cut-animatic", document: "x", totalS: doc.totalS, finish: [], gaps: { picture: 0, audio: 0 } }, wallMs: 1, sizeBytes: 3 }, bytes: new Uint8Array([0, 0, 1]) };
    };
    const { jobId, report } = await run("c3", "export-animatic", { live: true, engines: { exportCut } });
    expect(report.outcome).toBe("done");
    const still = sent?.picture.find((p) => p.kind === "still");
    expect(still?.kind === "still" ? still.layers.plate.startsWith("data:image/png;base64,") : false).toBe(true);
    const cut = recOf("c3", "cut");
    expect(cut["exports"]).toMatchObject([{ exportId: "11111111-2222-3333-4444-555555555555", mode: "live" }]);
    expect(noInlineBytes(cut)).toBe(true);
    expect(must(store().read((r) => reconcileJobSpend(r, jobId))).drift).toBeUndefined();
  });

  it("an ads aspect: refused while a shot has no clip; rendered dry once every shot has one; the verdict reads it", async () => {
    must(compose(store(), { recipe: "film/ad-social-15" }, OP, { id: "a1" }));
    const scenario = { id: "sc-1", title: "Rain loses", logline: "the storm gives up", shots: [{ id: "sh-1", durationS: 5, image: "a rider", motion: "push in", super: null, parts: ["hook"], link: null, brandCue: true }], musicMood: "dry snare", endCard: { cta: "Pack one today", line: null } };
    land("a1", "script", { "ads-scenarios": { ideaId: "idea-1", options: [scenario], pickedId: "sc-1" } });
    land("a1", "frames", { "ads-shots": { scenarioId: "sc-1", shots: { "sh-1": { imageTakes: [], adoptedImage: null, clips: [], adoptedClip: null } } } });
    const blocked = partActReceipt(store(), ref("a1", "render-aspect", "9:16"), cutUnits, { mode: "dry", now: NOW });
    expect(blocked.ok ? "" : blocked.error.message).toBe("1 shot without a clip");
    land("a1", "frames", { "ads-shots": { scenarioId: "sc-1", shots: { "sh-1": { imageTakes: [], adoptedImage: null, clips: [{ id: "clip-1", clipId: "clip-1", durationS: 5 }], adoptedClip: "clip-1" } } } });
    const { report } = await run("a1", "render-aspect", { target: "9:16" });
    expect(report.job?.error?.message).toBeUndefined();
    expect(report.outcome).toBe("done");
    const finish = recOf("a1", "ads-finish");
    expect(finish["exports"]).toMatchObject([{ aspect: "9:16", mode: "dry", blob: { mime: "video/mp4" } }]);
    const snap = must(readPart(store(), { projectId: "a1", partId: "a1/cut" }));
    expect(partVerdict("cut", { projectId: "a1", title: "a1", discipline: "ads", targetS: 15, plansVoice: false, records: snap.records })).toMatchObject({ state: "ready", codes: [{ code: "exported" }] });
    expect(must(list(store())).filter((j) => j.of.id === "a1/cut").map((j) => [j.producer, j.lane, j.state])).toEqual([["cut", "box.render", "done"]]);
  });
});

describe("a part job reads the blobs of the store it runs on", () => {
  it("driven over a handed store while the process store is another: the plates it landed reach the call", async () => {
    // The job's store B sits in its own directory; GRAVITONE_STORE_PATH (the process store) is ROOT/k.sqlite.
    const dir = mkdtempSync(path.join(ROOT, "job-"));
    const k = openKernel(path.join(dir, "k.sqlite"));
    if (!k.ok) throw k.error;
    try {
      const b = k.value.store;
      expect(jobBlobRoot({ fx: effectsOf(b) })).toBe(blobRootOf(b));
      expect(blobRootOf(b)).not.toBe(blobRootOf(store()));
      must(compose(b, { recipe: "film/trailer" }, OP, { id: "j1" }));
      const blob = must(await blobStore(blobRootOf(b)).put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6]), "image/png"));
      must(writePart(b, { projectId: "j1", partId: "j1/frames", baseRev: "current", act: "land", op: { seed: "frames" }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok({ frames: { units: [unit("u1", 0, 10, blob)], renderId: "r" } }) }));
      let sent: CutDocument | undefined;
      const exportCut = async (doc: CutDocument): Promise<{ result: CutExportResult; bytes: Uint8Array }> => {
        sent = doc;
        return { result: { id: "11111111-2222-3333-4444-555555555556", encoder: "libx264", width: 1920, height: 1080, fps: 25, durationS: doc.totalS, drawn: "plates", unreachable: [], sidecar: { projectId: "j1", kind: "cut-animatic", document: "x", totalS: doc.totalS, finish: [], gaps: { picture: 0, audio: 0 } }, wallMs: 1, sizeBytes: 3 }, bytes: new Uint8Array([0, 0, 1]) };
      };
      const r = must(partActReceipt(b, ref("j1", "export-animatic"), cutUnits, { mode: "live", now: NOW }));
      const l = must(launchPartAct(b, ref("j1", "export-animatic"), cutUnits, { mode: "live", now: NOW, token: r.token, actor: OP, dryOnly: false }));
      if (l.kind !== "launched") throw new Error("stale");
      const report = must(await driveStep((lane, h) => cutProducer(lane, h, { exportCut }), b, l.jobId, { dryOnly: false }));
      expect(report.outcome).toBe("done");
      const still = sent?.picture.find((p) => p.kind === "still");
      expect(still?.kind === "still" ? still.layers.plate.startsWith("data:image/png;base64,") : false).toBe(true);
    } finally {
      k.value.close();
    }
  });
});
