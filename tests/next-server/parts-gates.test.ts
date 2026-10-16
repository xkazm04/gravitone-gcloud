import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import { packetIdSchema } from "@gt/domain/ids";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { applyNext } from "@gt/kernel/decision/apply";
import { commit } from "@gt/kernel/decision/commit";
import { patchMany } from "@gt/kernel/decision/driver";
import { currentDecisions } from "@gt/kernel/decision/read";
import { loadJob, putJob } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { launchProject, planReceipt } from "@gt/kernel/records/launch";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { applyEffects } from "../../lib/decision/v1/applier.ts";
import { projectRead } from "../../lib/parts/context.ts";
import { makeStepAdapter, openReadyGates, type GateDeps } from "../../lib/parts/gates.ts";

// A GATE IS A BOARD PACKET (L36, COMMON decision 10): it opens only on a READY part, its commit
// binds to the part's records as previewed, ratifies the gate, and its apply releases the jobs
// the plan held behind it.

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
const AUTHOR = { by: "operator", surface: "board", who: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

async function launched(): Promise<{ store: Store; deps: GateDeps; blobs: BlobStore; plate: BlobRef }> {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-gates-"));
  dirs.push(dir);
  const k = must(openKernel(path.join(dir, "k.sqlite")));
  open.push(k);
  const store = k.store;
  const blobs = blobStore(path.join(dir, "blobs"));
  const c = compose(store, { recipe: "film/trailer" }, OP, { id: "p1" });
  if (!c.ok) throw c.error;
  const receipt = must(planReceipt(store, "p1", { mode: "dry" }, { now: NOW }));
  const l = launchProject(store, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, { now: NOW, dryOnly: true });
  if (!l.ok) throw l.error;
  for (const part of ["research", "script", "frames"]) must(store.tx((t) => putJob(t, { ...loadJob(t, `job:part:p1/${part}`).job, state: "done" })));
  const plate = must(await blobs.put(new Uint8Array([137, 80, 78, 71, 1, 2, 3]), "image/png"));
  return { store, blobs, plate, deps: { store: () => ok(store), blobs: () => blobs, now: () => NOW } };
}

const unit = (id: string, plate: Record<string, unknown>, startS: number) => ({
  id, sourceId: "cut-1", beatRef: { at: `0:${startS}` }, ordinal: 1, ofBeat: 1, startS, holdS: 15, kind: "beat", beatKind: "hook", title: id, line: "", plate, clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});
const FRAMES = { projectId: "p1", partId: "p1/frames" };
const setFrames = (s: Store, baseRev: number, units: readonly unknown[]) =>
  must(writePart(s, { ...FRAMES, baseRev, act: "op", op: {}, label: "plates", by: OP, next: () => ok({ frames: { renderId: "cut-1", units } }) }));

const gateState = (s: Store, id: string) => must(s.read((r) => projectRead(r, "p1", NOW).plan.parts.find((p) => p.id === id)?.state));
const motionJob = (s: Store) => must(s.read((r) => loadJob(r, "job:part:p1/motion"))).job.state;

describe("the frames gate as a step packet", () => {
  it("opens nothing while frames is not READY, and the adapter says why in the verdict's words", async () => {
    const { store, deps, plate } = await launched();
    setFrames(store, 1, [unit("u1", { state: "ready", blob: plate }, 0), unit("u2", { state: "empty" }, 15)]);
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual([]);
    const a = makeStepAdapter(deps);
    const v1 = must(await a.read({ runId: "p1/gate:frames" }));
    const p = a.packet(v1);
    expect(p.ok ? "" : p.error.message).toBe("frames is working: 1 of 2 plates composed");
    expect(gateState(store, "p1/gate:frames")).toBe("awaiting_gate");
  });

  it("opens on READY, refuses a commit over records that moved since the preview, ratifies on commit and releases motion", async () => {
    const { store, deps, plate } = await launched();
    setFrames(store, 1, [unit("u1", { state: "ready", blob: plate }, 0), unit("u2", { state: "ready", blob: plate }, 15)]);
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual(["pkt:step:p1/gate:frames"]);
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual([]);
    const packetId = must(parseAt("id", packetIdSchema, "pkt:step:p1/gate:frames"));
    const keep = must(store.tx((t) => patchMany(t, { ...AUTHOR, packetId, baseRev: 0, changes: [{ key: "pkt:step:p1/gate:frames::u1", verdict: "keep" }, { key: "pkt:step:p1/gate:frames::u2", verdict: "keep" }] })));
    if (!keep.ok) throw keep.error;
    const a = makeStepAdapter(deps);
    const preview = async () => {
      const v1 = must(await a.read({ runId: "p1/gate:frames" }));
      const at = must(store.read((r) => currentDecisions(r, packetId)));
      return must(a.consequence(v1, { packetId, rev: at.rev, decisions: at.decisions }));
    };
    const shown = await preview();
    // The part moves after the operator saw the blast radius: a subject edit on u2.
    setFrames(store, 2, [unit("u1", { state: "ready", blob: plate }, 0), unit("u2", { state: "ready", blob: plate, subject: "a harbour at dusk" }, 15)]);
    const moved = await preview();
    const commitWith = (token: string, v1Digest: string) => {
      const r = store.tx((t) => commit(t, { ...AUTHOR, packetId, ticket: "t1", token, v1Digest }));
      return r.ok ? r.value : r;
    };
    const refused = commitWith(shown.consequence.token, moved.v1Digest);
    expect(refused.ok ? "" : refused.error.detail).toBe("stale-preview");
    expect(gateState(store, "p1/gate:frames")).toBe("awaiting_gate");
    must(commitWith(moved.consequence.token, moved.v1Digest));
    expect(gateState(store, "p1/gate:frames")).toBe("ratified");
    expect(motionJob(store)).toBe("planned");
    const delivered = await applyNext(applyEffects(store), { holder: "test", apply: (claim) => a.apply(claim) });
    expect(delivered?.result).toBe("applied");
    expect(motionJob(store)).toBe("queued");
    expect(gateState(store, "p1/gate:score")).toBe("queued");
  });
});

