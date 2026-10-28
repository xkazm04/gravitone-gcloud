// THE PRE-BASELINE ARCHIVE (spark project-baseline WP-C): the old scout root is a second, read-only root of the scout
// wing under the same BARE night ids - an archived night reads, its packet pkt:scout:<night> opens, commits and serves
// its files, and a character kept on it is still a kept character; a new night opens in the new root and never on a
// date the archive holds; the spread's doors answer one sentence on a new night and stay open on an archived one; the
// new night's taste brief drops the spread's sections by heading. Both roots are temp directories set below.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-baseline-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout-nights");
  process.env["SCOUT_PREBASELINE_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "foundry-out", "scout-muse");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "foundry-out", "scout-channels");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ACCESS_SECRET_VAR } from "../../lib/apiAuth.ts";
import { GET as foundryFile } from "../../app/api/foundry/file/route.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { ActContext } from "../../lib/foundry/scout/acts.ts";
import { ARCHIVED_DOOR, archivedDoor, archivedFromIdea, dropArchivedSections } from "../../lib/foundry/scout/baseline.ts";
import { keptCharacters } from "../../lib/foundry/scout/characters.ts";
import { ideasAct } from "../../lib/foundry/scout/idea.ts";
import { addProposals } from "../../lib/foundry/scout/propose.ts";
import { addSeedBatch } from "../../lib/foundry/scout/seeds.ts";
import { listSeedBatches } from "../../lib/foundry/scout/seedStore.ts";
import { addSources } from "../../lib/foundry/scout/sources.ts";
import { pauseBranch, readSteer, setSplit } from "../../lib/foundry/scout/steer.ts";
import { createNight, isPreBaselineNight, listNights, nightDir, readAllNights, readNight, readRootedNights, resolveInNight } from "../../lib/foundry/scout/store.ts";
import { storyboardAct } from "../../lib/foundry/scout/storyboard.ts";
import { tasteBrief } from "../../lib/foundry/scout/taste.ts";
import type { Candidate, IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const OLD = "2026-10-24";
const out = path.join(ROOT, "foundry-out");
const archive = path.join(out, "scout");
const fresh = path.join(out, "scout-nights");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const CARD = { name: "Ines Roca", age: 34, look: "auburn bob, freckles, green wool coat", personality: "dry wit", kind: "original" as const, audience: "adult" as const };
const idea = (id: string, over: Partial<IdeaCandidate>): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `a lighthouse at dusk, ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png`, ...over });
const committed = { at: "2026-10-24T09:00:00.000Z", by: "operator", kept: ["c-01/board", "c-02/board"], rejected: [], reasons: {}, notes: {}, dry: false };

function writeNight(root: string, n: Night): void {
  const dir = path.join(root, n.id);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  for (const c of n.candidates) if (c.kind === "idea") writeFileSync(path.join(dir, "ideas", `${c.id}.png`), `png ${n.id} ${c.id}`);
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(n));
}

const night = (id: string, candidates: Candidate[], over: Partial<Night> = {}): Night => ({ id, startedAt: `${id}T00:00:00.000Z`, ceilingUsd: 2, target: 3, clipCap: 0, ideaCap: 25, dry: false, state: "closed", closedAt: `${id}T05:00:00.000Z`, sources: [], candidates, jobs: [], ...over });

/** Two archived nights: OLD committed (a kept scene idea and a kept character), 2026-10-25 closed and untriaged. */
function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  writeNight(archive, night(OLD, [idea("c-01", { title: "Lantern-lit stairwell" }), idea("c-02", { title: "Ines Roca, keeper", target: "character", card: CARD, aspect: "9:16" })], { state: "committed", committed }));
  writeNight(archive, night("2026-10-25", [idea("c-01", { title: "A tide clock" })]));
  // The seed batches and the steer stay in the archive root: one committed batch, one paused branch.
  mkdirSync(path.join(archive, "seeds", OLD), { recursive: true });
  const seedRow = { id: "sd-001", sentence: "A lighthouse keeper's log, read aloud", genre: "drama", subgenre: "slice of life", type: "short", audience: "adult", format: "short" };
  writeFileSync(path.join(archive, "seeds", OLD, "batch.json"), JSON.stringify({ id: OLD, createdAt: `${OLD}T00:00:00.000Z`, dry: false, seeds: [seedRow], committed: { ...committed, kept: ["sd-001"] } }));
  writeFileSync(path.join(archive, "steer.json"), JSON.stringify({ paused: [`${OLD}/sd-001`], history: [] }));
}

const ctx = {} as ActContext;

describe("an archived night reads where it is read today", () => {
  beforeEach(seed);

  it("readNight, listNights, readAllNights and resolveInNight find it in the archive under its bare id; the seed batches and the steer stay there", async () => {
    expect((await readNight(OLD)).state).toBe("committed");
    expect(isPreBaselineNight(OLD)).toBe(true);
    expect(nightDir(OLD)).toBe(path.join(archive, OLD));
    expect(resolveInNight(OLD, "ideas/c-01.png")).toBe(path.join(archive, OLD, "ideas", "c-01.png"));
    expect((await listNights()).map((s) => s.id)).toEqual(["2026-10-25", OLD]);
    expect((await readAllNights()).map((n) => n.id)).toEqual(["2026-10-25", OLD]);
    expect((await listSeedBatches()).map((b) => b.id)).toEqual([OLD]);
    expect((await readSteer()).paused).toEqual([`${OLD}/sd-001`]);
    expect(existsSync(fresh)).toBe(false);
  });

  it("its packet pkt:scout:<night> opens, commits into the archive night, and the file route serves its file", async () => {
    const flow = await openFlow(scoutAdapter, "2026-10-25", blobDir);
    expect(flow.plan.packet.id).toBe("pkt:scout:2026-10-25");
    expect(flow.plan.packet.items.map((c) => c.id)).toEqual(["c-01/board"]);
    flow.patch([{ candidate: "c-01/board", verdict: "keep" }]);
    expect(must(flow.preview()).consequence.writes.at(-1)).toEqual({ kind: "file", target: "foundry-out/scout/2026-10-25/night.json", detail: "committed: every verdict, its reasons and its note" });
    must(flow.commit());
    must(await scoutAdapter.apply(flow.claim()));
    const after = JSON.parse(readFileSync(path.join(archive, "2026-10-25", "night.json"), "utf8")) as Night;
    expect(after).toMatchObject({ state: "committed", committed: { kept: ["c-01/board"] } });
    expect(existsSync(path.join(fresh, "2026-10-25"))).toBe(false);

    const saved = process.env[ACCESS_SECRET_VAR];
    process.env[ACCESS_SECRET_VAR] = "right";
    try {
      const res = await foundryFile(new Request(`http://127.0.0.1:3255/api/foundry/file?${new URLSearchParams({ run: OLD, path: "ideas/c-01.png", kind: "scout" }).toString()}`, { headers: { authorization: "Bearer right" } }));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(`png ${OLD} c-01`);
    } finally {
      if (saved === undefined) delete process.env[ACCESS_SECRET_VAR];
      else process.env[ACCESS_SECRET_VAR] = saved;
    }
  });

  it("a character kept on an archived night is still a kept character, addressed by the bare night", async () => {
    const kept = keptCharacters(await readRootedNights());
    expect(kept.map((k) => [k.key, k.portrait.ref, k.portrait.root])).toEqual([["ines roca", `${OLD}/c-02`, "scout"]]);
  });
});

describe("a new night", () => {
  beforeEach(seed);

  it("opens in the new root, never on a date the archive holds", async () => {
    const taken = await createNight({ dry: true, day: OLD });
    expect(taken.id).toBe(`${OLD}-2`);
    expect(existsSync(path.join(fresh, `${OLD}-2`, "night.json"))).toBe(true);
    expect(existsSync(path.join(archive, `${OLD}-2`))).toBe(false);
    expect((await createNight({ dry: true, day: "2026-10-27" })).id).toBe("2026-10-27");
    expect((await createNight({ dry: true, day: "2026-10-27" })).id).toBe("2026-10-27-2");
    expect((await listNights()).length).toBe(5);
  });

  it("each spread door answers the one sentence; an archived night's doors stay as they were", async () => {
    const n = await createNight({ dry: true, day: "2026-10-27" });
    const seeds = await addSeedBatch([], { dry: true });
    expect(seeds.ok ? undefined : seeds.error.message).toBe(ARCHIVED_DOOR);
    await expect(ideasAct(ctx, n.id, [])).rejects.toThrow(ARCHIVED_DOOR);
    const proposed = await addProposals(n.id, []);
    expect(proposed.ok ? undefined : proposed.error.message).toBe(ARCHIVED_DOOR);
    const source = await addSources(n.id, [{ fromIdea: `${OLD}/c-01` }]);
    expect(source.ok ? undefined : source.error.message).toBe(ARCHIVED_DOOR);
    await expect(storyboardAct(ctx, n.id, [{ fromIdea: `${OLD}/c-01` }])).rejects.toThrow(ARCHIVED_DOOR);
    const split = await setSplit({ audience: { adult: 100 } }, "operator");
    expect(split.ok ? undefined : split.error.message).toBe(ARCHIVED_DOOR);
    const paused = await pauseBranch(`${OLD}/sd-001`, "operator");
    expect(paused.ok ? undefined : paused.error.message).toBe(ARCHIVED_DOOR);
    // An episode's storyboard is not the spread's; a plain source batch is not shut either.
    expect(archivedFromIdea(n.id, [{ fromEpisode: "d1/ep-01" }])).toBeUndefined();
    expect(archivedDoor(OLD)).toBeUndefined();
    expect(archivedDoor(n.id)).toBe(ARCHIVED_DOOR);
  });

  it("its taste brief keeps the verdicts, directions and kept characters and drops the spread's sections, a caller's too", async () => {
    const n = await createNight({ dry: true, day: "2026-10-27" });
    const brief = await tasteBrief(n.id, undefined, ["## Branches", "", "- drama 3", "", "## Asset needs", "", "- bp: none", ""]);
    for (const h of ["## Directions confirmed", "## Kept characters", "## Asset needs", `## ${OLD} (committed 2026-10-24 by operator)`]) expect(brief).toContain(h);
    for (const h of ["## Seeds to develop", "## Paused", "## Ideas to develop", "## Genres", "## Branches", "## Storyboards to make"]) expect(brief).not.toContain(h);
    expect(brief).not.toContain("- drama 3");
    // The same nights without a new night to brief (an archived id): every section, as before the baseline.
    const old = await tasteBrief("2026-10-25", undefined, ["## Branches", "", "- drama 3", ""]);
    for (const h of ["## Ideas to develop", "## Branches", "## Paused"]) expect(old).toContain(h);
  });

  it("drops a section from its heading to the next one and nothing else", () => {
    expect(dropArchivedSections(["# Taste", "", "## Backlog", "- 4 waiting", "", "## Asset needs", "- bp", "## Ventures", "- v1"])).toEqual(["# Taste", "", "## Asset needs", "- bp"]);
  });
});
