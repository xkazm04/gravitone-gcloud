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
import { currentDecisions, readPacket } from "@gt/kernel/decision/read";
import { list, loadJob, putJob } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { launchProject, planReceipt } from "@gt/kernel/records/launch";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { applyEffects } from "../../lib/decision/v1/applier.ts";
import { projectRead, verdictInput } from "../../lib/parts/context.ts";
import { latestAttempt, makeStepAdapter, openReadyGates, splitAttempt, type GateDeps } from "../../lib/parts/gates.ts";
import { partVerdict } from "../../lib/parts/verdict.ts";

// THE FRAMES GATE AS A CULL OF ITS PLATES, AND THE SCORE GATE AS A PICK (L39, the Director's
// rulings): a REJECTED plate is marked `rejected` in the frames record by the packet's apply (a
// re-render is owed, the verdict leaves READY, nothing is released), the gate reopens on the
// next READY as a NEW packet `pkt:step:<gate>#2`, and that attempt, kept whole, ratifies and
// releases. A pick keeps one take per cue: two keeps in one row are refused at the preview.

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

async function launched(): Promise<{ store: Store; deps: GateDeps; blobs: BlobStore }> {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-cull-"));
  dirs.push(dir);
  const k = must(openKernel(path.join(dir, "k.sqlite")));
  open.push(k);
  const store = k.store;
  const blobs = blobStore(path.join(dir, "blobs"));
  must(compose(store, { recipe: "film/trailer" }, OP, { id: "p1" }));
  const receipt = must(planReceipt(store, "p1", { mode: "dry" }, { now: NOW }));
  must(launchProject(store, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, { now: NOW, dryOnly: true }));
  for (const part of ["research", "script", "frames"]) must(store.tx((t) => putJob(t, { ...loadJob(t, `job:part:p1/${part}`).job, state: "done" })));
  return { store, blobs, deps: { store: () => ok(store), blobs: () => blobs, now: () => NOW } };
}

const png = async (b: BlobStore, n: number): Promise<BlobRef> => must(await b.put(new Uint8Array([137, 80, 78, 71, n]), "image/png"));
const unit = (id: string, plate: Record<string, unknown>, startS: number) => ({
  id,
  sourceId: "cut-1",
  beatRef: { at: `0:${startS}` },
  ordinal: 1,
  ofBeat: 1,
  startS,
  holdS: 15,
  kind: "beat",
  beatKind: "hook",
  title: id,
  line: "",
  plate,
  clip: { status: "not-started", motion: "" },
  elements: [],
  texts: [],
});
const land = (s: Store, partId: string, next: Record<string, unknown>) =>
  must(writePart(s, { projectId: "p1", partId, baseRev: "current", act: "land", op: {}, label: "job", by: { kind: "machine", id: "job:test" }, next: () => ok(next) }));
const pid = (id: string) => must(parseAt("id", packetIdSchema, id));
const motionJob = (s: Store) => must(s.read((r) => loadJob(r, "job:part:p1/motion"))).job.state;
/** Every job of the project and its state: what a gate's apply may move, read whole. */
const jobStates = (s: Store) => Object.fromEntries(must(list(s)).map((j) => [j.id, j.state]));

async function decideAndCommit(store: Store, deps: GateDeps, packet: string, verdicts: Readonly<Record<string, "keep" | "reject">>) {
  const packetId = pid(packet);
  const changes = Object.entries(verdicts).map(([c, verdict]) => ({ key: `${packet}::${c}`, verdict }));
  const base = must(store.read((r) => currentDecisions(r, packetId))).rev;
  must(must(store.tx((t) => patchMany(t, { ...AUTHOR, packetId, baseRev: base, changes }))));
  const a = makeStepAdapter(deps);
  const v1 = must(await a.read({ runId: packet.slice("pkt:step:".length) }));
  const at = must(store.read((r) => currentDecisions(r, packetId)));
  const preview = a.consequence(v1, { packetId, rev: at.rev, decisions: at.decisions });
  if (!preview.ok) return preview;
  must(store.tx((t) => commit(t, { ...AUTHOR, packetId, ticket: `t-${packet}`, token: preview.value.consequence.token, v1Digest: preview.value.v1Digest })));
  const delivered = await applyNext(applyEffects(store), { holder: "test", apply: (claim) => a.apply(claim) });
  return ok({ preview: preview.value, delivered: delivered?.result });
}

describe("the frames gate is a cull of its plates", () => {
  it("opens as a matrix cull whose candidates are the plates, each fetchable from the blob route", async () => {
    const { store, deps, blobs } = await launched();
    const [a, b] = [await png(blobs, 1), await png(blobs, 2)];
    land(store, "p1/frames", { frames: { renderId: "cut-1", units: [unit("u1", { state: "ready", blob: a }, 0), unit("u2", { state: "ready", blob: b }, 15)] } });
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual(["pkt:step:p1/gate:frames"]);
    const p = must(store.read((r) => readPacket(r, "pkt:step:p1/gate:frames")));
    expect(p.mode).toBe("matrix-cull");
    expect(p.items.map((i) => [i.id, i.media.sha256])).toEqual([
      ["u1", a.sha256],
      ["u2", b.sha256],
    ]);
    const plan = makeStepAdapter(deps).packet(must(await makeStepAdapter(deps).read({ runId: "p1/gate:frames" })));
    expect(plan.ok ? plan.value.urls : {}).toEqual({ u1: `/api/blob/${a.sha256}?type=image%2Fpng`, u2: `/api/blob/${b.sha256}?type=image%2Fpng` });
  });

  it("a rejected plate is marked rejected, READY is left, nothing is released; the next READY opens attempt 2, which ratifies", async () => {
    const { store, deps, blobs } = await launched();
    const [a, b, c] = [await png(blobs, 1), await png(blobs, 2), await png(blobs, 3)];
    land(store, "p1/frames", { frames: { renderId: "cut-1", units: [unit("u1", { state: "ready", blob: a }, 0), unit("u2", { state: "ready", blob: b }, 15)] } });
    must(await openReadyGates(deps, "p1", AUTHOR));
    const held = jobStates(store);
    const first = must(await decideAndCommit(store, deps, "pkt:step:p1/gate:frames", { u1: "keep", u2: "reject" }));
    expect(first.delivered).toBe("applied");
    // A failed cull moves NO job: not the motion behind it, and not a part held behind another
    // fact that happens to read ratified now (here the score after the script, whose job this
    // fixture finished by hand) - releasing those is the job of the act that ratified them.
    expect(jobStates(store)).toEqual(held);
    expect(first.preview.consequence.writes).toEqual([{ kind: "index-row", target: "frames · u2", candidate: "u2", detail: "rejected — a re-render is owed" }]);
    const units = must(readPart(store, { projectId: "p1", partId: "p1/frames" })).records.get("frames")?.["units"];
    expect(Array.isArray(units) ? units[1] : null).toMatchObject({ plate: { state: "empty", rejected: { packetId: "pkt:step:p1/gate:frames", blob: b } } });
    expect(Array.isArray(units) ? units[0] : null).toMatchObject({ plate: { state: "ready", blob: a } });
    const snap = must(readPart(store, { projectId: "p1", partId: "p1/frames" }));
    const verdict = must(store.read((r) => partVerdict("frames", verdictInput(projectRead(r, "p1", NOW), snap))));
    expect(verdict).toMatchObject({ state: "working", codes: [{ code: "plates-composed", text: "1 of 2 plates composed" }] });
    expect(motionJob(store)).toBe("planned");
    expect(must(store.read((r) => latestAttempt(r, "p1/gate:frames")))).toMatchObject({ attempt: 1, state: "failed" });
    // Not READY: nothing reopens. A re-render lands (a new blob): READY again, attempt 2 opens.
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual([]);
    land(store, "p1/frames", { frames: { renderId: "cut-1", units: [unit("u1", { state: "ready", blob: a }, 0), unit("u2", { state: "ready", blob: c }, 15)] } });
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual(["pkt:step:p1/gate:frames#2"]);
    expect(must(await openReadyGates(deps, "p1", AUTHOR))).toEqual([]);
    const second = must(await decideAndCommit(store, deps, "pkt:step:p1/gate:frames#2", { u1: "keep", u2: "keep" }));
    expect(second.delivered).toBe("applied");
    expect(must(store.read((r) => latestAttempt(r, "p1/gate:frames")))).toMatchObject({ attempt: 2, state: "ratified" });
    expect(motionJob(store)).toBe("queued");
  });

  it("splits a packet's run ref into its gate and attempt", () => {
    expect(splitAttempt("p1/gate:frames")).toEqual({ gatePartId: "p1/gate:frames", attempt: 1 });
    expect(splitAttempt("p1/gate:frames#3")).toEqual({ gatePartId: "p1/gate:frames", attempt: 3 });
  });
});

describe("the score gate is a pick", () => {
  it("rows are cues, candidates their takes; two keeps in one cue are refused, one keep becomes the take in use", async () => {
    const { store, deps, blobs } = await launched();
    const [t1, t2] = [await png(blobs, 7), await png(blobs, 8)];
    land(store, "p1/score", { score: { spots: [{ id: "c1", title: "the door", sceneIds: [], note: "", takeIds: ["t1", "t2"], activeTakeId: "t1", takeBlobs: { t1, t2 } }] } });
    const opened = must(await openReadyGates(deps, "p1", AUTHOR));
    expect(opened).toContain("pkt:step:p1/gate:score");
    const p = must(store.read((r) => readPacket(r, "pkt:step:p1/gate:score")));
    expect(p.items.map((i) => [i.id, i.row])).toEqual([
      ["c1/t1", "c1"],
      ["c1/t2", "c1"],
    ]);
    const both = await decideAndCommit(store, deps, "pkt:step:p1/gate:score", { "c1/t1": "keep", "c1/t2": "keep" });
    expect(both.ok ? "" : both.error.message).toBe("the door: a cue keeps one take");
    const one = must(await decideAndCommit(store, deps, "pkt:step:p1/gate:score", { "c1/t1": "reject", "c1/t2": "keep" }));
    expect(one.delivered).toBe("applied");
    const spots = must(readPart(store, { projectId: "p1", partId: "p1/score" })).records.get("score")?.["spots"];
    expect(Array.isArray(spots) ? spots[0] : null).toMatchObject({ id: "c1", activeTakeId: "t2" });
    expect(must(store.read((r) => latestAttempt(r, "p1/gate:score")))).toMatchObject({ state: "ratified" });
  });
});
