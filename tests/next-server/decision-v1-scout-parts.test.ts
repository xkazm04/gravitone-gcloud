// A SCOUT NIGHT COMMITTED IN PARTS (spark scout-storyboards WP3) - lib/decision/v1/sources/scout.ts through the REAL
// kernel: a 70-cell night commits 40 with 30 undecided (`undecidedAs: "leave"`), the night's record holds the 40 with
// `open` = the 30 and stays closed; `pkt:scout:<night>:2` opens exactly the 30, a part with 10 undecided leaves `:3`,
// the last part commits the night. A redelivered part is a no-op, a contradicting verdict refused; a style is decided
// whole. The ledger's pile is the remainder, its facts `commit`, `commit.2`, `commit.3`; the graph keeps a candidate
// with a waiting cell open. Every store is a temp directory.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-parts-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "style-store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { OBSERVABLE_FIELDS, type ExtractManifest, type ExtractedStyle, type Observables } from "../../lib/foundry/extract/types.ts";
import { candidateState } from "../../lib/foundry/scout/graph.ts";
import type { Candidate, Night } from "../../lib/foundry/scout/types.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { weirPacketId } from "../../lib/ledger/v1/packet.ts";
import { projectScout } from "../../lib/ledger/v1/sources/scout.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const RUN1 = "2026-10-21-scout-c01";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");
const WATCHLIST = path.join(ROOT, "knowledge", "scout", "watchlist.md");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const obs = (): Observables => Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, "x"])) as Observables;
const inkwash: ExtractedStyle = {
  id: "inkwash",
  name: "INKWASH",
  family: "illustration",
  members: ["s01"],
  observables: obs(),
  recipe: "r",
  negative: "n",
  recipe_history: ["r"],
  grouped_by: "engine",
  replicas: [{ source: "s01", rounds: [{ n: 1, file: "rep/a.jpg", score: 0.8, per_field: {}, recipe: "r", prompt: "p1", critique: null, generator: "g", vision: "v", error: null }] }],
  transfers: [{ scene: 0, brief: "a harbour", file: "tr/a.jpg", score: 0.7, per_field: {}, prompt: "tp", readback: null, generator: "g", vision: "v", error: null }],
};

function seedRun(): void {
  const dir = path.join(out, "extract", RUN1);
  for (const d of ["src", "rep", "tr"]) mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of ["src/s01.png", "rep/a.jpg", "tr/a.jpg"]) writeFileSync(path.join(dir, f), `bytes ${f}`);
  const m: ExtractManifest = {
    id: RUN1,
    slug: RUN1,
    created: "2026-10-21T01:00:00.000Z",
    finished: "2026-10-21T02:00:00.000Z",
    status: "done",
    progress: { stage: "done", done: 1, total: 1 },
    options: { rounds: 1, replicas: 1, transfers: 1, target: 0.8, seed: 1, grouping: "engine" },
    sources: [{ id: "s01", name: "a.png", file: "src/s01.png", mime: "image/png", width: 10, height: 10, aspect: "16:9", readback: null, error: null }],
    styles: [inkwash],
    engines: { vision: "qwen-vl" },
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m));
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({}));
}

const pad = (n: number): string => `c-${String(n).padStart(2, "0")}`;
/** 70 cells: a style's two (c-01), a scene's three (c-02), and 65 watch lines (c-03..c-67). */
function seed(): void {
  closeKernel();
  for (const d of ["style-store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  mkdirSync(path.dirname(WATCHLIST), { recursive: true });
  writeFileSync(WATCHLIST, "# Scout watchlist\n\n## Watching\n\n## Proposed by the scout\n");
  seedRun();
  const dir = path.join(out, "scout", NIGHT);
  mkdirSync(path.join(dir, "scenes", "c-02"), { recursive: true });
  for (const f of ["scenes/c-02/replica-1.jpg", "scenes/c-02/replica-2.jpg", "scenes/c-02/clip.mp4"]) writeFileSync(path.join(dir, f), `bytes ${f}`);
  const base = { sourceIds: ["s-01"], status: "rendered" } as const;
  const candidates: Candidate[] = [
    { ...base, id: "c-01", kind: "style", extractRunId: RUN1 },
    { ...base, id: "c-02", kind: "scene", keyframes: [], replicas: ["scenes/c-02/replica-1.jpg", "scenes/c-02/replica-2.jpg"], clipRequested: true, clip: { path: "scenes/c-02/clip.mp4", durationS: 5, from: "scenes/c-02/replica-1.jpg" } },
    ...Array.from({ length: 65 }, (_, i): Candidate => ({ ...base, id: pad(i + 3), kind: "watch", entry: `channel: watch ${i + 3} - https://example.com/${i + 3}`, why: "light" })),
  ];
  const night: Night = { id: NIGHT, startedAt: `${NIGHT}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", stop: "target", closedAt: `${NIGHT}T05:00:00.000Z`, sources: [], candidates, jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

const nightOf = (): Night => JSON.parse(readFileSync(path.join(out, "scout", NIGHT, "night.json"), "utf8")) as Night;
const runStatus = (): string => (JSON.parse(readFileSync(path.join(out, "extract", RUN1, "run.json"), "utf8")) as ExtractManifest).status;
const watch = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${pad(from + i)}/text`);
const ctx = { now: new Date("2026-10-24T00:00:00.000Z"), universe: "real" as const };
const pile = () => projectScout({ nights: [nightOf()], skipped: [] }, ctx).weir.map((w) => [w.id, w.pending, w.decided, weirPacketId(w)]);

/** Part 1: the style and two scene stills, and watch lines c-03..c-38 - 40 decided; the clip and c-39..c-67 left. */
const PART1 = [
  { candidate: "c-01/inkwash/replica-1", verdict: "keep" as const },
  { candidate: "c-01/inkwash/transfer-1", verdict: "keep" as const },
  { candidate: "c-02/replica-1", verdict: "keep" as const },
  { candidate: "c-02/replica-2", verdict: "reject" as const, reasons: ["craft"] },
  { candidate: "c-03/text", verdict: "keep" as const },
  ...watch(4, 38).map((candidate) => ({ candidate, verdict: "reject" as const, reasons: ["generic"] })),
];
const LEFT1 = ["c-02/clip", ...watch(39, 67)];

describe("scout adapter - a night committed in parts", () => {
  it("commits 40 of 70 with 30 left; the record holds the 40 and open = the 30; the night stays closed; the pile is <night>:2", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(flow.plan.packet.items).toHaveLength(70);
    flow.patch(PART1);
    const p = must(flow.preview()).consequence;
    expect(p.counts).toEqual({ kept: 4, rejected: 36, undecided: 30 });
    expect(p.writes.at(-2)).toMatchObject({ target: `foundry-out/scout/${NIGHT}/night.json`, detail: "part 1: the decided verdicts, their reasons and notes; the night stays closed" });
    expect(p.writes.at(-1)).toMatchObject({ target: `foundry-out/scout/${NIGHT}/night.json`, detail: `30 undecided → pkt:scout:${NIGHT}:2` });
    // Whole, the kernel refuses; in parts it commits and records the 30.
    expect(flow.commit()).toMatchObject({ ok: false, error: { code: "refused" } });
    must(flow.commit(undefined, "leave"));
    const claim = flow.claim();
    expect(claim.outcome.act === "commit" && claim.outcome.result.undecided.length).toBe(30);
    must(await scoutAdapter.apply(claim));
    const n = nightOf();
    expect(n.state).toBe("closed");
    expect(n.committed?.kept).toEqual(["c-01/inkwash/replica-1", "c-01/inkwash/transfer-1", "c-02/replica-1", "c-03/text"]);
    expect(n.committed?.rejected).toHaveLength(36);
    expect(n.committed?.open).toEqual(LEFT1);
    expect(n.committed?.parts).toBe(1);
    // The style decided whole committed through its run; the kept watch line landed.
    expect(runStatus()).toBe("committed");
    expect(readFileSync(WATCHLIST, "utf8")).toContain("watch 3 -");
    expect(pile()).toEqual([[`${NIGHT}:2`, 30, 0, `pkt:scout:${NIGHT}:2`]]);
    // A candidate with a cell still waiting is open, whatever its other cells were given.
    expect(candidateState(n, n.candidates[1] as Candidate)).toBe("open");
    expect(candidateState(n, n.candidates[0] as Candidate)).toBe("kept");
    // The base packet does not open again, nor does a part out of turn.
    const v1 = must(await scoutAdapter.read({ runId: NIGHT }));
    expect(scoutAdapter.packet(v1)).toMatchObject({ ok: false, error: { message: `scout night ${NIGHT}: Part 1 is not the next part (2).` } });
    expect(scoutAdapter.packet(must(await scoutAdapter.read({ runId: `${NIGHT}:3` })))).toMatchObject({ ok: false });

    // Part 2 opens exactly the 30; 20 decided, 10 left for :3.
    const two = await openFlow(scoutAdapter, `${NIGHT}:2`, blobDir);
    expect(two.plan.packet.id).toBe(`pkt:scout:${NIGHT}:2`);
    expect(two.plan.packet.title).toBe(`scout ${NIGHT} · part 2`);
    expect(two.plan.packet.items.map((c) => c.id)).toEqual(LEFT1);
    expect(two.plan.present.rows.map((r) => r.id)).toEqual(["c-02", ...watch(39, 67).map((c) => c.slice(0, 4))]);
    two.patch([{ candidate: "c-02/clip", verdict: "keep" }, ...watch(39, 57).map((candidate) => ({ candidate, verdict: "reject" as const }))]);
    expect(must(two.preview()).consequence.writes.at(-1)?.detail).toBe(`10 undecided → pkt:scout:${NIGHT}:3`);
    must(two.commit(undefined, "leave"));
    const claim2 = two.claim();
    must(await scoutAdapter.apply(claim2));
    const n2 = nightOf();
    expect([n2.state, n2.committed?.parts, n2.committed?.open, n2.committed?.partAt?.length]).toEqual(["closed", 2, watch(58, 67), 1]);
    expect(n2.committed?.kept).toContain("c-02/clip");
    expect(candidateState(n2, n2.candidates[1] as Candidate)).toBe("kept");
    expect(pile()).toEqual([[`${NIGHT}:3`, 10, 0, `pkt:scout:${NIGHT}:3`]]);

    // A redelivered part writes nothing; a contradicting verdict is refused.
    const was = readFileSync(path.join(out, "scout", NIGHT, "night.json"), "utf8");
    must(await scoutAdapter.apply(claim2));
    must(await scoutAdapter.apply(claim));
    expect(readFileSync(path.join(out, "scout", NIGHT, "night.json"), "utf8")).toBe(was);
    const flipped = { ...claim2, decisions: claim2.decisions.map((d) => (d.key.endsWith("::c-02/clip") ? { ...d, verdict: "reject" as const } : d)) };
    expect(await scoutAdapter.apply(flipped)).toMatchObject({ ok: false, error: { code: "refused", message: `scout night ${NIGHT} was committed with other verdicts: c-02/clip is keep in v1, reject here` } });

    // Part 3, whole: the night is committed, no pile is left, and the ledger holds a commit per part.
    const three = await openFlow(scoutAdapter, `${NIGHT}:3`, blobDir);
    expect(three.plan.packet.items.map((c) => c.id)).toEqual(watch(58, 67));
    three.patch(watch(58, 67).map((candidate) => ({ candidate, verdict: "keep" as const })));
    expect(must(three.preview()).consequence.writes.at(-1)?.detail).toBe("part 3 · committed: every verdict so far, its reasons and its note");
    must(three.commit());
    must(await scoutAdapter.apply(three.claim()));
    const n3 = nightOf();
    expect([n3.state, n3.committed?.parts, n3.committed?.open, n3.committed?.kept.length, n3.committed?.rejected.length]).toEqual(["committed", 3, [], 15, 55]);
    expect(pile()).toEqual([]);
    const facts = projectScout({ nights: [n3], skipped: [] }, ctx).events.filter((e) => e.type === "commit").map((e) => e.key);
    expect(facts).toEqual([`scout:${NIGHT}:commit`, `scout:${NIGHT}:commit.2`, `scout:${NIGHT}:commit.3`]);
    expect(scoutAdapter.packet(must(await scoutAdapter.read({ runId: `${NIGHT}:4` })))).toMatchObject({ ok: false, error: { message: `scout night ${NIGHT}: This night is already committed.` } });
  }, 60_000);

  it("holds a style with an undecided look whole: its run stays uncommitted and both looks' cells open on :2", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([{ candidate: "c-01/inkwash/replica-1", verdict: "keep" }, { candidate: "c-03/text", verdict: "reject" }]);
    const p = must(flow.preview()).consequence;
    expect(p.writes).toContainEqual({ kind: "file", target: `foundry-out/extract/${RUN1}/verdicts.json`, candidate: "c-01", detail: `a look undecided: the decided looks' verdicts only, every look to pkt:scout:${NIGHT}:2` });
    expect(p.writes.at(-1)?.detail).toBe(`69 undecided → pkt:scout:${NIGHT}:2`);
    must(flow.commit(undefined, "leave"));
    must(await scoutAdapter.apply(flow.claim()));
    const n = nightOf();
    expect([n.committed?.kept, n.committed?.rejected]).toEqual([[], ["c-03/text"]]);
    expect(n.committed?.open?.slice(0, 2)).toEqual(["c-01/inkwash/replica-1", "c-01/inkwash/transfer-1"]);
    expect(runStatus()).toBe("done");
    const two = await openFlow(scoutAdapter, `${NIGHT}:2`, blobDir);
    expect(two.plan.packet.items.slice(0, 2).map((c) => c.id)).toEqual(["c-01/inkwash/replica-1", "c-01/inkwash/transfer-1"]);
  }, 60_000);

  it("refuses to preview an empty part: nothing decided is nothing to commit", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(flow.preview()).toMatchObject({ ok: false, error: { code: "refused", message: `scout night ${NIGHT}: nothing decided; 70 undecided` } });
  });
});
