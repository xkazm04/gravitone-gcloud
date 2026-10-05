// LANE — EVERY CRASH POINT OF A FORGE COMMIT, enumerated (dynamic).
//
// `commitRun` is a sequence of nine disk effects over two git-tracked indices
// and a run directory: ledger, styles, the unlinks, findings, verdicts,
// run.json. A process can die between any two of them. The probe this file
// extends (foundry-commit-indices) hand-picked ONE such death and simulated it
// by rewinding run.json; this one derives the population instead. It routes
// the commit through a recording FsPort (tests/golden-path/_effects.ts),
// counts K mutations in an uninterrupted commit, and for every k in 1..K
// kills the commit at mutation k, retries it, and requires:
//
//   I1  every ledger KEEP row still has its file          (at the crash AND after)
//   I2  every unlinked file already has its ledger row    (at the crash AND after)
//   I3  the retry converges on the uninterrupted end state (ledger, styles,
//       run.json, verdicts.json, and which files remain)
//
// I2 is the destructive half: a file deleted before the ledger names it is a
// human verdict lost with no record that it was ever made. The order the
// store documents — indices FIRST, deletions SECOND, manifest THIRD — is what
// makes I1 and I2 hold at every prefix, and case 1 pins that order directly
// from the effect log rather than from the comment that claims it.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { __setFoundryFsPort } from "@/lib/foundry/fsPort";
import { OUT_ROOT, commitRun } from "@/lib/foundry/store";
import type { Candidate, LedgerRow, RunManifest, StyleDef, Verdicts } from "@/lib/foundry/types";

import { CrashAt, RecordingPort, label, stripAt } from "./_effects";
import { probeFoundryDir } from "./_helpers";

const foundryDir = probeFoundryDir();

test.afterEach(() => __setFoundryFsPort(null));

/* ── Fixture: three candidates, one of each fate ──────────────────────────── */

const RUN = `probe-crash-${process.pid}`;
const runDir = () => path.join(OUT_ROOT, RUN);

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

/** sc0 kept, sc1 rejected, sc2 undecided (rejected by `undecidedAs`). Both
 *  files of every candidate exist on disk. Rebuilt from nothing every call, so
 *  each k starts from the same bytes. */
function seed(): void {
  rmSync(runDir(), { recursive: true, force: true });
  rmSync(path.join(foundryDir(), "ledger.json"), { force: true });
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  const candidates: Candidate[] = [0, 1, 2].map((i) => {
    const cid = `sc${i}/haze--ref--s${i}`;
    mkdirSync(path.join(runDir(), `sc${i}`), { recursive: true });
    writeFileSync(path.join(runDir(), `${cid}.png`), `png-${i}`, "utf8");
    writeFileSync(path.join(runDir(), `${cid}.json`), `{"i":${i}}`, "utf8");
    return { id: cid, scene: `sc${i}`, style: "haze", mechanism: "ref", seed: i, file: `${cid}.png`, sidecar: `${cid}.json`, status: "graded", grade: null, error: null };
  });
  const verdicts: Verdicts = {
    "sc0/haze--ref--s0": { verdict: "keep", at: "2026-10-05T00:00:00.000Z" },
    "sc1/haze--ref--s1": { verdict: "reject", at: "2026-10-05T00:00:00.000Z" },
  };
  const run: RunManifest = {
    id: RUN,
    created: "2026-10-05T00:00:00.000Z",
    plan: { id: "p", scenes: candidates.map((c) => ({ id: c.scene, frame: "f" })), styles: ["haze"], mechanisms: [{ id: "ref", reference: true }], seeds: [0, 1, 2] },
    styles: { haze: styleDef("haze") },
    status: "done",
    progress: { stage: "done", done: 3, total: 3 },
    scenes: candidates.map((c) => ({ id: c.scene, frame: "f", note: "", source: "s.png", annotation: null, annotation_from: null })),
    candidates,
    log: [],
  };
  writeFileSync(path.join(runDir(), "run.json"), JSON.stringify(run), "utf8");
  writeFileSync(path.join(runDir(), "verdicts.json"), JSON.stringify(verdicts), "utf8");
}

/* ── Reading the durable state back ───────────────────────────────────────── */

const readJsonFile = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);

function filesUnder(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesUnder(dir, r));
    else out.push(r);
  }
  return out.sort();
}

function snapshot() {
  return stripAt({
    ledger: readJsonFile<{ rows: LedgerRow[] }>(path.join(foundryDir(), "ledger.json"), { rows: [] }),
    styles: readJsonFile<{ styles: StyleDef[] }>(path.join(foundryDir(), "styles.json"), { styles: [] }),
    run: readJsonFile<RunManifest | null>(path.join(runDir(), "run.json"), null),
    verdicts: readJsonFile<Verdicts>(path.join(runDir(), "verdicts.json"), {}),
    files: filesUnder(runDir()),
  });
}

/** I1 and I2 over whatever is on disk right now; returns the violations. */
function invariants(): string[] {
  const bad: string[] = [];
  const rows = readJsonFile<{ rows: LedgerRow[] }>(path.join(foundryDir(), "ledger.json"), { rows: [] }).rows.filter((r) => r.run === RUN);
  const run = readJsonFile<RunManifest>(path.join(runDir(), "run.json"), null as unknown as RunManifest);
  const rowOf = (c: Candidate) => rows.find((r) => r.scene === c.scene && r.style === c.style && r.mechanism === c.mechanism && r.seed === c.seed);
  for (const c of run.candidates) {
    const present = existsSync(path.join(runDir(), c.file));
    const row = rowOf(c);
    if (row?.verdict === "keep" && !present) bad.push(`I1: ledger keeps ${c.id} but its file is gone`);
    if (!present && row?.verdict !== "reject") bad.push(`I2: ${c.id} was unlinked with ${row ? `a ${row.verdict} row` : "no ledger row"}`);
  }
  return bad;
}

/** One uninterrupted commit under a recording port: the reference end state and K. */
async function reference(): Promise<{ port: RecordingPort; end: ReturnType<typeof snapshot> }> {
  seed();
  const port = new RecordingPort();
  __setFoundryFsPort(port);
  await commitRun(RUN, "reject");
  __setFoundryFsPort(null);
  return { port, end: snapshot() };
}

/** Crash at mutation k, check I1/I2, retry on the real port, check again. */
async function crashThenRetry(
  k: number,
): Promise<{ crashed: string; atCrash: string[]; filesAtCrash: string[]; afterRetry: string[]; end: ReturnType<typeof snapshot> }> {
  seed();
  __setFoundryFsPort(new RecordingPort({ crashAt: k }));
  let crashed = "";
  try {
    await commitRun(RUN, "reject");
  } catch (e) {
    if (!(e instanceof CrashAt)) throw e;
    crashed = `${e.effect.op} ${path.basename(e.effect.to ?? e.effect.file)}`;
  }
  __setFoundryFsPort(null);
  const atCrash = invariants();
  const filesAtCrash = filesUnder(runDir());
  await commitRun(RUN, "reject");
  return { crashed, atCrash, filesAtCrash, afterRetry: invariants(), end: snapshot() };
}

test.afterAll(() => rmSync(runDir(), { recursive: true, force: true }));

/* ── 1. The documented order, read off the effect log ─────────────────────── */

test("case 1: commitRun's effects land in the documented order — ledger, styles, unlinks, then run.json", async () => {
  const { port } = await reference();
  const mutations = port.mutationLog().map(label);
  console.log(`[effects] commitRun, 3 candidates: ${port.log.length} call(s), K=${mutations.length} mutation(s)\n  ${mutations.join("\n  ")}`);

  // The walk saw something: a port the store never called reads as an empty log.
  expect(mutations.length, "the store made no call through lib/foundry/fsPort — the seam is not threaded").toBeGreaterThan(0);
  expect(mutations).toEqual([
    "writeJsonAtomic ledger.json",
    "writeJsonAtomic styles.json",
    "unlink haze--ref--s1.png",
    "unlink haze--ref--s1.json",
    "unlink haze--ref--s2.png",
    "unlink haze--ref--s2.json",
    "writeFile findings.md",
    "writeJsonAtomic verdicts.json",
    "writeJsonAtomic run.json",
  ]);

  // Each index is READ before it is written — a read-modify-write, which is
  // exactly the shape foundry-commit-race.probe.spec.ts interleaves.
  const seqOf = (l: string) => port.log.filter((e) => label(e) === l).map((e) => e.seq);
  for (const idx of ["ledger.json", "styles.json"]) {
    const reads = seqOf(`readJson ${idx}`);
    const [write] = seqOf(`writeJsonAtomic ${idx}`);
    expect(reads.length, `${idx} is read through the port`).toBeGreaterThan(0);
    expect(Math.max(...reads)).toBeLessThan(write);
  }
});

/* ── 2. Every prefix, retried, converges ──────────────────────────────────── */

test("case 2: a crash at EVERY mutation k in 1..K, then a retry, converges on the uninterrupted end state (I3)", async () => {
  const { port, end } = await reference();
  const K = port.applied;
  expect(K, "an uninterrupted commit made no mutation through the port").toBeGreaterThan(0);

  const converged: number[] = [];
  for (let k = 1; k <= K; k++) {
    const r = await crashThenRetry(k);
    expect(r.crashed, `k=${k} must actually crash`).not.toBe("");
    expect(r.atCrash, `k=${k} (${r.crashed}): durable state at the crash`).toEqual([]);
    expect(r.afterRetry, `k=${k} (${r.crashed}): after the retry`).toEqual([]);
    expect(r.end, `k=${k} (${r.crashed}): retry must converge on the no-crash result`).toEqual(end);
    converged.push(k);
  }
  console.log(`[effects] commitRun crash prefixes enumerated: K=${K}, converged ${converged.length}/${K}`);
  expect(converged.length).toBe(K);
});

/* ── 3. The window the destructive half lives in ──────────────────────────── */

test("case 3: a crash between the last unlink and run.json leaves I1 and I2 intact, and the retry keeps them", async () => {
  const { port } = await reference();
  const log = port.mutationLog();
  expect(log.length, "the store made no call through lib/foundry/fsPort — the seam is not threaded").toBeGreaterThan(0);
  const lastUnlink = Math.max(...log.filter((e) => e.op === "unlink").map((e) => e.k!));
  const manifest = log.find((e) => label(e) === "writeJsonAtomic run.json")!.k!;
  const window = log.filter((e) => e.k! > lastUnlink && e.k! <= manifest);
  // Derived from the log, so it cannot silently be empty.
  expect(window.length, "there are effects between the unlinks and run.json").toBeGreaterThan(0);

  for (const e of window) {
    const r = await crashThenRetry(e.k!);
    // The rejected files really are gone at this crash — otherwise I2 is vacuous here.
    expect(r.filesAtCrash, `k=${e.k}: the rejected files are unlinked before the crash`).not.toContain("sc1/haze--ref--s1.png");
    expect(r.filesAtCrash).not.toContain("sc2/haze--ref--s2.png");
    expect(r.filesAtCrash, `k=${e.k}: the kept file survives`).toContain("sc0/haze--ref--s0.png");
    expect(r.atCrash, `k=${e.k} (${r.crashed}) at the crash`).toEqual([]);
    expect(r.afterRetry, `k=${e.k} (${r.crashed}) after the retry`).toEqual([]);
    console.log(`[effects] crash at k=${e.k} (${r.crashed}): I1/I2 hold at the crash and after the retry`);
  }
});
