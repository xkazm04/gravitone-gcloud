// LANE — TWO FOUNDRY COMMITS OVERLAPPING ON ONE INDEX (dynamic).
//
// Every foundry commit is a read-modify-write of a git-tracked index with
// nothing held between the read and the write: commitRun and commitExtractRun
// both rewrite pipeline/foundry/styles.json, commitCycle rewrites
// training-ledger.json. runStore.writeJsonAtomic stops a TORN file; it does not
// stop a LOST UPDATE. Two commits that both read before either writes each
// write back a document missing the other's change, and the second rename
// wins silently — a human's cull or gate verdict gone, with a 200 on both
// requests. The commit-plan token (store.ts, extract/store.ts) is compared
// before the writes begin, so it does not close this window either.
//
// The existing concurrency probe (foundry-run-store) races two writes of the
// SAME whole-map document and accepts either winner, which is correct for it
// and blind to this. Here the tests/golden-path/_effects.ts Interleaver holds
// each commit at its index boundaries and drives the race in BOTH orders
// (registry: concurrency-guards#race-catalog-with-two-histories). The legal
// history is one: both commits' changes present.
//
// ── EXPECTED RED, MARKED test.fail() ────────────────────────────────────────
// Cases 4 and 5 FAIL on today's stores; that red is the finding, measured
// 2026-10-05. They are marked `test.fail()` so `npm test` stays green while
// the defect is open. THE FIX IS foundry-engine-A
// (docs/concepts/moonshots-2026-10-05/05-asset-management.md: `withCatalogue`,
// one lock over the catalogue, plan computed inside it). When it lands, these
// cases pass, Playwright reports "expected to fail, but passed", and the lane
// goes red until the `test.fail()` lines below are deleted — the flip is the
// proof the lock works. The harness does not hang under a lock: an actor that
// blocks outside the port is treated as stalled and the other actor runs.
// ONE CONDITION for that flip: the fixed commits must keep their index reads
// and writes on lib/foundry/fsPort, or the boundary guard below fails instead.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { EXTRACT_ROOT, commitExtractRun } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, Observables } from "@/lib/foundry/extract/types";
import { __setFoundryFsPort } from "@/lib/foundry/fsPort";
import { OUT_ROOT, commitRun, foundryFile } from "@/lib/foundry/store";
import { commitCycle } from "@/lib/foundry/training/store";
import type { CycleManifest, TrainingLedgerRow } from "@/lib/foundry/training/types";
import type { Candidate, LedgerRow, RunManifest, StyleDef } from "@/lib/foundry/types";

import { Interleaver, RecordingPort, type Outcome } from "./_effects";
import { probeFoundryDir } from "./_helpers";

const foundryDir = probeFoundryDir();

test.afterEach(() => __setFoundryFsPort(null));

const TRAINING_ROOT = path.join(process.cwd(), "foundry-out", "training");
const INDICES = ["ledger.json", "styles.json", "training-ledger.json"] as const;

/** A boundary is any read or write of a versioned index — nothing else is held. */
const isIndexIo = (e: { op: string; file: string }) =>
  (e.op === "readJson" || e.op === "writeJsonAtomic") && INDICES.some((n) => path.resolve(e.file) === path.resolve(foundryFile(n)));
const writes = (name: string) => (e: { op: string; file: string }) => e.op === "writeJsonAtomic" && path.basename(e.file) === name;

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const styleDef = (id: string): StyleDef => ({
  id,
  name: id,
  family: "f",
  status: "candidate",
  origin: { kind: "authored" },
  observables: {},
  recipe: "r",
  negative: "n",
  evidence: [],
});

/** A finished forge run: two kept candidates of `haze`. */
function forgeRun(id: string): string {
  const dir = path.join(OUT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const candidates: Candidate[] = [0, 1].map((i) => ({
    id: `sc${i}/haze--ref--s${i}`,
    scene: `sc${i}`,
    style: "haze",
    mechanism: "ref",
    seed: i,
    file: `sc${i}/haze--ref--s${i}.png`,
    sidecar: `sc${i}/haze--ref--s${i}.json`,
    status: "graded",
    grade: null,
    error: null,
  }));
  const run: RunManifest = {
    id,
    created: new Date().toISOString(),
    plan: { id: "p", scenes: candidates.map((c) => ({ id: c.scene, frame: "f" })), styles: ["haze"], mechanisms: [{ id: "ref", reference: true }], seeds: [0, 1] },
    styles: { haze: styleDef("haze") },
    status: "done",
    progress: { stage: "done", done: 2, total: 2 },
    scenes: candidates.map((c) => ({ id: c.scene, frame: "f", note: "", source: "s.png", annotation: null, annotation_from: null })),
    candidates,
    log: [],
  };
  const at = new Date().toISOString();
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(Object.fromEntries(candidates.map((c) => [c.id, { verdict: "keep", at }]))), "utf8");
  return id;
}

/** A finished extract run holding one kept-able style `ink`. */
function extractRun(id: string): string {
  const dir = path.join(EXTRACT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const m: ExtractManifest = {
    id,
    slug: id,
    created: new Date().toISOString(),
    status: "done",
    progress: { stage: "done", done: 1, total: 1 },
    options: { rounds: 1, replicas: 1, transfers: 0, target: 0.9, seed: 1, grouping: "none" },
    sources: [{ id: "s01", name: "a.png", file: "sources/s01.png", mime: "image/png", width: 8, height: 8, aspect: "1:1", readback: null, error: null }],
    styles: [
      {
        id: "ink",
        name: "ink",
        family: "f",
        members: ["s01"],
        observables: Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, "x"])) as Observables,
        recipe: "r",
        negative: "n",
        recipe_history: ["r"],
        grouped_by: "singleton",
        replicas: [],
        transfers: [],
      },
    ],
    engines: {},
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ ink: { verdict: "keep", at: new Date().toISOString() } }), "utf8");
  return id;
}

/** A cycle awaiting the gate: one improvement, approved, one image pair. */
function cycle(id: string): string {
  const dir = path.join(TRAINING_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "pairs", "imp-1"), { recursive: true });
  const base = "pairs/imp-1/pair-1-baseline.png";
  const chal = "pairs/imp-1/pair-1-challenger.png";
  writeFileSync(path.join(dir, base), "b", "utf8");
  writeFileSync(path.join(dir, chal), "c", "utf8");
  const m: CycleManifest = {
    version: 1,
    id,
    at: new Date().toISOString(),
    dimension: "camera",
    subject: "portrait",
    status: "awaiting-gate",
    media: "image",
    fail_streak: 0,
    log: [],
    improvements: [
      {
        id: "imp-1",
        technique: `low-angle-${id}`,
        subject: "portrait",
        claim: "c",
        standard: "portrait/low-angle",
        challenger_recipe: "c",
        baseline_recipe: "b",
        thumbnail: chal,
        pairs: [{ id: "p1", scene: "s", seed: 1, baseline: { file: base, kind: "image" }, challenger: { file: chal, kind: "image" }, judge_pick: "challenger", reason: "r" }],
      },
    ],
  };
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify(m), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ "imp-1": "approve" }), "utf8");
  return id;
}

const readIndex = <T>(name: (typeof INDICES)[number]): T => JSON.parse(readFileSync(path.join(foundryDir(), name), "utf8")) as T;

/* ── The schedule ─────────────────────────────────────────────────────────── */

/**
 * Start both actors, hold each at its write of `index` (so BOTH have read it),
 * then release `first`'s write before the other's. Returns both outcomes, the
 * boundaries the interleaver saw, and whether the window actually opened (a
 * correct lock blocks the second actor before its read, which reads here as
 * "stalled", and the schedule degrades to serial).
 */
async function race<A, B>(
  index: string,
  a: [string, () => Promise<A>],
  b: [string, () => Promise<B>],
  first: string,
): Promise<{ oa: Outcome<A>; ob: Outcome<B>; boundaries: string[]; window: boolean }> {
  const il = new Interleaver(isIndexIo);
  __setFoundryFsPort(new RecordingPort({ gate: il.gate }));
  const pa = il.start(a[0], a[1]);
  const pb = il.start(b[0], b[1]);
  const sa = await il.advanceTo(a[0], writes(index));
  const sb = await il.advanceTo(b[0], writes(index));
  await il.drain(first, [a[0], b[0]]);
  const [oa, ob] = await Promise.all([pa, pb]);
  const boundaries = il.released.map((e) => `${e.actor}:${e.op === "readJson" ? "read" : "write"} ${path.basename(e.file)}`);
  console.log(`[race] ${index}, ${first} writes first — window ${sa}/${sb}:\n  ${boundaries.join("\n  ")}`);
  return { oa, ob, boundaries, window: sa === "parked" && sb === "parked" };
}

function settled<T>(o: Outcome<T>, who: string): T {
  if (!o.ok) throw new Error(`${who} commit threw: ${(o.error as Error)?.message ?? String(o.error)}`);
  return o.value;
}

/* ── 4. forge × extract on styles.json ────────────────────────────────────── */

for (const first of ["forge", "extract"] as const) {
  test(`case 4 (${first} writes first): a forge commit and an extract commit that both read styles.json keep BOTH changes (I4)`, async () => {
    // RED TODAY — the lost update this lane exists to show. Fix: foundry-engine-A
    // (withCatalogue: one lock, plan inside it). Delete this line when it lands.
    test.fail();

    writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
    const runId = forgeRun(`probe-race-forge-${process.pid}`);
    const exId = extractRun(`probe-race-ex-${process.pid}`);
    try {
      const r = await race("styles.json", ["forge", () => commitRun(runId, "leave")], ["extract", () => commitExtractRun(exId)], first);
      settled(r.oa, "forge");
      settled(r.ob, "extract");

      // The interleaver saw both commits at the index — a probe that gated
      // nothing proves nothing.
      expect(r.boundaries.some((x) => x === "forge:write styles.json"), "forge's styles.json write went through the port").toBe(true);
      expect(r.boundaries.some((x) => x === "extract:write styles.json"), "extract's styles.json write went through the port").toBe(true);

      const styles = readIndex<{ styles: StyleDef[] }>("styles.json").styles;
      const haze = styles.find((s) => s.id === "haze");
      const forgeEvidence = haze?.evidence.filter((e) => e.run === runId).length ?? 0;
      const extracted = styles.filter((s) => s.origin?.kind === "extracted" && s.origin.source === exId).map((s) => s.id);
      const ledgerRows = readIndex<{ rows: LedgerRow[] }>("ledger.json").rows.filter((x) => x.run === runId).length;
      console.log(`[race] window=${r.window} → forge evidence ${forgeEvidence}/2, extract styles [${extracted.join(",")}], forge ledger rows ${ledgerRows}/2`);

      expect(ledgerRows, "the forge's ledger rows").toBe(2);
      expect(forgeEvidence, "the forge's evidence on haze survives the extract commit").toBe(2);
      expect(extracted, "the extract's style survives the forge commit").toEqual(["ink"]);
    } finally {
      rmSync(path.join(OUT_ROOT, runId), { recursive: true, force: true });
      rmSync(path.join(EXTRACT_ROOT, exId), { recursive: true, force: true });
    }
  });
}

/* ── 5. commitCycle × commitCycle on training-ledger.json ─────────────────── */

for (const first of ["c1", "c2"] as const) {
  test(`case 5 (${first} writes first): two commitCycle calls that both read training-ledger.json keep BOTH cycles' rows (I4)`, async () => {
    // RED TODAY — same lost update on the Dojo's cross-machine channel. Fix:
    // foundry-engine-A (withCatalogue covers training-ledger.json). Delete this
    // line when it lands.
    test.fail();

    const c1 = cycle(`probe-race-c1-${process.pid}`);
    const c2 = cycle(`probe-race-c2-${process.pid}`);
    try {
      const r = await race("training-ledger.json", ["c1", () => commitCycle(c1)], ["c2", () => commitCycle(c2)], first);
      settled(r.oa, "c1");
      settled(r.ob, "c2");

      expect(r.boundaries.some((x) => x === "c1:write training-ledger.json"), "c1's ledger write went through the port").toBe(true);
      expect(r.boundaries.some((x) => x === "c2:write training-ledger.json"), "c2's ledger write went through the port").toBe(true);

      const rows = readIndex<{ rows: TrainingLedgerRow[] }>("training-ledger.json").rows;
      const per = [c1, c2].map((id) => rows.filter((x) => x.cycle === id).length);
      console.log(`[race] window=${r.window} → training-ledger rows: c1 ${per[0]}/1, c2 ${per[1]}/1`);
      expect(per, "one row per committed cycle").toEqual([1, 1]);
    } finally {
      rmSync(path.join(TRAINING_ROOT, c1), { recursive: true, force: true });
      rmSync(path.join(TRAINING_ROOT, c2), { recursive: true, force: true });
    }
  });
}
