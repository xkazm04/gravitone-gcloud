// LANE — ONE VERDICT KERNEL FOR FOUR GATES (dynamic).
//
// The forge cull, the extractor, the Dojo and the strips triage each kept a
// copy of the same writer: read the manifest, filter the map, replace
// verdicts.json whole — last writer wins, no lock, no history, and (extract)
// a reject's note dropped on the floor. lib/foundry/verdictLog.ts replaces the
// four with one kernel: keyed PATCHes against a revision (a stale base is a
// 409 carrying the current rev), a per-run lock the commits also hold (run,
// then catalogue — one order), and verdicts.log.jsonl, one line per changed
// key with who decided and from which surface.
//
// Cases (challenge 2026-10-10, foundry-engine/A):
//   1. a stale baseRev is 409 with currentRev; the map and the log hold only the first
//   2. sequential revs on an extract run: both keys, rev 2, two attributed log lines
//   3. an extract reject keeps reasons and note, and the log line carries reasons
//   4. RACE, both orders: a patch and commitExtractRun never disagree
//   5. legacy maps with no revision on all four gates read as rev 0 and survive a patch
//   6. a Dojo clear is logged as op 'clear'; a strips chip outside STRIP_CHIPS writes nothing
//   7. a model keep never promotes a forge style to proven, in preview or commit
//   8. [guard] PUT still takes a whole map through the kernel; identical map logs nothing
//   9. wiring: the four Board packet sources patch through the kernel and the four stores write through it
//
// Phase 6 wave C (L70): the v1 /api/foundry/{runs,extract,training,strips}/[id]/verdicts routes
// retired with the v1 Foundry; the Board's packet sources (lib/decision/v1/sources/*) are the
// kernel's callers now. Case 8's route half drives the same store doors the PUT/PATCH did
// (putVerdicts, then parseVerdictPatch -> patchVerdicts), and 9 reads the sources for the call.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { EXTRACT_ROOT, commitExtractRun, getExtractRun, patchExtractVerdicts, putExtractVerdicts } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, Observables } from "@/lib/foundry/extract/types";
import { __setFoundryFsPort } from "@/lib/foundry/fsPort";
import { FoundryError } from "@/lib/foundry/runStore";
import { OUT_ROOT, commitRun, getRun, patchVerdicts, previewCommit, putVerdicts } from "@/lib/foundry/store";
import { getStripRun, patchStripVerdicts, putStripVerdicts } from "@/lib/foundry/strips/store";
import type { StripCard, StripRun } from "@/lib/foundry/strips/types";
import { getCycle, patchTrainingVerdicts, putTrainingVerdicts } from "@/lib/foundry/training/store";
import type { CycleManifest } from "@/lib/foundry/training/types";
import type { Candidate, RunManifest, StyleDef } from "@/lib/foundry/types";
import { VERDICT_LOG, VerdictRevConflict, parseVerdictPatch } from "@/lib/foundry/verdictLog";

import { Interleaver, interleavedPort, stripAt } from "./_effects";
import { keepEnv, probeFoundryDir, probeTrainingDir, stripComments } from "./_helpers";

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH"]);
const foundryDir = probeFoundryDir();

const trainingDir = probeTrainingDir();
const STRIPS_ROOT = path.join(process.cwd(), "foundry-out", "strips");
const SECRET = "verdict-patch-probe-secret";

const made: string[] = [];
const uid = (p: string) => `probe-vp-${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

test.beforeEach(() => {
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
});
test.afterEach(() => {
  __setFoundryFsPort(null);
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
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

const cid = (i: number) => `sc${i}/haze--ref--s${i}`;

/** A finished forge run: one `haze` candidate on each of two scenes. */
function forgeRun(verdicts?: Record<string, unknown>): string {
  const id = uid("forge");
  const dir = path.join(OUT_ROOT, id);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  const candidates: Candidate[] = [0, 1].map((i) => ({
    id: cid(i),
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
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run), "utf8");
  if (verdicts) writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return id;
}

/** A finished extract run with styles `styleA` and `styleB`. */
function extractRun(verdicts?: Record<string, unknown>): string {
  const id = uid("ex");
  const dir = path.join(EXTRACT_ROOT, id);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  const style = (sid: string) => ({
    id: sid,
    name: sid,
    family: "f",
    members: ["s01"],
    observables: Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, `${sid}-x`])) as Observables,
    recipe: "r",
    negative: "n",
    recipe_history: ["r"],
    grouped_by: "singleton" as const,
    replicas: [],
    transfers: [],
  });
  const m: ExtractManifest = {
    id,
    slug: id,
    created: new Date().toISOString(),
    status: "done",
    progress: { stage: "done", done: 1, total: 1 },
    options: { rounds: 1, replicas: 1, transfers: 0, target: 0.9, seed: 1, grouping: "none" },
    sources: [{ id: "s01", name: "a.png", file: "sources/s01.png", mime: "image/png", width: 8, height: 8, aspect: "1:1", readback: null, error: null }],
    styles: [style("styleA"), style("styleB")],
    engines: {},
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m), "utf8");
  if (verdicts) writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return id;
}

/** A cycle awaiting the gate with improvements imp-1 and imp-2. */
function cycle(verdicts?: Record<string, unknown>): string {
  const id = uid("dojo");
  const dir = path.join(trainingDir(), id);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  const imp = (iid: string) => ({
    id: iid,
    technique: `t-${iid}`,
    subject: "portrait",
    claim: "c",
    standard: "portrait/x",
    challenger_recipe: "c",
    baseline_recipe: "b",
    pairs: [],
  });
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
    improvements: [imp("imp-1"), imp("imp-2")],
  };
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify(m), "utf8");
  if (verdicts) writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return id;
}

/** A strip run awaiting triage with two rendered cards. */
function stripRun(verdicts?: Record<string, unknown>): string {
  const id = uid("strips");
  const dir = path.join(STRIPS_ROOT, id);
  made.push(dir);
  const card = (c: string): StripCard => ({ id: c, lane: "edu", case: "edu-01", approach: "E01", effort: "medium", status: "rendered", rounds: 0, authorMs: 1, renderMs: 1, files: { html: "strip.html" } });
  const cards = [card("edu-edu-01--E01"), card("edu-edu-01--E02")];
  for (const c of cards) mkdirSync(path.join(dir, c.id), { recursive: true });
  const run: StripRun = {
    version: 1,
    id,
    at: new Date().toISOString(),
    width: { edu: 1920, stat: 1080 },
    height: { edu: 1080, stat: 1920 },
    fps: 30,
    frames: 240,
    approaches: [{ id: "E01", lane: "edu", case: "edu-01", name: "Ink", medium: "svg", grammar: "draw-on", density: "low", leonardo: "none", direction: "d", falsifier: "f" }],
    cards,
    status: "awaiting-triage",
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run), "utf8");
  if (verdicts) writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return id;
}

interface LogLine {
  at: string;
  rev: number;
  op: "set" | "clear";
  key: string;
  by: string;
  surface: string;
  value?: { verdict?: string; reasons?: string[]; note?: string } | string | null;
}
const logOf = (dir: string): LogLine[] => {
  const f = path.join(dir, VERDICT_LOG);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LogLine);
};
const mapOf = (dir: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(dir, "verdicts.json"), "utf8"));

async function refusal(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return null;
}

/* ── 1. a stale base is refused with the current rev ──────────────────────── */

test("1. forge: a patch on a stale baseRev is 409 carrying currentRev; the map and log hold only the first", async () => {
  const id = forgeRun();
  const dir = path.join(OUT_ROOT, id);
  const first = await patchVerdicts(id, { set: { [cid(0)]: { verdict: "keep" } }, baseRev: 0, by: "human", surface: "foundry" });
  expect(first.rev).toBe(1);
  const err = await refusal(patchVerdicts(id, { set: { [cid(1)]: { verdict: "reject" } }, baseRev: 0, by: "human", surface: "board" }));
  console.log(`[verdicts] stale base -> ${err instanceof FoundryError ? `${err.status} rev ${(err as VerdictRevConflict).currentRev}` : String(err)}`);
  expect(err).toBeInstanceOf(FoundryError);
  expect((err as FoundryError).status).toBe(409);
  expect((err as VerdictRevConflict).currentRev).toBe(1);
  expect(Object.keys(mapOf(dir))).toEqual([cid(0)]);
  expect(logOf(dir)).toHaveLength(1);
});

/* ── 2. sequential revs, attributed log ───────────────────────────────────── */

test("2. extract: two patches on correct revs keep both keys at rev 2, each log line attributed", async () => {
  const id = extractRun();
  const dir = path.join(EXTRACT_ROOT, id);
  await patchExtractVerdicts(id, { set: { styleA: { verdict: "keep" } }, baseRev: 0, by: "human", surface: "foundry" });
  const after = await patchExtractVerdicts(id, { set: { styleB: { verdict: "reject" } }, baseRev: 1, by: "model", surface: "board" });
  expect(after.rev).toBe(2);
  const detail = await getExtractRun(id);
  expect(detail.rev).toBe(2);
  expect(Object.keys(detail.verdicts).sort()).toEqual(["styleA", "styleB"]);
  const log = logOf(dir);
  expect(log.map((l) => [l.key, l.by, l.surface, l.rev])).toEqual([
    ["styleA", "human", "foundry", 1],
    ["styleB", "model", "board", 2],
  ]);
});

/* ── 2b. the log names the record's own decider ───────────────────────────── */

test("2b. forge: a model keep applied by a human patch is logged by the model, as verdicts.json says; a bare record takes the patch's by", async () => {
  const id = forgeRun();
  const dir = path.join(OUT_ROOT, id);
  await patchVerdicts(id, { set: { [cid(0)]: { verdict: "keep", by: "model" }, [cid(1)]: { verdict: "reject" } }, baseRev: 0, by: "human", surface: "board" });
  const map = mapOf(dir) as Record<string, { by?: string }>;
  const log = logOf(dir);
  console.log(`[verdicts] record by ${map[cid(0)]?.by}/${map[cid(1)]?.by}, log by ${log.map((l) => l.by).join("/")}`);
  expect(log.map((l) => [l.key, l.by])).toEqual([[cid(0), "model"], [cid(1), "human"]]);
  for (const l of log) expect(l.by, l.key).toBe(map[l.key]?.by);
});

/* ── 3. reasons and note survive ──────────────────────────────────────────── */

test("3. extract: a reject keeps its reasons and note, and the log line carries the reasons", async () => {
  const id = extractRun();
  await patchExtractVerdicts(id, { set: { styleA: { verdict: "reject", reasons: ["style"], note: "too flat" } }, baseRev: 0, by: "human", surface: "foundry" });
  const rec = (await getExtractRun(id)).verdicts.styleA;
  expect(rec?.verdict).toBe("reject");
  expect(rec?.reasons).toEqual(["style"]);
  expect(rec?.note).toBe("too flat");
  const [line] = logOf(path.join(EXTRACT_ROOT, id));
  expect(typeof line.value === "object" && line.value ? line.value.reasons : null).toEqual(["style"]);
});

/* ── 4. the race against the commit, both orders ──────────────────────────── */

const isVerdictWrite = (e: { actor: string; op: string; file: string }) => e.op === "writeJsonAtomic" && path.basename(e.file) === "verdicts.json";
// The commit's last word is its manifest: run.json flips to `committed` there. (Phase 5: its
// catalogue write is a kernel store transaction, off the fs port, so the race parks the commit
// at the manifest instead - still inside the run lock a racing patch must wait behind.)
const isManifestWrite = (e: { op: string; file: string }) => e.op === "writeJsonAtomic" && path.basename(e.file) === "run.json";

for (const first of ["patch", "commit"] as const) {
  test(`4. RACE (${first} first): a patch and commitExtractRun never disagree about what was kept`, async () => {
    writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [] }), "utf8");
    const id = extractRun({ styleA: { verdict: "keep", at: new Date().toISOString() } });
    const dir = path.join(EXTRACT_ROOT, id);
    const il = new Interleaver((e) => (e.actor === "patch" && isVerdictWrite(e)) || (e.actor === "commit" && isManifestWrite(e)));
    __setFoundryFsPort(interleavedPort(il));

    const patch = () => patchExtractVerdicts(id, { set: { styleB: { verdict: "keep" } }, baseRev: 0, by: "human", surface: "probe" });
    const commit = () => commitExtractRun(id);
    let pp, pc;
    if (first === "patch") {
      pp = il.start("patch", patch);
      expect(await il.advanceTo("patch", isVerdictWrite)).toBe("parked");
      pc = il.start("commit", commit);
    } else {
      pc = il.start("commit", commit);
      expect(await il.advanceTo("commit", isManifestWrite)).toBe("parked");
      pp = il.start("patch", patch);
    }
    await il.drain(first, ["patch", "commit"]);
    const [op, oc] = await Promise.all([pp, pc]);
    __setFoundryFsPort(null);

    const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8")) as ExtractManifest;
    const onDisk = mapOf(dir) as Record<string, { verdict: string }>;
    const keptOnDisk = Object.keys(onDisk).filter((k) => onDisk[k].verdict === "keep").sort();
    console.log(`[verdicts] race ${first} first: patch ${op.ok ? "ok" : (op.error as FoundryError).status} commit ${oc.ok ? "ok" : "err"} kept=${run.committed?.kept.join(",")} disk=${keptOnDisk.join(",")}`);
    expect(oc.ok).toBe(true);
    // The invariant in both orders: the commit's record of what was kept IS the map.
    expect([...(run.committed?.kept ?? [])].sort()).toEqual(keptOnDisk);
    if (first === "patch") {
      expect(op.ok).toBe(true);
      expect(keptOnDisk).toEqual(["styleA", "styleB"]);
    } else {
      expect(op.ok).toBe(false);
      expect((op as { error: FoundryError }).error.status).toBe(409);
      expect((op as { error: FoundryError }).error.message).toMatch(/committed/);
      expect(keptOnDisk).toEqual(["styleA"]);
      expect(logOf(dir)).toHaveLength(0);
    }
  });
}

/* ── 5. legacy maps on all four gates ─────────────────────────────────────── */

test("5. legacy verdicts.json with no revision reads as rev 0 on all four gates; a baseRev-0 patch writes rev 1 and keeps the old keys", async () => {
  const at = "2026-10-01T00:00:00.000Z";

  const f = forgeRun({ [cid(0)]: { verdict: "keep", at } });
  expect((await getRun(f)).rev).toBe(0);
  expect((await patchVerdicts(f, { set: { [cid(1)]: { verdict: "reject" } }, baseRev: 0 })).rev).toBe(1);
  expect(Object.keys((await getRun(f)).verdicts).sort()).toEqual([cid(0), cid(1)]);

  const e = extractRun({ styleA: { verdict: "keep", at } });
  expect((await getExtractRun(e)).rev).toBe(0);
  expect((await patchExtractVerdicts(e, { set: { styleB: { verdict: "reject" } }, baseRev: 0 })).rev).toBe(1);
  expect(Object.keys((await getExtractRun(e)).verdicts).sort()).toEqual(["styleA", "styleB"]);

  const d = cycle({ "imp-1": "approve" });
  expect((await getCycle(d)).rev).toBe(0);
  expect((await patchTrainingVerdicts(d, { set: { "imp-2": "reject" }, baseRev: 0 })).rev).toBe(1);
  expect((await getCycle(d)).verdicts).toEqual({ "imp-1": "approve", "imp-2": "reject" });

  const s = stripRun({ "edu-edu-01--E01": { verdict: "keep", at } });
  expect((await getStripRun(s)).rev).toBe(0);
  expect((await patchStripVerdicts(s, { set: { "edu-edu-01--E02": { verdict: "reject", chips: ["motion"] } }, baseRev: 0 })).rev).toBe(1);
  expect(Object.keys((await getStripRun(s)).verdicts).sort()).toEqual(["edu-edu-01--E01", "edu-edu-01--E02"]);
});

/* ── 6. Dojo clear, strips refusal ────────────────────────────────────────── */

test("6. dojo: a clear removes the key and logs op 'clear'; strips: a chip outside STRIP_CHIPS is 400 and writes nothing", async () => {
  const d = cycle({ "imp-1": "approve" });
  const res = await patchTrainingVerdicts(d, { clear: ["imp-1"], baseRev: 0, by: "human", surface: "foundry" });
  expect(res.verdicts).toEqual({});
  const dl = logOf(path.join(trainingDir(), d));
  expect(dl.map((l) => [l.op, l.key])).toEqual([["clear", "imp-1"]]);

  const s = stripRun();
  const sdir = path.join(STRIPS_ROOT, s);
  const err = await refusal(patchStripVerdicts(s, { set: { "edu-edu-01--E01": { verdict: "keep", chips: ["concept", "vibes"] } }, baseRev: 0 }));
  expect((err as FoundryError).status).toBe(400);
  expect((err as FoundryError).message).toContain("vibes");
  expect(existsSync(path.join(sdir, "verdicts.json"))).toBe(false);
  expect(logOf(sdir)).toHaveLength(0);
  expect((await getStripRun(s)).rev).toBe(0);
});

/* ── 7. a model keep never mints proven ───────────────────────────────────── */

for (const [label, byOf1, expected] of [
  ["one keep by:model", "model", "candidate"],
  ["both keeps by:human", "human", "proven"],
  ["legacy keeps with no by", undefined, "proven"],
] as const) {
  test(`7. forge proven rule, ${label}: preview and commit both say ${expected}`, async () => {
    writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
    const at = new Date().toISOString();
    const rec = (by: string | undefined) => ({ verdict: "keep", at, ...(by ? { by } : {}) });
    const id = forgeRun({ [cid(0)]: rec(label.startsWith("legacy") ? undefined : "human"), [cid(1)]: rec(byOf1) });
    const plan = await previewCommit(id, "leave");
    await commitRun(id, "leave");
    const haze = (JSON.parse(readFileSync(path.join(foundryDir(), "styles.json"), "utf8")) as { styles: StyleDef[] }).styles.find((s) => s.id === "haze")!;
    console.log(`[verdicts] ${label}: promotions=${plan.promotions.join(",") || "none"} status=${haze.status}`);
    expect(haze.status).toBe(expected);
    expect(plan.promotions).toEqual(expected === "proven" ? ["haze"] : []);
    // The export speaks v1's words: an operator's row carries no `by` (absent always meant a
    // human's), so the plan's explicit "human" is compared as that absence.
    const human = (rows: { by?: string }[]) => rows.map(({ by, ...r }) => (by === "human" ? r : { ...r, by }));
    expect(stripAt(haze.evidence.filter((e) => e.run === id))).toEqual(stripAt(human(plan.evidence.haze)));
  });
}

/* ── 8. [guard] whole-map PUT, through the kernel ─────────────────────────── */

test("8. [guard] PUT on all four gates writes through the kernel: rev bumps, one line per changed key, none for an identical map", async () => {
  const at = "2026-10-02T00:00:00.000Z";
  const cases: [string, string, () => Promise<unknown>, () => Promise<number>][] = [];

  const f = forgeRun();
  const fmap = { [cid(0)]: { verdict: "keep", at }, [cid(1)]: { verdict: "reject", at } };
  cases.push(["forge", path.join(OUT_ROOT, f), () => putVerdicts(f, fmap as never), async () => (await getRun(f)).rev ?? -1]);
  const e = extractRun();
  const emap = { styleA: { verdict: "keep", at }, styleB: { verdict: "reject", at } };
  cases.push(["extract", path.join(EXTRACT_ROOT, e), () => putExtractVerdicts(e, emap as never), async () => (await getExtractRun(e)).rev ?? -1]);
  const d = cycle();
  const dmap = { "imp-1": "approve", "imp-2": "reject" } as const;
  cases.push(["dojo", path.join(trainingDir(), d), () => putTrainingVerdicts(d, dmap), async () => (await getCycle(d)).rev ?? -1]);
  const s = stripRun();
  const smap = { "edu-edu-01--E01": { verdict: "keep", at }, "edu-edu-01--E02": { verdict: "reject", at, chips: ["motion"] } };
  cases.push(["strips", path.join(STRIPS_ROOT, s), () => putStripVerdicts(s, smap), async () => (await getStripRun(s)).rev]);

  for (const [name, dir, put, rev] of cases) {
    await put();
    expect(await rev(), name).toBe(1);
    expect(logOf(dir), name).toHaveLength(2);
    await put();
    expect(await rev(), `${name}: an identical map is not a change`).toBe(1);
    expect(logOf(dir), name).toHaveLength(2);
  }

  // What the retired PUT/PATCH did, through the same doors: a whole map replaces; a parsed
  // patch against a stale base is a 409 carrying the current rev; against the right base it lands.
  await putVerdicts(f, { [cid(0)]: { verdict: "keep", at } } as never);
  expect(logOf(path.join(OUT_ROOT, f)).at(-1)).toMatchObject({ op: "clear", key: cid(1), rev: 2 });
  const parse = (body: unknown) => {
    const p = parseVerdictPatch(body);
    if (typeof p === "string") throw new Error(p);
    return p;
  };
  const stale = await patchVerdicts(f, parse({ set: { [cid(1)]: { verdict: "keep" } }, baseRev: 0 })).catch((e: unknown) => e);
  expect(stale).toBeInstanceOf(VerdictRevConflict);
  expect((stale as VerdictRevConflict).status).toBe(409);
  expect((stale as VerdictRevConflict).currentRev).toBe(2);
  const ok = await patchVerdicts(f, parse({ set: { [cid(1)]: { verdict: "keep" } }, baseRev: 2, surface: "board" }));
  expect(ok.rev).toBe(3);
});

/* ── 9. wiring ────────────────────────────────────────────────────────────── */

test("9. wiring: every Board verdict source patches through the kernel, and every store writes verdicts and commits through the kernel's lock", () => {
  const src = (rel: string) => stripComments(readFileSync(path.join(process.cwd(), rel), "utf8"));
  for (const [source, fn] of [
    ["lib/decision/v1/sources/forge.ts", "patchVerdicts("],
    ["lib/decision/v1/sources/extract.ts", "patchExtractVerdicts("],
    ["lib/decision/v1/sources/dojo.ts", "patchTrainingVerdicts("],
    ["lib/decision/v1/sources/strips.ts", "patchStripVerdicts("],
  ]) {
    const s = src(source);
    expect(s, source).toContain(fn);
    expect(s, `${source} patches against a revision`).toMatch(/baseRev:/);
  }
  for (const store of ["lib/foundry/store.ts", "lib/foundry/extract/store.ts", "lib/foundry/training/store.ts", "lib/foundry/strips/store.ts"]) {
    const s = src(store);
    expect(s, store).toMatch(/patchVerdictMap\(/);
    expect(s, store).toMatch(/replaceVerdictMap\(/);
    // The forge, Dojo and Strips commits write indices the catalogue lock still fences; the
    // extract commit writes only the style store, whose transaction is its fence (Phase 5).
    if (store === "lib/foundry/extract/store.ts") expect(s, store).toMatch(/withRunLock\([^)]*\)?[\s\S]*commitExtractStylesIn\(/);
    else expect(s, store).toMatch(/withRunLock\([^)]*\)?[\s\S]*withCatalogue\(/);
    // No whole-map write of verdicts.json survives outside the commit.
    const writes = s.match(/writeJsonAtomic\([^)]*"verdicts\.json"/g) ?? [];
    expect(writes.length, `${store}: verdicts.json written outside the kernel`).toBeLessThanOrEqual(1);
  }
});
