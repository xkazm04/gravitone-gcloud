// A NIGHT'S IDEA ARTBOARDS ON THE BOARD (spark scout-idea-artboards WP-I3) - lib/decision/v1/sources/
// scout.ts over `idea` candidates: a ONE-CELL run per drawn idea (`c-01/board`, its artboard the
// media, filed under `ideas`), its title the row's label, its aim (absent on a legacy idea) beside its prompt, its target and anchor
// the cell's meta; a failed idea, or one with no artboard on disk, a Loss with its own sentence.
// The preview names what each verdict does - kept, developed next night into its target; rejected,
// blocked - and the commit writes nothing but the night's record, which carries every idea verdict.
// A dry night records only. Then the desk's filing: an idea run lands in the ideas tab, above the
// words. Every store is a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-idea-"));
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

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { Candidate, IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";
import { categoriesOf, categoryOf, runsOf, tabOf, tabsOf, wordsOnly } from "../../packages/ui/src/board/runs.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const idea = (id: string, over: Partial<IdeaCandidate>): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...over });

function candidates(): Candidate[] {
  const { image: _none, ...unheld } = idea("c-05", {});
  return [
    idea("c-01", { title: "Lantern-lit stairwell", target: "scene", anchor: { kind: "watch", ref: "channel: lighting breakdowns" }, prompt: "rough frame, a stairwell lit by one lantern held high, warm amber against cold slate", use: "short: slow-reveal beat", app: "short", aim: "see whether one held light carries a reveal", jobId: "job:scout-ideas:x" }),
    idea("c-02", { title: "Cut-paper harbour", target: "style", anchor: { kind: "gap", ref: "paper-craft looks" } }),
    idea("c-03", { title: "Brass diving helmet", target: "asset3d" }),
    idea("c-04", { status: "failed", error: "leonardo answered 429: generation quota exhausted for this hour" }),
    unheld,
    idea("c-06", { image: "ideas/c-06-gone.png" }),
  ];
}

function seedNight(id: string, dry: boolean): void {
  const dir = path.join(out, "scout", id);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  for (const c of ["c-01", "c-02", "c-03"]) writeFileSync(path.join(dir, "ideas", `${c}.png`), `png ${id} ${c}`);
  const night: Night = { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, assetCap: 3, ideaCap: 25, dry, state: "closed", stop: "target", closedAt: `${id}T05:00:00.000Z`, sources: [], candidates: candidates(), jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  seedNight(NIGHT, false);
  seedNight(DRY, true);
}

const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;
/** Every file under the temp root but the night's record and the kernel's own: what an idea's commit must not touch. */
function files(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) return ["store", "blobs"].includes(e.name) && dir === ROOT ? [] : files(abs);
    return e.name === "night.json" ? [] : [`${path.relative(ROOT, abs)} ${readFileSync(abs, "utf8").length}`];
  });
}

describe("scout adapter - an idea is a one-cell run", () => {
  it("draws each idea with an artboard as one cell under its own row; a failed or unheld one is a loss", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime, c.jobId])).toEqual([
      ["c-01/board", "c-01", "image/png", "job:scout-ideas:x"],
      ["c-02/board", "c-02", "image/png", `scout:${NIGHT}`],
      ["c-03/board", "c-03", "image/png", `scout:${NIGHT}`],
    ]);
    expect(urls["c-01/board"]).toBe(`/api/foundry/file?run=${NIGHT}&path=ideas%2Fc-01.png&kind=scout`);
    // The brief's words, verbatim: the title is the row, the prompt the aim, target and anchor the cell's meta.
    expect(present.rows.find((r) => r.id === "c-01")).toEqual({ id: "c-01", label: "Lantern-lit stairwell", group: "ideas", prompt: "rough frame, a stairwell lit by one lantern held high, warm amber against cold slate", aim: "see whether one held light carries a reveal", use: "short: slow-reveal beat" });
    expect(present.items["c-01/board"]).toEqual({ label: "Lantern-lit stairwell", meta: "scene · watch: channel: lighting breakdowns", prompt: "rough frame, a stairwell lit by one lantern held high, warm amber against cold slate" });
    expect(present.items["c-02/board"]?.meta).toBe("style · gap: paper-craft looks");
    expect(present.items["c-03/board"]?.meta).toBe("3d asset · free");
    // A legacy idea has no aim and no use; its prompt still rides the row.
    expect(present.rows.find((r) => r.id === "c-02")).toEqual({ id: "c-02", label: "Cut-paper harbour", group: "ideas", prompt: "prompt c-02" });
    expect(losses).toEqual([
      { candidate: "c-04", grade: "dropped", reason: "leonardo answered 429: generation quota exhausted for this hour" },
      { candidate: "c-05", grade: "dropped", reason: "rendered with no artboard recorded" },
      { candidate: "c-06", grade: "dropped", reason: "ideas/c-06-gone.png is not on disk" },
    ]);
  });

  it("previews kept as developed into its target and rejected as blocked, then commits only the night's record", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/board", verdict: "keep" },
      { candidate: "c-02/board", verdict: "reject", reasons: ["generic"], note: "seen it" },
      { candidate: "c-03/board", verdict: "keep" },
    ]);
    const p = must(flow.preview()).consequence;
    expect(p.counts).toEqual({ kept: 2, rejected: 1, undecided: 0 });
    const record = `foundry-out/scout/${NIGHT}/night.json`;
    expect(p.writes).toEqual([
      { kind: "file", target: record, candidate: "c-01/board", detail: "develops next night as a scene" },
      { kind: "file", target: record, candidate: "c-02/board", detail: "blocked" },
      { kind: "file", target: record, candidate: "c-03/board", detail: "develops next night as a 3d asset" },
      { kind: "file", target: record, detail: "committed: every verdict, its reasons and its note" },
    ]);
    expect(p.promotions).toEqual([]);

    const before = files();
    must(flow.commit());
    const claim = flow.claim();
    must(await scoutAdapter.apply(claim));
    const night = nightOf(NIGHT);
    expect(night.state).toBe("committed");
    expect(night.committed).toMatchObject({ by: "operator", dry: false, kept: ["c-01/board", "c-03/board"], rejected: ["c-02/board"], reasons: { "c-02/board": ["generic"] }, notes: { "c-02/board": "seen it" } });
    expect(files()).toEqual(before);
    // A second delivery is a no-op.
    must(await scoutAdapter.apply(claim));
    expect(nightOf(NIGHT).committed).toEqual(night.committed);
  });

  it("a dry night records the verdicts and names nothing developed", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, DRY, blobDir);
    flow.patch(flow.plan.packet.items.map((c) => ({ candidate: c.id, verdict: "keep" as const })));
    const p = must(flow.preview()).consequence;
    expect(p.writes).toEqual([{ kind: "file", target: `foundry-out/scout/${DRY}/night.json`, detail: "committed · dry: the verdicts only; no style, scene or knowledge is admitted" }]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(nightOf(DRY)).toMatchObject({ state: "committed", committed: { dry: true, kept: ["c-01/board", "c-02/board", "c-03/board"], rejected: [] } });
  });
});

describe("the run desk - idea runs file into the ideas tab, above the words", () => {
  it("an idea run is its own category in the ideas tab, drawn before notes and sources, and opens", () => {
    const rows = [
      { id: "c-01", label: "replica", group: "videos" },
      { id: "c-02", label: "finding · cinematic", group: "notes" },
      { id: "c-03", label: "Lantern-lit stairwell", group: "ideas" },
    ];
    const cells = [
      { id: "c-01/replica-1", row: "c-01" },
      { id: "c-02/text", row: "c-02" },
      { id: "c-03/board", row: "c-03" },
    ];
    const mime: Record<string, string> = { "c-01": "image/jpeg", "c-02": "text/plain", "c-03": "image/png" };
    const runs = runsOf(cells, rows);
    const firstMime = (r: (typeof runs)[number]) => mime[r.row] ?? "";
    const idea = runs.find((r) => r.row === "c-03");
    if (idea === undefined) throw new Error("no idea run");
    expect(categoryOf(idea, "image/png")).toBe("ideas");
    expect(tabOf("ideas")).toBe("ideas");
    const tabs = tabsOf(categoriesOf(runs, firstMime));
    expect(tabs.map((t) => [t.tab, t.categories.map((c) => c.category)])).toEqual([
      ["videos", ["videos"]],
      ["ideas", ["ideas", "notes"]],
    ]);
    // A picture opens in the run's view; a line of words is decided where it lies.
    expect(wordsOnly(firstMime(idea))).toBe(false);
    expect(wordsOnly("text/plain")).toBe(true);
  });
});
