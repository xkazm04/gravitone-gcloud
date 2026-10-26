// A MUSE NIGHT ON THE BOARD (spark scout-muse WP3) - lib/decision/v1/sources/scout.ts over the muse wing's root:
// `muse:<night>` reads the muse night, never the scout night of the same day, and mints pkt:scout:muse:<night>
// titled `muse <night>`; an idea cell's meta carries the card and the judge's read; the file route's run is the
// run id. A kept character's card lands in scout-muse/characters.md, a kept watch line in the muse watchlist, a
// kept finding in techniques.md - and a run id naming no wing is refused at read and at apply. Every store is a
// temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-muse-"));
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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { MuseJudge } from "../../lib/foundry/scout/muse.ts";
import type { Candidate, IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-24";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const judge = (apparentAge: number): MuseJudge => ({ adult: "yes", apparentAge, clothing: "covered", realPerson: "no", hands: "ok", notes: "painterly" });
const idea = (id: string, over: Partial<IdeaCandidate>): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `a woman aged 30, ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, aspect: "4:5", ...over });
const CARD = { name: "Mara Venn", age: 34, look: "auburn bob, freckles, green wool coat", personality: "dry wit, never in a hurry" };

function museCandidates(): Candidate[] {
  return [
    idea("c-01", { title: "Gouache harbour portrait", target: "style", judge: judge(31) }),
    idea("c-02", { title: "A cartographer by lamplight", target: "scene", judge: judge(38) }),
    idea("c-03", { title: "Mara Venn, cartographer", target: "character", card: CARD, judge: judge(33) }),
    { id: "c-04", kind: "watch", sourceIds: [], status: "rendered", entry: "artist: a painterly portrait channel", why: "rim light on skin" },
    { id: "c-05", kind: "finding", sourceIds: [], status: "rendered", template: "muse", step: "01-looks", claim: "Name the age in the subject clause, not the tail", quote: "the first clause weighs most" },
  ];
}

function seedNight(root: string, candidates: Candidate[]): void {
  const dir = path.join(out, root, NIGHT);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  for (const c of candidates) if (c.kind === "idea") writeFileSync(path.join(dir, "ideas", `${c.id}.png`), `png ${root} ${c.id}`);
  const night: Night = { id: NIGHT, startedAt: `${NIGHT}T00:00:00.000Z`, ceilingUsd: 2, target: 3, clipCap: 0, ideaCap: 25, dry: false, state: "closed", stop: "target", closedAt: `${NIGHT}T05:00:00.000Z`, sources: [], candidates, jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  // The same day in both wings: the scout night holds one idea, the muse night five candidates.
  seedNight("scout", [idea("c-01", { title: "Lantern-lit stairwell" })]);
  seedNight("scout-muse", museCandidates());
}

const nightOf = (root: string): Night => JSON.parse(readFileSync(path.join(out, root, NIGHT, "night.json"), "utf8")) as Night;
const knowledge = (rel: string): string => readFileSync(path.join(ROOT, "knowledge", rel), "utf8");

describe("scout adapter - a muse night", () => {
  it("reads muse:<night> from the muse root and mints pkt:scout:muse:<night>; the bare night stays the scout wing's", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, `muse:${NIGHT}`, blobDir);
    const { packet, present, urls } = flow.plan;
    expect(packet.id).toBe(`pkt:scout:muse:${NIGHT}`);
    expect(packet.runId).toBe(`muse:${NIGHT}`);
    expect(packet.title).toBe(`muse ${NIGHT}`);
    expect(present.meta).toBe("muse · 3 ideas");
    expect(packet.items.map((c) => c.id)).toEqual(["c-05/text", "c-04/text", "c-01/board", "c-02/board", "c-03/board"]);
    expect(urls["c-03/board"]).toBe(`/api/foundry/file?run=muse%3A${NIGHT}&path=ideas%2Fc-03.png&kind=scout`);
    // The card's name and age, and what the eye read, ride the idea cell's meta beside its target.
    expect(present.items["c-03/board"]?.meta).toBe("character · free · Mara Venn, 34 · read 33 · covered");
    expect(present.items["c-01/board"]?.meta).toBe("style · free · read 31 · covered");

    const scout = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(scout.plan.packet.id).toBe(`pkt:scout:${NIGHT}`);
    expect(scout.plan.packet.title).toBe(`scout ${NIGHT}`);
    expect(scout.plan.packet.items.map((c) => c.id)).toEqual(["c-01/board"]);
    expect(scout.plan.urls["c-01/board"]).toBe(`/api/foundry/file?run=${NIGHT}&path=ideas%2Fc-01.png&kind=scout`);
  });

  it("refuses a run id that names no wing", async () => {
    seed();
    const r = await scoutAdapter.read({ runId: `bogus:${NIGHT}` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not-found");
  });

  it("previews the muse wing's knowledge files, then a kept character lands in characters.md and nothing in the scout wing moves", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, `muse:${NIGHT}`, blobDir);
    flow.patch([
      { candidate: "c-01/board", verdict: "keep" },
      { candidate: "c-02/board", verdict: "reject", reasons: ["subject"], note: "too close to the last one" },
      { candidate: "c-03/board", verdict: "keep" },
      { candidate: "c-04/text", verdict: "keep" },
      { candidate: "c-05/text", verdict: "keep" },
    ]);
    const writes = must(flow.preview()).consequence.writes;
    const record = `foundry-out/scout-muse/${NIGHT}/night.json`;
    expect(writes).toContainEqual({ kind: "file", target: "knowledge/scout-muse/characters.md", candidate: "c-03/board", detail: "new file · a line under ## Kept characters" });
    expect(writes).toContainEqual({ kind: "file", target: "knowledge/scout-muse/watchlist.md", candidate: "c-04/text", detail: "new file · a line under ## Proposed by the scout" });
    expect(writes).toContainEqual({ kind: "file", target: "knowledge/scout-muse/techniques.md", candidate: "c-05/text", detail: "new file · a line under ## Scout findings" });
    expect(writes).toContainEqual({ kind: "file", target: record, candidate: "c-03/board", detail: "develops next night as a character" });
    expect(writes.at(-1)).toEqual({ kind: "file", target: record, detail: "committed: every verdict, its reasons and its note" });
    // A kept style idea is a verdict, not a line: no knowledge file for c-01.
    expect(writes.filter((w) => w.candidate === "c-01/board")).toEqual([{ kind: "file", target: record, candidate: "c-01/board", detail: "develops next night as a style" }]);

    must(flow.commit());
    const claim = flow.claim();
    must(await scoutAdapter.apply(claim));
    expect(knowledge("scout-muse/characters.md")).toContain(`- **Mara Venn**, aged 34 - auburn bob, freckles, green wool coat. Plays: dry wit, never in a hurry. <!-- scout:${NIGHT}/c-03 -->`);
    expect(knowledge("scout-muse/watchlist.md")).toContain("artist: a painterly portrait channel");
    expect(knowledge("scout-muse/techniques.md")).toContain("Name the age in the subject clause, not the tail");
    expect(existsSync(path.join(ROOT, "knowledge", "scout"))).toBe(false);
    expect(nightOf("scout-muse")).toMatchObject({ state: "committed", committed: { kept: ["c-05/text", "c-04/text", "c-01/board", "c-03/board"], rejected: ["c-02/board"] } });
    expect(nightOf("scout").state).toBe("closed");

    // A second delivery writes nothing twice.
    const once = knowledge("scout-muse/characters.md");
    must(await scoutAdapter.apply(claim));
    expect(knowledge("scout-muse/characters.md")).toBe(once);

    // The same claim under a run id that names no wing is refused before anything is read.
    const bogus = await scoutAdapter.apply({ ...claim, packet: { ...claim.packet, runId: `bogus:${NIGHT}` } as typeof claim.packet });
    expect(bogus.ok).toBe(false);
  });
});
