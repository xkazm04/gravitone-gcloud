// THE EXPORT ROW'S IDENTITY (lib/producers/cut.ts landCut -> _part/fixtureCut.ts fromRecords/exportView).
// The producer wrote an export with no `id` and no `label`, and the row read both: blank text, an undefined
// React key. It writes them now, and a record stored before that still draws.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cut-row-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "k.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { rmSync } from "node:fs";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { ok, type Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { CUT_KIND } from "../../app/(studio)/projects/[id]/_part/fixtureCut.ts";
import { cutProducer, cutUnits } from "../../lib/producers/cut.ts";
import { blobRootOf, driveStep, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-11-08T09:00:00Z");
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
const unit = (id: string, startS: number, blob: BlobRef) => ({ id, sourceId: "r", beatRef: { at: `0:${String(startS).padStart(2, "0")}`, beatId: id }, ordinal: 1, ofBeat: 1, startS, holdS: 10, kind: "shot", beatKind: "hook", title: id, line: "", plate: { state: "ready", blob }, clip: { status: "not-started", motion: "" }, elements: [], texts: [] });

async function exportOnce(projectId: string): Promise<string> {
  const ref = { projectId, partId: `${projectId}/cut`, act: "export-animatic" };
  const r = must(partActReceipt(store(), ref, cutUnits, { mode: "dry", now: NOW }));
  const l = must(launchPartAct(store(), ref, cutUnits, { mode: "dry", now: NOW, token: r.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  const report = must(await driveStep((lane, h) => cutProducer(lane, h), store(), l.jobId, { dryOnly: true }));
  expect(report.outcome).toBe("done");
  return l.jobId;
}

describe("the export row", () => {
  it("a new record carries a unique id and the fixture side's label, and reads back with both", async () => {
    must(compose(store(), { recipe: "film/trailer" }, OP, { id: "r1" }));
    const blob = must(await blobStore(blobRootOf(store())).put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]), "image/png"));
    must(writePart(store(), { projectId: "r1", partId: "r1/frames", baseRev: "current", act: "land", op: { seed: "frames" }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok({ frames: { units: [unit("u1", 0, blob)], renderId: "r" } }) }));
    const j1 = await exportOnce("r1");
    const j2 = await exportOnce("r1");
    const recs = must(readPart(store(), { projectId: "r1", partId: "r1/cut" })).records;
    const stored = recs.get("cut")?.["exports"] as { id?: string; label?: string; exportId?: string; at?: string }[];
    console.log("[export-row] real record:", JSON.stringify(stored[0]));
    expect(stored.map((e) => e.id)).toEqual([j1, j2]);
    expect(stored.map((e) => e.label)).toEqual(["animatic 1", "animatic 2"]);
    const read = CUT_KIND.fromRecords(recs as never, undefined as never).exports;
    expect(read.map((e) => e.id)).toEqual([j1, j2]);
    expect(read[0]?.label).toBe("animatic 1");
    expect(read[0]?.at).toBe(Date.parse(stored[0]?.at ?? ""));
    // The fixture side writes the same shape: `export-N` and `animatic N`.
    console.log("[export-row] fixture record:", JSON.stringify({ id: "export-1", at: NOW, mode: "dry", label: "animatic 1", hash: "…" }));
  });

  it("a record stored before id and label existed still draws, stably", () => {
    const old = { blob: { sha256: "a".repeat(64), bytes: 3, mime: "video/mp4" }, document: "doc-1", totalS: 20, exportId: "dry-doc-1", unreachable: [], at: "2026-11-01T09:00:00.000Z", jobId: "job-77", mode: "dry" };
    const older = { ...old, jobId: undefined, exportId: undefined, at: "2026-11-02T09:00:00.000Z" };
    const recs = new Map([["cut", { offsets: {}, exports: [old, older] }]]);
    const first = CUT_KIND.fromRecords(recs as never, undefined as never).exports;
    const again = CUT_KIND.fromRecords(recs as never, undefined as never).exports;
    expect(first.map((e) => e.id)).toEqual(["job-77", "export-2"]);
    expect(first.map((e) => e.label)).toEqual(["animatic 1", "animatic 2"]);
    expect(first.every((e) => e.id !== undefined && e.label !== "")).toBe(true);
    expect(again).toEqual(first);
    expect(first[0]?.hash).toBe("doc-1");
    expect(first[0]?.at).toBe(Date.parse("2026-11-01T09:00:00.000Z"));
  });
});
