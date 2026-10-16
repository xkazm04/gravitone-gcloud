import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { FramesBoard, MotionBoard, PartView } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { RENDERS } from "../../lib/script/renders.ts";
import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";

// THE FRAMES AND MOTION PARTS (L39) over a kernel store, through the real part side: the units
// are derived from the chain Script ADOPTED in this project (never a fixture fallback), an edit
// is an op at its rev and ⌫ appends its inverse, a stale base answers the view as it is, a plate
// whose subject moved since it was rendered reads stale, and motion's accepted line is written
// onto the FRAMES record's units (v1 acceptIntoFramesRecord's rule: the units are the truth).

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
const PLATE = { sha256: "a".repeat(64), bytes: 7, mime: "image/png" };

function universe(id: string): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-frames-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe: "film/mid-educational-video" }, OP, { id });
  if (!c.ok) throw c.error;
  const port = makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } });
  return { store, port };
}

async function must<T>(p: Result<T> | Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
type Applied = { kind: "applied"; view: PartView } | { kind: "conflict"; current: PartView };
async function applied(r: Result<Applied> | Promise<Result<Applied>>): Promise<PartView> {
  const o = await must(r);
  if (o.kind !== "applied") throw new Error("expected applied, got conflict");
  return o.view;
}
const board = (v: PartView): FramesBoard => {
  if (v.kind !== "frames" || v.data.face === "takes") throw new Error(`not a frames board: ${v.kind}`);
  return v.data;
};

/** Script adopts the first shipped render: the chain Frames derives from (a job's write). */
function adopt(store: Store, id: string, adopted = true): string {
  const r = RENDERS[0];
  if (r === undefined) throw new Error("no shipped render");
  const w = writePart(store, {
    projectId: id,
    partId: `${id}/script`,
    baseRev: "current",
    act: "land",
    op: {},
    label: "compose",
    by: { kind: "machine", id: "job:test" },
    next: () => ok({ "script-versions": { notes: [], accepted: [], candidates: [r] }, "script-adopted": { renderId: adopted ? r.id : "" } }),
  });
  if (!w.ok) throw w.error;
  return r.id;
}

describe("frames over the kernel", () => {
  it("draws nothing until Script adopts a chain - no fixture fallback - then derives its units", async () => {
    const { store, port } = universe("p1");
    // Candidates composed, none adopted: still nothing (v1 fell back to RENDERS[0] here).
    adopt(store, "p1", false);
    const empty = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    expect(board(empty).units).toEqual([]);
    expect(board(empty).source).toBeNull();
    expect(empty.verdict).toMatchObject({ state: "empty", codes: [{ code: "no-units" }] });
    const chain = adopt(store, "p1");
    const v = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    const d = board(v);
    expect(d.face).toBe("assembly");
    expect(d.source?.id).toBe(chain);
    expect(d.units.length).toBeGreaterThan(3);
    expect(d.units.every((u) => u.id.startsWith(`${chain}:`))).toBe(true);
    expect(v.verdict.codes[0]).toMatchObject({ code: "plates-composed", text: `0 of ${d.units.length} plates composed` });
  });

  it("moves a layer as one op at its rev, answers a stale base with the part as it is, and ⌫ restores it", async () => {
    const { store, port } = universe("p1");
    adopt(store, "p1");
    const v0 = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    const unit = board(v0).units.find((u) => u.layers.length > 0);
    const layer = unit?.layers[0];
    if (unit === undefined || layer === undefined) throw new Error("no layered unit");
    const v1 = await applied(port.opPart({ projectId: "p1", key: "frames", baseRev: v0.rev, op: { op: "move-layer", unitId: unit.id, layer: layer.layer, layerId: layer.id, x: 61.24, y: 140 } }));
    const moved = board(v1)
      .units.find((u) => u.id === unit.id)
      ?.layers.find((l) => l.id === layer.id);
    // Clamped to the frame and rounded to a tenth (v1 useFrames.ts:597-605), stamped human.
    expect(moved).toMatchObject({ x: 61.2, y: 100, by: "human" });
    expect(v1.ops[0]?.label).toBe(`move ${layer.id}`);
    const stale = await must(port.opPart({ projectId: "p1", key: "frames", baseRev: v0.rev, op: { op: "hide-layer", unitId: unit.id, layer: layer.layer, layerId: layer.id, hidden: true } }));
    expect(stale.kind).toBe("conflict");
    const back = await applied(port.undoPart({ projectId: "p1", key: "frames", baseRev: v1.rev }));
    expect(
      board(back)
        .units.find((u) => u.id === unit.id)
        ?.layers.find((l) => l.id === layer.id),
    ).toMatchObject({ x: layer.x, y: layer.y });
  });

  it("binds a figure only to a fact this notebook holds, and refuses an unknown one", async () => {
    const { store, port } = universe("p1");
    adopt(store, "p1");
    const v0 = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    const unit = board(v0).units.find((u) => u.layers.some((l) => l.layer === "text"));
    const text = unit?.layers.find((l) => l.layer === "text");
    if (unit === undefined || text === undefined) throw new Error("no text");
    const r = await port.opPart({ projectId: "p1", key: "frames", baseRev: v0.rev, op: { op: "bind-fact", unitId: unit.id, textId: text.id, factId: "f-nowhere" } });
    expect(r.ok ? "" : r.error.message).toBe("f-nowhere is not a fact in this notebook");
  });

  it("reads a ready plate whose subject moved since it was rendered as stale, and holds READY back", async () => {
    const { store, port } = universe("p1");
    adopt(store, "p1");
    const v0 = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    const ids = board(v0).units.map((u) => u.id);
    // Every plate rendered (a job's landing), every figure bound: READY.
    const snap = await must(readPart(store, { projectId: "p1", partId: "p1/frames" }));
    void snap;
    const first = await applied(port.opPart({ projectId: "p1", key: "frames", baseRev: v0.rev, op: { op: "set-subject", unitId: ids[0] ?? "", subject: "a single tall bar on a plain ground line, alone" } }));
    const units = (await must(readPart(store, { projectId: "p1", partId: "p1/frames" }))).records.get("frames")?.["units"];
    if (!Array.isArray(units)) throw new Error("frames not stored");
    const plated = units.map((u: Record<string, unknown>) => ({ ...u, texts: [], plate: { state: "ready", blob: PLATE, subject: "s", renderedSubject: "s" } }));
    const w = writePart(store, {
      projectId: "p1",
      partId: "p1/frames",
      baseRev: "current",
      act: "land",
      op: {},
      label: "render",
      by: { kind: "machine", id: "job:test" },
      next: () => ok({ frames: { renderId: board(first).source?.id ?? "", units: plated } }),
    });
    if (!w.ok) throw w.error;
    const ready = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    expect(ready.verdict.state).toBe("ready");
    expect(board(ready).units[0]?.plate.url).toBe(`/api/blob/${PLATE.sha256}?type=image%2Fpng`);
    const edited = await applied(port.opPart({ projectId: "p1", key: "frames", baseRev: ready.rev, op: { op: "set-subject", unitId: ids[0] ?? "", subject: "two bars" } }));
    expect(board(edited).units[0]?.plate.stale).toBe(true);
    expect(edited.verdict).toMatchObject({ state: "working" });
    expect(edited.verdict.codes.map((c) => c.code)).toContain("plate-stale");
  });

  it("prices a per-plate render per target: a receipt read for one plate never confirms another", async () => {
    const { store, port } = universe("p1");
    adopt(store, "p1");
    const v0 = await must(port.loadPart({ projectId: "p1", key: "frames" }));
    const [a, b] = board(v0).units;
    if (a === undefined || b === undefined) throw new Error("two units");
    const ra = await must(port.actReceipt({ projectId: "p1", key: "frames", act: "render-plate", target: a.id }));
    const rb = await must(port.actReceipt({ projectId: "p1", key: "frames", act: "render-plate", target: b.id }));
    expect(ra.token).not.toBe(rb.token);
    expect(ra.mode).toBe("dry");
  });
});

describe("motion over the kernel", () => {
  it("writes an accepted line onto the frames record's unit, and ⌫ takes it back off", async () => {
    const { store, port } = universe("p2");
    adopt(store, "p2");
    const f = await must(port.loadPart({ projectId: "p2", key: "frames" }));
    const id = board(f).units[0]?.id ?? "";
    await applied(port.opPart({ projectId: "p2", key: "frames", baseRev: f.rev, op: { op: "set-clip-motion", unitId: id, motion: "" } }));
    const m0 = await must(port.loadPart({ projectId: "p2", key: "motion" }));
    if (m0.kind !== "motion" || m0.data.face !== "plates") throw new Error("not a motion board");
    const m1 = await applied(port.opPart({ projectId: "p2", key: "motion", baseRev: m0.rev, op: { op: "accept-motion", unitId: id, motion: "the bar rises slowly while the ground holds still" } }));
    const line = (m1.data as MotionBoard).units.find((u) => u.id === id)?.motion;
    expect(line).toBe("the bar rises slowly while the ground holds still");
    const stored = (await must(readPart(store, { projectId: "p2", partId: "p2/frames" }))).records.get("frames")?.["units"];
    expect(Array.isArray(stored) ? (stored.find((u: { id: string }) => u.id === id) as { clip: { motion: string } }).clip.motion : null).toBe(line);
    const back = await applied(port.undoPart({ projectId: "p2", key: "motion", baseRev: m1.rev }));
    expect((back.data as MotionBoard).units.find((u) => u.id === id)?.motion).toBe("");
  });

  it("refuses to accept where there is nothing to accept (a blank line is not a motion)", async () => {
    const { store, port } = universe("p3");
    adopt(store, "p3");
    const m0 = await must(port.loadPart({ projectId: "p3", key: "motion" }));
    const id = (m0.data as MotionBoard).units[0]?.id ?? "";
    const r = await port.opPart({ projectId: "p3", key: "motion", baseRev: m0.rev, op: { op: "accept-motion", unitId: id, motion: "   " } });
    expect(r.ok ? "" : r.error.message).toBe(`${id} has no proposal to accept`);
  });
});
