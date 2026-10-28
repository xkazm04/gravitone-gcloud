// A REFERENCE SHEET ON THE BOARD (spark scout-vision S3 WP3) - the scout adapter over temp nights: a sheet is ONE image
// cell `c-NN/sheet` in its own row under `sheets` (keys 2-4 style, craft, subject; the images tab), a dry one its words
// alone under the same id, a failed one a loss; a cast storyboard and a cast idea name their cast in the meta, a cited
// character idea its source. Kept, the sheet is her reference - derived (keptCharacters), nothing else written; rejected,
// she is due a sheet again with the reasons the operator gave.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-sheet-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "foundry-out", "scout-muse");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok } from "@gt/domain/errors";
import { reasonsOf, reasonVocabulary, SOURCES } from "@gt/domain/source";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { closeKernel } from "../../lib/kernelStore.ts";
import { makeScoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { rootedNights } from "../../lib/foundry/scout/cast.ts";
import { keptCharacters } from "../../lib/foundry/scout/characters.ts";
import type { CharacterCard } from "../../lib/foundry/scout/muse.ts";
import { sheetsDue } from "../../lib/foundry/scout/sheet.ts";
import type { Candidate, IdeaCandidate, Night, SheetCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { categoryOf, runsOf, tabOf } from "../../packages/ui/src/board/runs.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const PORTRAITS = "2026-10-01";
const NIGHT = "2026-10-21";
const DRY = "2026-10-22";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const kernel = must(openKernel(":memory:"));
const adapter = makeScoutAdapter({ store: () => ok<Store>(kernel.store) });

const ILSE: CharacterCard = { name: "Ilse Marrow", age: 36, look: "copper bob, grey eyes, a navy pea coat", personality: "patient", kind: "original", render: "stylised", audience: "adult" };
const portrait: IdeaCandidate = { id: "c-01", kind: "idea", sourceIds: [], status: "rendered", title: "Ilse Marrow", target: "character", prompt: "poster of Ilse Marrow", anchor: { kind: "free", ref: "" }, image: "ideas/c-01.png", aspect: "9:16", card: ILSE };
const sheet = (id: string, o: Partial<SheetCandidate> = {}): SheetCandidate => ({ id, kind: "sheet", sourceIds: [], status: "rendered", jobId: `job:scout-sheet:x:${id}`, character: "ilse marrow", name: "Ilse Marrow", fromPortrait: `${PORTRAITS}/c-01`, image: `sheets/${id}.png`, seed: 3, ...o });
const castBoard: StoryboardCandidate = {
  id: "c-03",
  kind: "storyboard",
  sourceIds: [],
  status: "rendered",
  jobId: "job:scout-storyboard:x:c-03",
  fromIdea: `${PORTRAITS}/c-02`,
  title: "The keeper follows her own light",
  paragraph: "She climbs after a lantern that never waits.",
  bullets: ["beats: climb, landing, rail", "format: a 30 s vertical short", "look: cold slate"],
  panels: ["Ilse Marrow, aged 36: copper bob, grey eyes, a navy pea coat. she climbs the stair"],
  images: ["storyboards/c-03/panel-1.png"],
  cast: ["Ilse Marrow"],
};
const citedCharacter: IdeaCandidate = { ...portrait, id: "c-04", title: "Wren Ashby, from a source", image: "ideas/c-04.png", card: { ...ILSE, name: "Wren Ashby" }, source: "s-02", cast: ["Ilse Marrow"] };

function writeNight(id: string, o: { dry?: boolean; committed?: Night["committed"]; candidates: Candidate[] }): void {
  const dir = path.join(out, "scout", id);
  mkdirSync(dir, { recursive: true });
  const night: Night = { id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: o.dry ?? false, state: o.committed === undefined ? "closed" : "committed", stop: "target", closedAt: `${id}T05:00:00.000Z`, sources: [], candidates: o.candidates, jobs: [], ...(o.committed === undefined ? {} : { committed: o.committed }) };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function file(night: string, rel: string): void {
  mkdirSync(path.dirname(path.join(out, "scout", night, rel)), { recursive: true });
  writeFileSync(path.join(out, "scout", night, rel), `bytes of ${rel}`);
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  file(PORTRAITS, "ideas/c-01.png");
  writeNight(PORTRAITS, { candidates: [portrait], committed: { at: `${PORTRAITS}T08:00:00.000Z`, by: "operator", kept: ["c-01/board"], rejected: [], reasons: {}, notes: {}, dry: false } });
  for (const f of ["sheets/c-01.png", "storyboards/c-03/panel-1.png", "ideas/c-04.png"]) file(NIGHT, f);
  writeNight(NIGHT, { candidates: [sheet("c-01"), sheet("c-02", { status: "failed", error: "judge: apparent age 17" }), castBoard, citedCharacter] });
  writeNight(DRY, { dry: true, candidates: [sheet("c-01", { image: undefined } as Partial<SheetCandidate>)] });
}

describe("scout adapter - a reference sheet under sheets", () => {
  it("draws a sheet as one image cell in its own row; a failed one is a loss; cast and source ride the meta", async () => {
    seed();
    const flow = await openFlow(adapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    const ids = packet.items.map((c) => [c.id, c.row, c.media.mime]);
    expect(ids).toContainEqual(["c-01/sheet", "c-01", "image/png"]);
    expect(urls["c-01/sheet"]).toBe(`/api/foundry/file?run=${NIGHT}&path=sheets%2Fc-01.png&kind=scout`);
    expect(present.items["c-01/sheet"]).toEqual({ label: "Ilse Marrow", meta: `reference sheet · from ${PORTRAITS}/c-01 · local · free` });
    expect(present.rows.find((r) => r.id === "c-01")).toEqual({ id: "c-01", label: "Ilse Marrow", group: "sheets" });
    expect(losses).toContainEqual({ candidate: "c-02", grade: "dropped", reason: "judge: apparent age 17" });
    expect(present.items["c-03/words"]?.meta).toBe(`idea: ${PORTRAITS}/c-02 · 1 frame · cast: Ilse Marrow · local · free`);
    expect(present.items["c-04/board"]?.meta).toContain("cast: Ilse Marrow · source: s-02");
    // One run, the images tab; keys 2-4 by the sheets group.
    const runs = runsOf(packet.items.map((c) => ({ id: c.id, row: c.row ?? c.id })), present.rows);
    const run = runs.find((r) => r.row === "c-01");
    expect(run?.members.map((i) => packet.items[i]?.id)).toEqual(["c-01/sheet"]);
    if (run === undefined) throw new Error("no sheet run");
    expect(categoryOf(run, "image/png")).toBe("sheets");
    expect(tabOf("sheets")).toBe("images");
    expect(SOURCES.scout.reasonsBy?.["sheets"]).toEqual(["style", "craft", "subject"]);
    expect(reasonsOf(reasonVocabulary("scout"), "sheets").slice(0, 3)).toEqual(["style", "craft", "subject"]);
  });

  it("a dry night's sheet is its words alone, under the sheet's one cell id", async () => {
    seed();
    const flow = await openFlow(adapter, DRY, blobDir);
    expect(flow.plan.packet.items.map((c) => [c.id, c.media.mime])).toEqual([["c-01/sheet", "text/plain"]]);
    expect(flow.plan.present.items["c-01/sheet"]).toEqual({ label: "Ilse Marrow", meta: `reference sheet · from ${PORTRAITS}/c-01 · local · free`, prompt: `sheet · Ilse Marrow\nfrom ${PORTRAITS}/c-01` });
  });

  it("kept, it is her reference (derived, nothing else written); rejected, she is due again with the reasons", async () => {
    // The night's other cells, decided so the packet commits whole (the cited character thrown: she is no second keep).
    const rest = [
      { candidate: "c-03/panel-1", verdict: "reject" as const, reasons: ["story"] },
      { candidate: "c-03/words", verdict: "reject" as const, reasons: ["story"] },
      { candidate: "c-04/board", verdict: "reject" as const, reasons: ["generic"] },
    ];
    seed();
    const keep = await openFlow(adapter, NIGHT, blobDir);
    keep.patch([{ candidate: "c-01/sheet", verdict: "keep" }, ...rest]);
    expect(must(keep.preview()).consequence.writes).toContainEqual({ kind: "file", target: `foundry-out/scout/${NIGHT}/night.json`, candidate: "c-01/sheet", detail: "Ilse Marrow's reference for every frame she is cast in" });
    must(keep.commit());
    must(await adapter.apply(keep.claim()));
    const ilse = keptCharacters(await rootedNights()).find((k) => k.key === "ilse marrow");
    expect(ilse?.sheet).toEqual({ ref: `${NIGHT}/c-01`, night: NIGHT, file: "sheets/c-01.png" });
    expect(sheetsDue(await rootedNights(), keptCharacters(await rootedNights()))).toEqual([]);

    seed();
    const reject = await openFlow(adapter, NIGHT, blobDir);
    reject.patch([{ candidate: "c-01/sheet", verdict: "reject", reasons: ["craft"] }, ...rest]);
    expect(must(reject.preview()).consequence.writes).toContainEqual({ kind: "file", target: `foundry-out/scout/${NIGHT}/night.json`, candidate: "c-01/sheet", detail: "refused: Ilse Marrow is due a sheet again" });
    must(reject.commit());
    must(await adapter.apply(reject.claim()));
    const nights = await rootedNights();
    const due = sheetsDue(nights, keptCharacters(nights));
    expect(due.map((d) => [d.character.key, d.rejected?.ref, d.rejected?.reasons])).toEqual([["ilse marrow", `${NIGHT}/c-01`, ["craft"]]]);
  });
});
