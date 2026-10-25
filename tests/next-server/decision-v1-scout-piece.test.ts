// A TRIAL'S CLIPS AND A GENRE'S PIECE ON THE BOARD (spark scout-vision S2 WP3) - lib/decision/v1/sources/scout.ts over
// a trial (a storyboard with a genre: its frames, then each panel's clip as a video cell `c-01/clip-N`, then its words -
// one run under `storyboards`) and a piece (ONE cell `c-02/video` under `pieces`; words only when not cut; a failed
// piece is a Loss). Judged on the Board: the trial by the unchanged storyboard rule (its words kept carry it past a
// rejected clip), the piece's keep previews the genre publishable and queues the `genre-publishable` registry lead, which
// the apply writes once. The kernel holding the genre is an in-memory one handed to the adapter; every v1 store is temp.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Every case drives the CLI and a kernel job end to end; a loaded box (the whole suite at once) needs more than 5 s.
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-piece-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok } from "@gt/domain/errors";
import type { Genre } from "@gt/domain/genre";
import { reasonsOf, reasonVocabulary, SOURCES } from "@gt/domain/source";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { bornGenre } from "@gt/kernel/ventures/store";

import { closeKernel } from "../../lib/kernelStore.ts";
import { makeScoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { genreEvidenceOf } from "../../lib/foundry/scout/genres.ts";
import { readQueue } from "../../lib/foundry/scout/leads.ts";
import { storyboardVerdict } from "../../lib/foundry/scout/storyboardKept.ts";
import type { Candidate, Night, PieceCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { runsOf } from "../../packages/ui/src/board/runs.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

// The kernel the adapter reads the piece's genre from (its lead names it).
const kernel = must(openKernel(":memory:"));
const genre: Genre = must(kernel.store.tx((t) => bornGenre(t, { name: "Kitchen table science", bornFrom: "2026-10-01/c-04", proposal: "2026-10-02/c-01", use: "short: a 30 s chalk explainer", look: "chalk on slate", grammar: ["the question", "the answer"] }, { kind: "operator", id: "op" })));
const adapter = makeScoutAdapter({ store: () => ok<Store>(kernel.store) });

const PANELS = ["a kettle on a kitchen table", "bubbles climb the chalk diagram"];
const trial: StoryboardCandidate = {
  id: "c-01",
  kind: "storyboard",
  sourceIds: [],
  status: "rendered",
  jobId: "job:scout-storyboard:x:c-01",
  fromIdea: "2026-10-01/c-03",
  title: "Why the kettle sings",
  paragraph: "A chalk diagram grows while the kettle heats.",
  bullets: ["beats: the question, the answer", "format: a 30 s Short", "audience: curious adults"],
  panels: PANELS,
  images: ["storyboards/c-01/panel-1.png", "storyboards/c-01/panel-2.png"],
  genre: genre.id,
  clips: [1, 2].map((k) => ({ path: `storyboards/c-01/clip-${k}.mp4`, durationS: 5, from: `storyboards/c-01/panel-${k}.png`, engine: "ltx-local" as const, usd: 0 })),
};
const piece = (id: string, o: Partial<PieceCandidate> = {}): PieceCandidate => ({ id, kind: "piece", sourceIds: [], status: "rendered", genre: genre.id, fromTrial: "2026-10-01/c-07", title: "Why the kettle sings, cut", clips: [], use: "short: a 30 s chalk explainer", ...o });

function writeNight(id: string, dry: boolean, list: Candidate[]): void {
  const dir = path.join(out, "scout", id);
  mkdirSync(dir, { recursive: true });
  const night: Night = { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry, state: "closed", stop: "target", closedAt: `${id}T05:00:00.000Z`, sources: [], candidates: list, jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const clips = [1, 2, 3].map((k) => ({ path: `pieces/c-02/clip-${k}.mp4`, durationS: 5, from: `2026-10-01/storyboards/c-07/panel-${k}.png`, engine: "ltx-local" as const, usd: 0 }));
  writeNight(NIGHT, false, [trial, piece("c-02", { jobId: "job:scout-piece:x:c-02", clips: [clips[0] ?? null, null, clips[2] ?? null], video: "pieces/c-02/piece.mp4", durationS: 10, error: "clip 2: ComfyUI LTXVSampler (node 40) failed: out of memory" }), piece("c-03", { status: "failed", error: "the cut of 3 clip(s) failed: ffmpeg: Invalid data" })]);
  for (const f of ["storyboards/c-01/panel-1.png", "storyboards/c-01/panel-2.png", "storyboards/c-01/clip-1.mp4", "storyboards/c-01/clip-2.mp4", "pieces/c-02/piece.mp4"]) {
    mkdirSync(path.dirname(path.join(out, "scout", NIGHT, f)), { recursive: true });
    writeFileSync(path.join(out, "scout", NIGHT, f), `bytes of ${f}`);
  }
  writeNight(DRY, true, [piece("c-01")]);
}

const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;

describe("scout adapter - a trial's clips beside its frames, a piece under pieces", () => {
  it("draws a trial as frames, then each clip as a video cell, then its words; a piece as one video cell; a failed piece as a loss", async () => {
    seed();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime, c.jobId])).toEqual([
      ["c-01/panel-1", "c-01", "image/png", "job:scout-storyboard:x:c-01"],
      ["c-01/panel-2", "c-01", "image/png", "job:scout-storyboard:x:c-01"],
      ["c-01/clip-1", "c-01", "video/mp4", "job:scout-storyboard:x:c-01"],
      ["c-01/clip-2", "c-01", "video/mp4", "job:scout-storyboard:x:c-01"],
      ["c-01/words", "c-01", "text/plain", "job:scout-storyboard:x:c-01"],
      ["c-02/video", "c-02", "video/mp4", "job:scout-piece:x:c-02"],
    ]);
    expect(urls["c-01/clip-2"]).toBe(`/api/foundry/file?run=${NIGHT}&path=storyboards%2Fc-01%2Fclip-2.mp4&kind=scout`);
    expect(present.items["c-01/clip-2"]).toEqual({ label: "clip 2", meta: "5s · local · free", prompt: PANELS[1] });
    expect(present.items["c-01/words"]?.meta).toBe(`idea: 2026-10-01/c-03 · 2 frames · trial: ${genre.id} · 2 of 2 clips · local · free`);
    expect(present.items["c-02/video"]).toEqual({ label: "Why the kettle sings, cut", meta: `${genre.id} · trial 2026-10-01/c-07 · 2 of 3 clips · 10s · local · free` });
    expect(present.rows.find((r) => r.id === "c-02")).toEqual({ id: "c-02", label: "Why the kettle sings, cut", group: "pieces", use: "short: a 30 s chalk explainer" });
    expect(losses).toEqual([
      { candidate: "c-02", grade: "approximate", reason: "clip 2: ComfyUI LTXVSampler (node 40) failed: out of memory" },
      { candidate: "c-03", grade: "dropped", reason: "the cut of 3 clip(s) failed: ffmpeg: Invalid data" },
    ]);
    // One run per row: the trial's face is still a frame; the piece is its own run. Keys 2-4 by the pieces group.
    const runs = runsOf(packet.items.map((c) => ({ id: c.id, row: c.row ?? c.id })), present.rows);
    expect(runs.map((r) => [r.row, r.members.map((i) => packet.items[i]?.id)])).toEqual([
      ["c-01", ["c-01/panel-1", "c-01/panel-2", "c-01/clip-1", "c-01/clip-2", "c-01/words"]],
      ["c-02", ["c-02/video"]],
    ]);
    expect(SOURCES.scout.reasonsBy?.["pieces"]).toEqual(["story", "craft", "motion"]);
    expect(reasonsOf(reasonVocabulary("scout"), "pieces").slice(0, 3)).toEqual(["story", "craft", "motion"]);
  });

  it("a dry night's piece is its words alone, under the piece's one cell id", async () => {
    seed();
    const flow = await openFlow(adapter, DRY, blobDir);
    expect(flow.plan.packet.items.map((c) => [c.id, c.media.mime])).toEqual([["c-01/video", "text/plain"]]);
    expect(flow.plan.present.items["c-01/video"]).toEqual({ label: "Why the kettle sings, cut", meta: `${genre.id} · trial 2026-10-01/c-07 · local · free`, prompt: `piece · ${genre.id}\nWhy the kettle sings, cut\ntrial 2026-10-01/c-07` });
  });

  it("a kept piece previews the genre publishable and queues its genre-publishable lead once; the trial is kept by its words past a rejected clip", async () => {
    seed();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/panel-1", verdict: "keep" },
      { candidate: "c-01/panel-2", verdict: "keep" },
      { candidate: "c-01/words", verdict: "keep" },
      { candidate: "c-01/clip-1", verdict: "keep" },
      { candidate: "c-01/clip-2", verdict: "reject", reasons: ["motion"] },
      { candidate: "c-02/video", verdict: "keep" },
    ]);
    const p = must(flow.preview()).consequence;
    const record = `foundry-out/scout/${NIGHT}/night.json`;
    expect(p.writes).toEqual([
      { kind: "file", target: record, candidate: "c-01/words", detail: "ready for a full video" },
      { kind: "file", target: record, candidate: "c-02/video", detail: `genre ${genre.id} publishable` },
      { kind: "file", target: "foundry-out/scout/leads.json", candidate: "c-02/video", detail: `queues a registry lead: genre-publishable ${genre.id}` },
      { kind: "file", target: record, detail: "committed: every verdict, its reasons and its note" },
    ]);
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));
    const queue = await readQueue();
    expect(queue.events.map((e) => [e.key, e.kind, e.night, e.refs, e.evidence])).toEqual([[`genre-publishable:${genre.id}`, "genre-publishable", NIGHT, [genre.id], [`genre: ${genre.name}`, `use: ${genre.use}`, "kept: c-02/video"]]]);
    // A second delivery queues nothing twice.
    must(await adapter.apply(claim));
    expect((await readQueue()).events).toHaveLength(1);
    const n = nightOf(NIGHT);
    expect(n.committed).toMatchObject({ kept: ["c-01/panel-1", "c-01/panel-2", "c-01/clip-1", "c-01/words", "c-02/video"], rejected: ["c-01/clip-2"] });
    // The storyboard rule, unchanged: the words kept carry the trial past its rejected clip; the piece is kept.
    const t = n.candidates.find((c): c is StoryboardCandidate => c.id === "c-01" && c.kind === "storyboard");
    if (t === undefined) throw new Error("no trial");
    expect(storyboardVerdict(n, t)).toBe("kept");
    expect(genreEvidenceOf([n], genre.id)).toEqual({ keptTrials: [`${NIGHT}/c-01`], piece: { ref: `${NIGHT}/c-02`, verdict: "kept" } });
  });

  it("a rejected piece previews the genre staying piece-due and queues no lead", async () => {
    seed();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    flow.patch([{ candidate: "c-02/video", verdict: "reject", reasons: ["story"] }]);
    const p = must(flow.preview()).consequence;
    expect(p.writes).toContainEqual({ kind: "file", target: `foundry-out/scout/${NIGHT}/night.json`, candidate: "c-02/video", detail: `refused: genre ${genre.id} stays piece-due` });
    expect(p.writes.some((w) => w.target.endsWith("leads.json"))).toBe(false);
  });
});
