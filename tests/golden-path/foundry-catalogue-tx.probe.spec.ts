// LANE — THE FOUNDRY CATALOGUE HAS ONE WRITE PATH (dynamic + one source ratchet).
//
// foundry-engine-A. Five writers update pipeline/foundry/styles.json and its
// two sibling ledgers (the forge, extract and Dojo commits in the app;
// acquire.py and `intake --acquire` in Python). Before this card each did a
// bare read-modify-write: two that overlapped lost one write with a 200 on
// both, and the commit-plan token was compared before the writes with nothing
// held between. lib/foundry/catalogue.ts `withCatalogue` is the one fence:
// an exclusive-create lock file BOTH languages honour
// (pipeline/foundry/catalogue_lock.py speaks the same protocol), the plan and
// its token check computed inside it, a catalogue revision `_rev` on
// styles.json, and an append-only catalogue-journal.jsonl.
//
// foundry-commit-race.probe.spec.ts drives forge×extract and cycle×cycle
// through the effect-log interleaver (acceptance 2 lives there); this lane
// adds extract×extract, the lock's two failure modes, the journal/revision
// contract, a real Python holder, and the one defect the crash harness's
// builder reported: commitCycle retried after a crash between its unlinks and
// cycle.json reported 0 files deleted.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { GET as stylesGET } from "@/app/api/foundry/styles/route";
import { CATALOGUE_JOURNAL, CATALOGUE_LOCK, __setCatalogueLockTiming, type JournalLine } from "@/lib/foundry/catalogue";
import { EXTRACT_ROOT, commitExtractRun } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, Observables } from "@/lib/foundry/extract/types";
import { __setFoundryFsPort } from "@/lib/foundry/fsPort";
import { FoundryError, OUT_ROOT, commitRun, foundryFile, getCatalogue } from "@/lib/foundry/store";
import { commitCycle } from "@/lib/foundry/training/store";
import type { CycleManifest, TrainingCommitResult, TrainingLedgerRow, TrainingVerdicts } from "@/lib/foundry/training/types";
import type { Candidate, RunManifest, StyleDef } from "@/lib/foundry/types";

import { CrashAt, Interleaver, RecordingPort, stripAt, type Outcome } from "./_effects";
import { keepEnv, probeFoundryDir, stripComments } from "./_helpers";

const foundryDir = probeFoundryDir();
keepEnv(["IMAGING_ACCESS_SECRET"]);

test.afterEach(() => {
  __setFoundryFsPort(null);
  __setCatalogueLockTiming(null);
});

const TRAINING_ROOT = path.join(process.cwd(), "foundry-out", "training");
const created: string[] = [];
test.afterEach(() => {
  for (const d of created.splice(0)) rmSync(d, { recursive: true, force: true });
});

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

const seedStyles = (...ids: string[]) =>
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ _purpose: "probe", styles: ids.map(styleDef) }), "utf8");

function forgeRun(id: string): string {
  const dir = path.join(OUT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  created.push(dir);
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

/** A finished extract run holding one style `styleId`, kept. */
function extractRun(id: string, styleId = "ink"): string {
  const dir = path.join(EXTRACT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  created.push(dir);
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
        id: styleId,
        name: styleId,
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
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ [styleId]: { verdict: "keep", at: new Date().toISOString() } }), "utf8");
  return id;
}

/** A cycle awaiting the gate: imp-1 approved (its challenger is the thumb),
 *  imp-2 rejected — four media files the commit deletes. Rebuilt from nothing
 *  every call so each crash prefix starts from the same bytes. */
function cycle(id: string): string {
  const dir = path.join(TRAINING_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  created.push(dir);
  const imps = ["imp-1", "imp-2"].map((iid) => {
    mkdirSync(path.join(dir, "pairs", iid), { recursive: true });
    const base = `pairs/${iid}/pair-1-baseline.png`;
    const chal = `pairs/${iid}/pair-1-challenger.png`;
    writeFileSync(path.join(dir, base), `b-${iid}`, "utf8");
    writeFileSync(path.join(dir, chal), `c-${iid}`, "utf8");
    return {
      id: iid,
      technique: `low-angle-${iid}`,
      subject: "portrait",
      claim: "c",
      standard: "portrait/low-angle",
      challenger_recipe: "c",
      baseline_recipe: "b",
      thumbnail: chal,
      pairs: [{ id: "p1", scene: "s", seed: 1, baseline: { file: base, kind: "image" as const }, challenger: { file: chal, kind: "image" as const }, judge_pick: "challenger" as const, reason: "r" }],
    };
  });
  const m: CycleManifest = {
    version: 1,
    id,
    at: "2026-10-05T00:00:00.000Z",
    dimension: "camera",
    subject: "portrait",
    status: "awaiting-gate",
    media: "image",
    fail_streak: 0,
    log: [],
    improvements: imps,
  };
  const verdicts: TrainingVerdicts = { "imp-1": "approve", "imp-2": "reject" };
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify(m), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return id;
}

const readJsonFile = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);
const readStyles = () => readJsonFile<{ _rev?: number; styles: StyleDef[] }>(path.join(foundryDir(), "styles.json"), { styles: [] });
const journal = (): JournalLine[] => {
  const f = path.join(foundryDir(), CATALOGUE_JOURNAL);
  return existsSync(f)
    ? readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as JournalLine)
    : [];
};

function settled<T>(o: Outcome<T>, who: string): T {
  if (!o.ok) throw new Error(`${who} commit threw: ${(o.error as Error)?.message ?? String(o.error)}`);
  return o.value;
}

/* ── 1. extract × extract, both orders ────────────────────────────────────── */

const isStylesIo = (e: { op: string; file: string }) =>
  (e.op === "readJson" || e.op === "writeJsonAtomic") && path.resolve(e.file) === path.resolve(foundryFile("styles.json"));

for (const first of ["e1", "e2"] as const) {
  test(`case 1 (${first} writes first): two extract commits on different runs, overlapping on styles.json, keep BOTH runs' styles`, async () => {
    seedStyles("haze");
    const e1 = extractRun(`probe-tx-e1-${process.pid}`, "ink");
    const e2 = extractRun(`probe-tx-e2-${process.pid}`, "wash");
    const il = new Interleaver(isStylesIo);
    __setFoundryFsPort(new RecordingPort({ gate: il.gate }));
    const p1 = il.start("e1", () => commitExtractRun(e1));
    const p2 = il.start("e2", () => commitExtractRun(e2));
    const writesStyles = (e: { op: string }) => e.op === "writeJsonAtomic";
    const s1 = await il.advanceTo("e1", writesStyles);
    const s2 = await il.advanceTo("e2", writesStyles);
    await il.drain(first, ["e1", "e2"]);
    const [o1, o2] = await Promise.all([p1, p2]);
    settled(o1, "e1");
    settled(o2, "e2");
    const seen = il.released.map((e) => `${e.actor}:${e.op === "readJson" ? "read" : "write"}`);
    console.log(`[catalogue-tx] extract×extract, ${first} first — window ${s1}/${s2}: ${seen.join(" ")}`);

    expect(seen, "e1's styles.json write went through the port").toContain("e1:write");
    expect(seen, "e2's styles.json write went through the port").toContain("e2:write");
    const ids = readStyles().styles.map((s) => s.id).sort();
    expect(ids, "both extract runs' styles are in the catalogue").toEqual(["haze", "ink", "wash"]);
  });
}

/* ── 3. the lock's two failure modes ──────────────────────────────────────── */

test("case 3a: a .catalogue.lock older than the staleness bound is broken and the commit proceeds", async () => {
  seedStyles("haze");
  const ex = extractRun(`probe-tx-stale-${process.pid}`);
  const lock = path.join(foundryDir(), CATALOGUE_LOCK);
  writeFileSync(lock, JSON.stringify({ pid: 999999, at: "2026-01-01T00:00:00.000Z", by: "probe" }), "utf8");
  const old = new Date(Date.now() - 120_000);
  utimesSync(lock, old, old);
  __setCatalogueLockTiming({ staleMs: 30_000, waitMs: 2_000 });

  const r = await commitExtractRun(ex);
  expect(r.written).toEqual(["ink"]);
  expect(readStyles().styles.map((s) => s.id)).toEqual(["haze", "ink"]);
  expect(existsSync(lock), "the commit released the lock it took over").toBe(false);
});

test("case 3b: a FRESH lock held past the wait bound is a 503 that names the lock file, and nothing is written", async () => {
  seedStyles("haze");
  const ex = extractRun(`probe-tx-held-${process.pid}`);
  const lock = path.join(foundryDir(), CATALOGUE_LOCK);
  writeFileSync(lock, JSON.stringify({ pid: 999999, at: new Date().toISOString(), by: "probe" }), "utf8");
  __setCatalogueLockTiming({ staleMs: 30_000, waitMs: 250 });

  let caught: unknown;
  try {
    await commitExtractRun(ex);
  } catch (e) {
    caught = e;
  }
  expect(caught, "the commit refused").toBeInstanceOf(FoundryError);
  expect((caught as FoundryError).status).toBe(503);
  expect((caught as FoundryError).message, "the refusal names the lock file").toContain(lock);
  expect(readStyles().styles.map((s) => s.id), "styles.json untouched").toEqual(["haze"]);
  expect(readJsonFile<ExtractManifest>(path.join(EXTRACT_ROOT, ex, "run.json"), null as unknown as ExtractManifest).status, "the run is not committed").toBe("done");
  expect(existsSync(lock), "a refused commit never removes a lock it does not hold").toBe(true);
  rmSync(lock, { force: true });
});

/* ── 4. one journal line and one revision per commit ──────────────────────── */

test("case 4: forge, extract and Dojo commits each append exactly one journal line and bump styles.json _rev by 1; GET /api/foundry/styles returns _rev", async () => {
  seedStyles("haze");
  expect(readStyles()._rev, "a catalogue that never had a revision reads as none").toBeUndefined();

  const runId = forgeRun(`probe-tx-forge-${process.pid}`);
  await commitRun(runId, "leave");
  expect(readStyles()._rev).toBe(1);
  expect(journal().length).toBe(1);

  const exId = extractRun(`probe-tx-ex-${process.pid}`);
  await commitExtractRun(exId);
  expect(readStyles()._rev).toBe(2);
  expect(journal().length).toBe(2);

  const cyId = cycle(`probe-tx-cy-${process.pid}`);
  await commitCycle(cyId);
  expect(readStyles()._rev).toBe(3);

  const lines = journal();
  console.log(`[catalogue-tx] journal:\n  ${lines.map((l) => JSON.stringify(l)).join("\n  ")}`);
  expect(lines.map((l) => [l.rev, l.op, l.run])).toEqual([
    [1, "forge-commit", runId],
    [2, "extract-commit", exId],
    [3, "dojo-commit", cyId],
  ]);
  for (const l of lines) {
    expect(typeof l.at, "every line is timestamped").toBe("string");
    expect(l.by, "every line names its writer").toBeTruthy();
    expect(Array.isArray(l.ids) && l.ids.length > 0, `line ${l.rev} names what it touched`).toBe(true);
  }
  expect(lines[1].ids).toEqual(["ink"]);

  // The read side: a client can tell the catalogue moved.
  expect((await getCatalogue())._rev).toBe(3);
  process.env.IMAGING_ACCESS_SECRET = "probe-secret";
  const res = await stylesGET(new Request("http://studio.local/api/foundry/styles", { headers: { authorization: "Bearer probe-secret" } }));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { _rev?: number })._rev).toBe(3);
});

/* ── 5. a real Python holder ──────────────────────────────────────────────── */

const PY_HOLDER = `
import json, sys, time
from pathlib import Path
sys.path.insert(0, "pipeline/foundry")
import acquire
root = Path(sys.argv[1])
acquire.STYLES = root / "styles.json"
acquire.READBACKS = root / "readbacks.jsonl"
real = acquire.save_catalogue
def slow(cat, *a, **kw):
    print("HOLDING", flush=True)
    time.sleep(1.5)
    return real(cat, *a, **kw)
acquire.save_catalogue = slow
sys.argv = ["acquire.py", "--source", "probe-src", "--id", "py-acq", "--name", "Py", "--model", "probe-model"]
acquire.main()
`;

test("case 5: a Python acquire holding the catalogue lock makes a TS commit wait, and the commit lands on the Python result", async () => {
  seedStyles("haze");
  writeFileSync(
    path.join(foundryDir(), "readbacks.jsonl"),
    JSON.stringify({ source: "probe-src", model: "probe-model", ok: true, parsed: { imitable_recipe: "py recipe", render_mode: "x" } }) + "\n",
    "utf8",
  );
  const ex = extractRun(`probe-tx-py-${process.pid}`);

  const py = spawn("python", ["-c", PY_HOLDER, foundryDir()], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  py.stderr.on("data", (d) => (err += String(d)));
  const holding = new Promise<void>((resolve, reject) => {
    py.stdout.on("data", (d) => {
      out += String(d);
      if (out.includes("HOLDING")) resolve();
    });
    py.on("exit", (code) => reject(new Error(`python exited ${code} before holding the lock: ${err || out}`)));
  });
  const exited = new Promise<number | null>((resolve) => py.on("exit", (code) => resolve(code)));
  await holding;

  const t0 = Date.now();
  const r = await commitExtractRun(ex);
  const waited = Date.now() - t0;
  const code = await exited;
  console.log(`[catalogue-tx] TS commit waited ${waited} ms behind the Python holder; python exit ${code}\n${out.trim()}`);

  expect(code, `python acquire failed: ${err}`).toBe(0);
  expect(r.written).toEqual(["ink"]);
  expect(readStyles().styles.map((s) => s.id), "the TS commit landed ON the Python write, not over it").toEqual(["haze", "py-acq", "ink"]);
  expect(readStyles()._rev).toBe(2);
  expect(journal().map((l) => [l.rev, l.op, l.by])).toEqual([
    [1, "acquire", "acquire.py"],
    [2, "extract-commit", "app"],
  ]);
});

/* ── 6. one lock kernel ───────────────────────────────────────────────────── */

test("case 6: no store under lib/ grows its own exclusive-create lock loop — publish and the foundry use lib/diskTx", () => {
  const root = path.join(process.cwd(), "lib");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const files = walk(root);
  expect(files.length, "the walk read nothing").toBeGreaterThan(50);
  const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");
  const own = files.filter((f) => /open\([^)]*["']wx["']/.test(stripComments(readFileSync(f, "utf8")))).map(rel).sort();
  console.log(`[catalogue-tx] exclusive-create opens under lib/: ${own.join(", ")}`);
  // lib/sound/store.ts: re-pointed in a later wave (another builder owns lib/sound
  // this wave). lib/articles/store.ts: a per-run lock plus a driver lease, outside
  // this card's write set. Neither list may grow.
  const PENDING = ["lib/articles/store.ts", "lib/sound/store.ts"];
  expect(own.filter((f) => f !== "lib/diskTx.ts" && !PENDING.includes(f)), "a new copy of the lock loop").toEqual([]);
  for (const f of ["lib/publish/store.ts", "lib/foundry/catalogue.ts"]) {
    const src = stripComments(readFileSync(path.join(process.cwd(), f), "utf8"));
    expect(src, `${f} takes its lock from lib/diskTx`).toMatch(/from "@\/lib\/diskTx"|from "\.\.\/diskTx"/);
  }
});

/* ── 7. commitCycle: every crash prefix, retried, reports what it deleted ─── */

const CY = `probe-tx-crash-${process.pid}`;
const cyDir = () => path.join(TRAINING_ROOT, CY);

function filesUnder(dir: string, rel = ""): string[] {
  if (!existsSync(path.join(dir, rel))) return [];
  const out: string[] = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesUnder(dir, r));
    else out.push(r);
  }
  return out.sort();
}

function seedCycle(): void {
  cycle(CY);
  for (const f of ["training-ledger.json", CATALOGUE_JOURNAL]) rmSync(path.join(foundryDir(), f), { force: true });
  rmSync(path.join(foundryDir(), "training"), { recursive: true, force: true });
  seedStyles("haze");
}

function cycleSnapshot(result: TrainingCommitResult) {
  return stripAt({
    result: { deleted: result.deleted, thumbs: result.thumbs, ledger_rows: result.ledger_rows },
    ledger: readJsonFile<{ rows: TrainingLedgerRow[] }>(path.join(foundryDir(), "training-ledger.json"), { rows: [] }),
    styles: readStyles(),
    cycle: readJsonFile<CycleManifest | null>(path.join(cyDir(), "cycle.json"), null),
    files: filesUnder(cyDir()),
    thumbs: filesUnder(path.join(foundryDir(), "training", "thumbs")),
    journal: journal().map((l) => [l.rev, l.op, l.run]),
  });
}

test("case 7: commitCycle crashed at EVERY mutation k and retried reports the same files deleted, and converges, as the uninterrupted commit", async () => {
  seedCycle();
  const ref = new RecordingPort();
  __setFoundryFsPort(ref);
  const end = cycleSnapshot(await commitCycle(CY));
  __setFoundryFsPort(null);
  const K = ref.applied;
  console.log(`[catalogue-tx] commitCycle: K=${K} mutation(s), reference deleted ${end.result.deleted}`);
  expect(K, "an uninterrupted commit made no mutation through the port").toBeGreaterThan(0);
  expect(end.result.deleted, "the reference commit deletes all four media files").toBe(4);

  const converged: number[] = [];
  for (let k = 1; k <= K; k++) {
    seedCycle();
    __setFoundryFsPort(new RecordingPort({ crashAt: k }));
    let crashed = "";
    try {
      await commitCycle(CY);
    } catch (e) {
      if (!(e instanceof CrashAt)) throw e;
      crashed = `${e.effect.op} ${path.basename(e.effect.to ?? e.effect.file)}`;
    }
    __setFoundryFsPort(null);
    expect(crashed, `k=${k} must actually crash`).not.toBe("");
    const got = cycleSnapshot(await commitCycle(CY));
    expect(got.result.deleted, `k=${k} (${crashed}): the retry's deleted count`).toBe(end.result.deleted);
    expect(got, `k=${k} (${crashed}): retry must converge on the no-crash result`).toEqual(end);
    converged.push(k);
  }
  console.log(`[catalogue-tx] commitCycle crash prefixes enumerated: K=${K}, converged ${converged.length}/${K}`);
  expect(converged.length).toBe(K);
});
