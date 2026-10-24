// A NIGHT'S STORYBOARDS ON THE BOARD (spark scout-storyboards WP4b) - lib/decision/v1/sources/scout.ts over
// `storyboard` candidates: ONE run per board under `storyboards`, its frames on disk as `c-10/panel-N` cells
// first (so the run's face is a still), then ONE text cell `c-10/words` - the paragraph, a blank line, the
// bullets as `- ` lines. A dry or words-only board is the words cell alone; a failed board is a Loss. Judged
// whole: the preview says a kept board is ready for a full video, the commit writes only the night's record,
// and that record is what keptStoryboardFor reads. Every store is a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-board-"));
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

import { reasonsOf, reasonVocabulary } from "@gt/domain/source";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { keptStoryboardFor } from "../../lib/foundry/scout/storyboardKept.ts";
import type { Candidate, IdeaCandidate, Night, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { categoriesOf, categoryOf, runsOf, tabOf, tabsOf, wordsOnly } from "../../packages/ui/src/board/runs.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const IDEAS = "2026-10-20";
const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const IDEA_REF = `${IDEAS}/c-03`;
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const PARAGRAPH = "A night watchman climbs a stairwell after a lantern that will not let him catch it.";
const BULLETS = ["beats: the lantern moves, the chase, the window", "format: a 30 s vertical short", "audience: adults who like quiet mysteries"];
const BODY = `${PARAGRAPH}\n\n- ${BULLETS[0]}\n- ${BULLETS[1]}\n- ${BULLETS[2]}`;

const board = (id: string, over: Partial<StoryboardCandidate>): StoryboardCandidate => ({
  id,
  kind: "storyboard",
  sourceIds: [],
  status: "rendered",
  fromIdea: IDEA_REF,
  title: `board ${id}`,
  paragraph: PARAGRAPH,
  bullets: BULLETS,
  panels: ["frame one", "frame two", "frame three", "frame four"],
  ...over,
});
const frames = (id: string, n: number): string[] => Array.from({ length: n }, (_, i) => `storyboards/${id}/panel-${i + 1}.png`);

function candidates(dry: boolean): Candidate[] {
  if (dry) return [board("c-10", { title: "The lantern that keeps three steps ahead", fromSeed: "b-01/sd-001" })];
  return [
    board("c-10", { title: "The lantern that keeps three steps ahead", images: frames("c-10", 4), jobId: "job:scout-storyboard:x:c-10", use: "short: a slow-reveal mystery Short", aim: "prove the chase reads in four frames" }),
    board("c-11", { title: "Words only", images: [] }),
    board("c-12", { status: "failed", error: "panel 1: comfy answered 500; panel 2: comfy answered 500" }),
    board("c-13", { title: "One frame refused", panels: ["a", "b", "c"], images: ["storyboards/c-13/panel-1.png", null, "storyboards/c-13/panel-3-gone.png"], error: "panel 2: comfy answered 500", fromIdea: "2026-10-19/c-01" }),
  ];
}

function writeNight(id: string, dry: boolean, list: Candidate[]): void {
  const dir = path.join(out, "scout", id);
  mkdirSync(dir, { recursive: true });
  const night: Night = { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, assetCap: 3, ideaCap: 25, dry, state: "closed", stop: "target", closedAt: `${id}T05:00:00.000Z`, sources: [], candidates: list, jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const idea: IdeaCandidate = { id: "c-03", kind: "idea", sourceIds: [], status: "rendered", title: "Lantern-lit stairwell", target: "scene", prompt: "a stairwell lit by one lantern", anchor: { kind: "free", ref: "" }, image: "ideas/c-03.png" };
  writeNight(IDEAS, false, [idea]);
  writeNight(NIGHT, false, candidates(false));
  for (const f of [...frames("c-10", 4), "storyboards/c-13/panel-1.png"]) {
    mkdirSync(path.dirname(path.join(out, "scout", NIGHT, f)), { recursive: true });
    writeFileSync(path.join(out, "scout", NIGHT, f), `png ${f}`);
  }
  writeNight(DRY, true, candidates(true));
}

const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;

describe("scout adapter - a storyboard is one run, its frames then its words", () => {
  it("draws the frames on disk then one words cell under a storyboards row; words-only is one cell; failed is a loss", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime, c.jobId])).toEqual([
      ["c-10/panel-1", "c-10", "image/png", "job:scout-storyboard:x:c-10"],
      ["c-10/panel-2", "c-10", "image/png", "job:scout-storyboard:x:c-10"],
      ["c-10/panel-3", "c-10", "image/png", "job:scout-storyboard:x:c-10"],
      ["c-10/panel-4", "c-10", "image/png", "job:scout-storyboard:x:c-10"],
      ["c-10/words", "c-10", "text/plain", "job:scout-storyboard:x:c-10"],
      ["c-11/words", "c-11", "text/plain", `scout:${NIGHT}`],
      ["c-13/panel-1", "c-13", "image/png", `scout:${NIGHT}`],
      ["c-13/words", "c-13", "text/plain", `scout:${NIGHT}`],
    ]);
    expect(urls["c-10/panel-1"]).toBe(`/api/foundry/file?run=${NIGHT}&path=storyboards%2Fc-10%2Fpanel-1.png&kind=scout`);
    expect(present.rows.find((r) => r.id === "c-10")).toEqual({ id: "c-10", label: "The lantern that keeps three steps ahead", group: "storyboards", prompt: PARAGRAPH, aim: "prove the chase reads in four frames", use: "short: a slow-reveal mystery Short" });
    expect(present.items["c-10/panel-2"]).toEqual({ label: "frame 2", prompt: "frame two" });
    // The words cell: the paragraph, a blank line, the bullets; the idea named by its title where its night reads.
    expect(present.items["c-10/words"]).toEqual({ label: "The lantern that keeps three steps ahead", meta: "idea: Lantern-lit stairwell · 4 frames · local · free", prompt: BODY });
    expect(present.items["c-11/words"]?.meta).toBe(`idea: Lantern-lit stairwell · 0 of 4 frames · local · free`);
    // An idea whose night is not on disk is named by its ref.
    expect(present.items["c-13/words"]?.meta).toBe("idea: 2026-10-19/c-01 · 1 of 3 frames · local · free");
    expect(losses).toEqual([
      { candidate: "c-12", grade: "dropped", reason: "panel 1: comfy answered 500; panel 2: comfy answered 500" },
      { candidate: "c-13/panel-3", grade: "dropped", reason: "storyboards/c-13/panel-3-gone.png is not on disk" },
      { candidate: "c-13", grade: "approximate", reason: "panel 2: comfy answered 500" },
    ]);

    // The desk: one run in the storyboards tab, its face frame 1 (a still, so it opens); keys 2-4 by its group.
    const mime = new Map(packet.items.map((c) => [c.id, c.media.mime]));
    const runs = runsOf(packet.items.map((c) => ({ id: c.id, row: c.row ?? c.id })), present.rows);
    const run = runs.find((r) => r.row === "c-10");
    if (run === undefined) throw new Error("no storyboard run");
    const firstMime = (r: (typeof runs)[number]) => mime.get(packet.items[r.members[0] ?? -1]?.id ?? "") ?? "";
    expect(run.members.map((i) => packet.items[i]?.id)).toEqual(["c-10/panel-1", "c-10/panel-2", "c-10/panel-3", "c-10/panel-4", "c-10/words"]);
    expect(categoryOf(run, firstMime(run))).toBe("storyboards");
    expect(tabOf("storyboards")).toBe("storyboards");
    expect(wordsOnly(firstMime(run))).toBe(false);
    expect(tabsOf(categoriesOf(runs, firstMime)).map((t) => [t.tab, t.categories.map((c) => [c.category, c.runs.length])])).toEqual([["storyboards", [["storyboards", 3]]]]);
    expect(reasonsOf(reasonVocabulary("scout"), run.group).slice(0, 3)).toEqual(["story", "generic", "use case"]);
  });

  it("a dry night's board is its words alone", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, DRY, blobDir);
    expect(flow.plan.packet.items.map((c) => [c.id, c.media.mime])).toEqual([["c-10/words", "text/plain"]]);
    expect(flow.plan.losses).toEqual([]);
  });

  it("a kept run previews ready for a full video, commits only the record, and passes the gate", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    // The whole run kept (1); one frame an exception inside it (⇧2), a note only.
    flow.patch([
      ...["c-10/panel-1", "c-10/panel-2", "c-10/panel-4", "c-10/words"].map((candidate) => ({ candidate, verdict: "keep" as const })),
      { candidate: "c-10/panel-3", verdict: "reject", reasons: ["story"] },
      { candidate: "c-11/words", verdict: "reject", reasons: ["generic"] },
      { candidate: "c-13/panel-1", verdict: "keep" },
      { candidate: "c-13/words", verdict: "keep" },
    ]);
    const p = must(flow.preview()).consequence;
    const record = `foundry-out/scout/${NIGHT}/night.json`;
    expect(p.writes).toEqual([
      { kind: "file", target: record, candidate: "c-10/words", detail: "ready for a full video" },
      { kind: "file", target: record, candidate: "c-11/words", detail: "refused: no full video grows from it" },
      { kind: "file", target: record, candidate: "c-13/words", detail: "ready for a full video" },
      { kind: "file", target: record, detail: "committed: every verdict, its reasons and its note" },
    ]);
    must(flow.commit());
    must(await scoutAdapter.apply(flow.claim()));
    const night = nightOf(NIGHT);
    expect(night.state).toBe("committed");
    expect(night.committed?.kept).toEqual(["c-10/panel-1", "c-10/panel-2", "c-10/panel-4", "c-10/words", "c-13/panel-1", "c-13/words"]);
    expect(keptStoryboardFor([nightOf(IDEAS), night], IDEA_REF)).toMatchObject({ night: NIGHT, candidate: { id: "c-10" } });
  });

  it("a rejected run (2: story) leaves the gate shut", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch(flow.plan.packet.items.map((c) => ({ candidate: c.id, verdict: "reject" as const, reasons: ["story"] })));
    const p = must(flow.preview()).consequence;
    expect(p.writes.find((w) => w.candidate === "c-10/words")?.detail).toBe("refused: no full video grows from it");
    must(flow.commit());
    must(await scoutAdapter.apply(flow.claim()));
    const night = nightOf(NIGHT);
    expect(night.committed?.reasons["c-10/words"]).toEqual(["story"]);
    expect(keptStoryboardFor([night], IDEA_REF)).toBeNull();
  });
});
