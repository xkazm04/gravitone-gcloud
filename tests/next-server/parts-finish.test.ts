import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { PartOp, PartView } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";
import { loadPart, opPart, resetParts, undoPart } from "../../app/(studio)/projects/[id]/_part/fixture.ts";
import { actReceipt, confirmAct } from "../../app/(studio)/projects/[id]/_part/fixtureActs.ts";
import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";

// THE SCORE, CUT, ALBUM AND EXPLAINER PARTS (L40) - over the kernel (the real side: records, the op
// log, undo by append, a stale base answered with the view) and through the fixture side's
// public verbs (ops, receipts, dry landings), each on its own project's records.

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
const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";
const READY = { state: "ready", blob: { sha256: SHA, bytes: 7, mime: "image/png" } };

function universe(recipe: string, id: string): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-finish-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe }, OP, { id });
  if (!c.ok) throw c.error;
  return { store, port: makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } }) };
}

async function must<T>(p: Result<T> | Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
type Outcome = { kind: "applied"; view: PartView } | { kind: "conflict"; current: PartView };
async function applied(r: Result<Outcome> | Promise<Result<Outcome>>): Promise<PartView> {
  const o = await must(r);
  if (o.kind !== "applied") throw new Error("expected applied, got conflict");
  return o.view;
}

const unit = (id: string, startS: number, line = "") => ({
  id, sourceId: "cut-1", beatRef: { at: `0:${String(startS).padStart(2, "0")}` }, ordinal: 1, ofBeat: 1, startS, holdS: 15, kind: "beat", beatKind: "hook", title: id, line, plate: READY, clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});

function writeFrames(store: Store, id: string): void {
  const w = writePart(store, { projectId: id, partId: `${id}/frames`, baseRev: "current", act: "land", op: { test: "frames" }, label: "frames", by: { kind: "machine", id: "test" }, next: () => ok({ frames: { renderId: "cut-1", units: [unit("u1", 0, "the door, ajar"), unit("u2", 15)] } }) });
  if (!w.ok) throw w.error;
}

const scoreData = (v: PartView) => (v.kind === "score" && v.data.face === "spotting" ? v.data : null);
const cutData = (v: PartView) => (v.kind === "cut" && v.data.face === "timeline" ? v.data : null);

describe("score and cut over the kernel", () => {
  it("spots a cue on this project's picture, trims it to a scene, refuses a stale base, and undoes by append", async () => {
    const { store, port } = universe("film/short-form-clip", "f1");
    const empty = await must(port.loadPart({ projectId: "f1", key: "score" }));
    expect(empty.verdict).toEqual({ state: "empty", codes: [{ code: "no-cues", text: "no cues spotted" }] });
    expect(scoreData(empty)?.scenes).toEqual([]);
    writeFrames(store, "f1");
    const v0 = await must(port.loadPart({ projectId: "f1", key: "score" }));
    expect(scoreData(v0)?.scenes.map((s) => [s.id, s.startS])).toEqual([["u1", 0], ["u2", 15]]);
    const add: PartOp = { op: "cue-add" };
    const v1 = await applied(port.opPart({ projectId: "f1", key: "score", baseRev: v0.rev, op: add }));
    const cue = scoreData(v1)?.cues[0];
    // "add a cue" lands on the first gap run (v1 gaps.ts), here the whole picture.
    expect(cue).toMatchObject({ title: "new cue", sceneIds: ["u1", "u2"], startS: 0, bpm: null, proposed: false });
    expect(v1.ops.map((o) => o.label)).toEqual(["add cue"]);
    expect(v1.verdict).toMatchObject({ state: "working", codes: [{ code: "take-missing", text: "1 cue without a take" }, { code: "cues-spotted" }] });
    const stale = await must(port.opPart({ projectId: "f1", key: "score", baseRev: v0.rev, op: add }));
    expect(stale.kind).toBe("conflict");
    const id = cue?.id ?? "";
    const v2 = await applied(port.opPart({ projectId: "f1", key: "score", baseRev: v1.rev, op: { op: "cue-span", cueId: id, first: "u2", last: "u2" } }));
    expect(scoreData(v2)?.cues[0]).toMatchObject({ sceneIds: ["u2"], startS: 15, durS: 15 });
    expect(scoreData(v2)?.gaps).toEqual([["u1"]]);
    const bad = await port.opPart({ projectId: "f1", key: "score", baseRev: v2.rev, op: { op: "cue-bpm", cueId: id, bpm: 300 } });
    expect(bad.ok ? "applied" : bad.error.message).toBe("a tempo is 40-220 bpm");
    const back = await applied(port.undoPart({ projectId: "f1", key: "score", baseRev: v2.rev }));
    expect(scoreData(back)?.cues[0]?.sceneIds).toEqual(["u1", "u2"]);
    expect(back.ops.map((o) => o.label)).toEqual(["add cue"]);
  });

  it("lays the cut on the same clock, nudges a block on the part's log, and holds the finish line's deny sentences", async () => {
    const { store, port } = universe("film/short-form-clip", "f2");
    writeFrames(store, "f2");
    const v0 = await must(port.loadPart({ projectId: "f2", key: "cut" }));
    const d0 = cutData(v0);
    expect(d0?.scenes.map((s) => s.id)).toEqual(["u1", "u2"]);
    expect(d0?.clips.filter((c) => c.track === "video").map((c) => [c.status, c.blob, c.owner])).toEqual([["ok", SHA, "frames"], ["ok", SHA, "frames"]]);
    expect(d0?.clips.find((c) => c.track === "vo")).toMatchObject({ status: "missing", why: "written, not recorded", owner: "script" });
    expect(d0?.finish.find((r) => r.id === "voice")?.deny).toBe("1 line not recorded");
    const v1 = await applied(port.opPart({ projectId: "f2", key: "cut", baseRev: v0.rev, op: { op: "nudge", clipId: "pic-u2", ms: 50 } }));
    const v2 = await applied(port.opPart({ projectId: "f2", key: "cut", baseRev: v1.rev, op: { op: "nudge", clipId: "pic-u2", ms: 50 } }));
    // Two nudges compose: the batch bug v1's nudgeOffsets fixed stays fixed.
    expect(cutData(v2)?.clips.find((c) => c.id === "pic-u2")).toMatchObject({ offsetMs: 100, drawnS: 15.1 });
    const snapped = await applied(port.opPart({ projectId: "f2", key: "cut", baseRev: v2.rev, op: { op: "snap", clipId: "pic-u2" } }));
    expect(cutData(snapped)?.clips.find((c) => c.id === "pic-u2")?.offsetMs).toBe(0);
    const again = await port.opPart({ projectId: "f2", key: "cut", baseRev: snapped.rev, op: { op: "snap", clipId: "pic-u2" } });
    expect(again.ok ? "" : again.error.message).toBe("u2 is on its mark");
  });

  // L43 closed the records gap L40 reported: an album's words and an explainer's voice are their
  // own step records, so their editors write on the real side, undo by append, survive a reload.
  it("writes an album's words on the real side, and undo walks them back", async () => {
    const { port } = universe("album-video", "a1");
    const w = await must(port.loadPart({ projectId: "a1", key: "words" }));
    expect(w).toMatchObject({ kind: "words", rev: 1, data: { face: "words", title: "" }, verdict: { state: "empty" } });
    const t = await applied(port.opPart({ projectId: "a1", key: "words", baseRev: 1, op: { op: "words-field", field: "title", value: "Salt lines" } }));
    expect(t).toMatchObject({ rev: 2, data: { title: "Salt lines" }, verdict: { state: "working" } });
    const again = await must(port.loadPart({ projectId: "a1", key: "words" }));
    expect(again).toMatchObject({ rev: 2, data: { title: "Salt lines" } });
    const back = await applied(port.undoPart({ projectId: "a1", key: "words", baseRev: 2 }));
    expect(back).toMatchObject({ data: { title: "" } });
    const r = await must(port.loadPart({ projectId: "a1", key: "render" }));
    const res = await applied(port.opPart({ projectId: "a1", key: "render", baseRev: r.rev, op: { op: "render-res", res: "2160p" } }));
    expect(res).toMatchObject({ kind: "render", data: { res: "2160p" } });
  });
});

/* ── the fixture side: receipts first, dry landings, one project's records ── */

const at = NOW;
beforeEach(() => resetParts());

async function act(projectId: string, key: string, a: Parameters<typeof actReceipt>[2], target?: string): Promise<PartView> {
  const r = await must(actReceipt(projectId, key, a, at, target));
  const c = await must(confirmAct(projectId, key, a, r.token, at, target));
  if (c.kind !== "launched") throw new Error("stale");
  return c.view;
}
const fop = async (projectId: string, key: string, op: PartOp): Promise<PartView> => {
  const v = await must(loadPart(projectId, key, at));
  return applied(opPart(projectId, key, v.rev, op, at));
};

describe("the explainer on the fixture side", () => {
  it("writes, draws, records - and the cut over strips and voice reaches READY with no music rows", async () => {
    const id = "provider-routing-explainer";
    expect((await must(loadPart(id, "cut", at))).verdict.state).toBe("empty");
    const early = await actReceipt(id, "strips", "draw-strips", at);
    expect(early.ok ? "" : early.error.message).toBe("draw 6 cards needs an article");
    await act(id, "article", "write-article");
    const strips = await act(id, "strips", "draw-strips");
    expect(strips.verdict.state).toBe("ready");
    const voice = await must(loadPart(id, "voice", at));
    const lines = voice.kind === "voice" ? voice.data.lines : [];
    expect(lines.length).toBeGreaterThan(0);
    // A per-line act prices ITS line: a receipt for line A never confirms a recording of B.
    const a = await must(actReceipt(id, "voice", "record-line", at, lines[0]?.id));
    const b = await must(actReceipt(id, "voice", "record-line", at, lines[1]?.id));
    expect(a.token).not.toBe(b.token);
    const crossed = await must(confirmAct(id, "voice", "record-line", a.token, at, lines[1]?.id));
    expect(crossed.kind).toBe("stale");
    for (const l of lines) await act(id, "voice", "record-line", l.id);
    const cut = await must(loadPart(id, "cut", at));
    const d = cutData(cut);
    expect(d?.finish.map((r) => r.id)).toEqual(["picture", "voice", "drift", "runtime", "unplaced"]);
    expect(cut.verdict.state).toBe("ready");
  });
});

describe("the album on the fixture side", () => {
  it("drafts the words by a dry turn, marks an edit since, and holds the render until a still is kept", async () => {
    await must(loadPart("why-bitcoin", "research", at)); // the first read composes the seeds
    const list = fixtureProduce().listProjects();
    if (!list.ok) throw list.error;
    const id = list.value.projects.find((p) => p.title === "Salt lines — album video")?.id ?? "";
    const w = await act(id, "words", "write-words");
    expect(w).toMatchObject({ verdict: { state: "ready" }, data: { face: "words", title: "Salt lines", edited: false } });
    const e = await fop(id, "words", { op: "words-field", field: "title", value: "Salt lines (visualizer)" });
    expect(e.data).toMatchObject({ edited: true });
    const r = await actReceipt(id, "render", "render-video", at);
    expect(r.ok ? "" : r.error.message).toBe("render 1080p needs a kept still");
    expect((await must(undoPart(id, "words", e.rev, at))).kind).toBe("applied");
  });
});

describe("the trailer's score and cut on the fixture side", () => {
  it("proposes the cut's movements on the frames record's picture, keeps them on the first edit, and never lets a second render steal the take in use", async () => {
    const id = "glass-harbor-trailer";
    const frames = await must(loadPart(id, "frames", at));
    const render = frames.acts.find((a) => a.act === "render-plates");
    if (render === undefined) throw new Error("no plate render on frames");
    await act(id, "frames", render.act);
    const v0 = await must(loadPart(id, "score", at));
    const d0 = scoreData(v0);
    expect(d0?.scenes.length).toBe(30);
    // Proposed from the movements (lib/score/spots.ts), shown and NOT saved by being looked at.
    expect(d0?.proposal.pending).toBe(true);
    expect(d0?.cues.map((c) => c.title)).toEqual(["cold open", "introduction", "escalation · rung 1", "escalation · rung 2", "escalation · rung 3", "the reset", "climax", "tail — cards and button"]);
    expect(v0.verdict.state).toBe("empty");
    const cold = d0?.cues[0]?.id ?? "";
    const early = await actReceipt(id, "score", "render-cue", at, cold);
    expect(early.ok ? "" : early.error.message).toBe("cold open needs a tempo");
    const v1 = await fop(id, "score", { op: "cue-bpm", cueId: cold, bpm: 72 });
    const d1 = scoreData(v1);
    expect(d1?.proposal.pending).toBe(false);
    expect(d1?.cues.filter((c) => c.proposed).map((c) => c.title)).toHaveLength(7);
    expect(d1?.cues[0]).toMatchObject({ bpm: 72, proposed: false });
    await act(id, "score", "render-cue", cold);
    const v2 = await act(id, "score", "render-cue", cold);
    const takes = scoreData(v2)?.cues[0]?.takes ?? [];
    expect(takes).toHaveLength(2);
    expect(takes.map((t) => t.active)).toEqual([true, false]);
    // The cut reads the same clock and the take in hand (dry), on the server, without a client URL builder.
    const cut = cutData(await must(loadPart(id, "cut", at)));
    expect(cut?.clips.find((c) => c.id === `mus-${cold}`)).toMatchObject({ status: "ok", owner: "score" });
    expect(cut?.finish.find((r) => r.id === "takes")).toMatchObject({ value: "1/8", deny: "7 cues without a take" });
  });

  it("holds the album's words to the platform's limits", async () => {
    await must(loadPart("why-bitcoin", "research", at));
    const list = fixtureProduce().listProjects();
    if (!list.ok) throw list.error;
    const id = list.value.projects.find((p) => p.title === "Salt lines — album video")?.id ?? "";
    const v = await fop(id, "words", { op: "words-field", field: "title", value: "x".repeat(101) });
    expect(v.verdict).toEqual({ state: "blocked", codes: [{ code: "over-limit", text: "over the limit: title 101/100" }] });
  });

  it("counts the words as the platform does: description bytes, tags with their quotes", async () => {
    await must(loadPart("why-bitcoin", "research", at));
    const list = fixtureProduce().listProjects();
    if (!list.ok) throw list.error;
    const id = list.value.projects.find((p) => p.title === "Salt lines — album video")?.id ?? "";
    const spaced = await fop(id, "words", { op: "words-tags", tags: ["lo fi", "rain"] });
    expect(spaced.data).toMatchObject({ face: "words", tagChars: 12 });
    const many = await fop(id, "words", { op: "words-tags", tags: Array.from({ length: 100 }, (_, i) => `${i} y`) });
    expect(many.verdict).toEqual({ state: "blocked", codes: [{ code: "over-limit", text: "over the limit: tags 689/500" }] });
    await fop(id, "words", { op: "words-tags", tags: [] });
    const accented = await fop(id, "words", { op: "words-field", field: "description", value: "é".repeat(3000) });
    expect(accented.verdict).toEqual({ state: "blocked", codes: [{ code: "over-limit", text: "over the limit: description 6000/5000" }] });
  });
});
