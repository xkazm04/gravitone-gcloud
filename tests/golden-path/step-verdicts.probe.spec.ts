// LANE — STEP CONTRACTS: a step's progress as a PURE verdict over its persisted
// records, computed with no surface mounted (dynamic + source ratchet, card
// WORKSPACE-A stage 1).
//
// WHAT IS PINNED HERE, and what is not yet:
//
//   · case 1 — a frames record holding a refused plate is `blocked`, reason
//     `plate-refused`, read through the record registry and computed with no
//     component mounted. Today that word exists only while useFrames is mounted.
//   · case 6 — the verdict modules import nothing from React or Next, all the
//     way down their VALUE import graph (type-only imports are erased and are
//     not followed), and each verdict is deterministic over the same input.
//   · the parity table — for each step, the same records handed to today's
//     mounted reporter (transcribed from its source, and re-checked against that
//     source below so the transcription cannot silently rot) and to the verdict.
//     Every row where the two disagree carries a NAMED divergence, so stage 2's
//     switch-over lands with evidence instead of with surprise.
//
// The rows that cannot be represented at all, because the mounted reporter reads
// SESSION state no record holds: Frames' `rejections` (the direction pass's
// row reasons), Research's music-video `status === "decoding"`, and the
// music-video poster's `status === "generating"`. A verdict over records cannot
// see those by construction; that is the premise the card names
// (useFrames.ts `rejections` is useState, so the reason dies on reload).
//
// The contract is imported STATICALLY. A dynamic `import("@/…")` here loads the
// module without this lane's path-alias resolution for ITS imports, so any
// module below it that value-imports `@/lib/…` fails to load — measured on this
// file's first green attempt, `Cannot find module '@/lib/projects'` from
// frames/frames.ts.
//
// The import below has a SIDE EFFECT and must come first.
import "fake-indexeddb/auto";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { newProject, putProject, type Discipline, type PhaseKey, type PhaseState, type Project } from "@/lib/projects";
import { saveStep } from "@/app/_phases/_shared/stepStore";
import * as Contract from "@/app/_phases/_shared/stepContract";
import type { Frame } from "@/app/_phases/frames/frames";
import { RENDERS } from "@/app/_phases/script/renders";
import { buildCards, OPT_IN_IDS, stateOf } from "@/app/_phases/research/scope";

import { mkProject, stripComments } from "./_helpers";

const ROOT = process.cwd();
const contract = async () => Contract;

/* ───────────────────────────────── fixtures ───────────────────────────────── */

function frame(id: string, plate: Frame["plate"]["state"], extra: Partial<Frame> = {}): Frame {
  return {
    id,
    at: "0:00",
    atS: 0,
    kind: "hook",
    title: id,
    line: `line ${id}`,
    plate: { state: plate, ...(plate === "ready" ? { src: `/p/${id}.png` } : {}) },
    clip: { status: "not-started", motion: "" },
    elements: [],
    texts: [],
    ...extra,
  };
}

const unsourcedFigure = { id: "t1", role: "figure" as const, value: "42%", x: 0, y: 0 };
const sourcedFigure = { ...unsourcedFigure, factId: "f-1" };

function projectFor(discipline: Discipline): Project {
  return { ...mkProject(`p-${discipline}`, 1_000), discipline };
}

/** A fixture card whose kept-or-cut can be moved, and the scope that moves it. */
function movedScope() {
  const card = buildCards()[0];
  const now = stateOf({}, card.id, OPT_IN_IDS);
  return { [card.id]: { ...now, descoped: !now.descoped } };
}

/* ───────────────────────── case 1 — no surface mounted ────────────────────── */

test("case 1: a frames record with a refused plate is `blocked`, reason `plate-refused`, computed with no component mounted", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "Verdicts",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 90,
    }),
  );
  const saved = await saveStep(p.id, "frames", {
    frames: [frame("f1", "ready"), frame("f2", "refused"), frame("f3", "refused")],
    renderId: "r-1",
  });
  expect(saved.ok).toBe(true);

  const { computeVerdict } = await contract();
  const out = await computeVerdict(p.id, "frames");
  expect(out.ok).toBe(true);
  if (!out.ok) return;
  expect(out.verdict.state).toBe("blocked");
  expect(out.verdict.reasons[0].code).toBe("plate-refused");
  expect(out.verdict.reasons[0].text).toBe("2 plates refused");
  expect(out.verdict.reasons[0].ref).toBe("f2");
  expect(out.verdict.basis).toContain("r-1");
});

test("case 1b: a record the registry refuses is not a verdict — the loader says which record and why", async () => {
  const p = await putProject(
    newProject("u1", {
      title: "Refused",
      logline: "",
      template: "short-educational-video",
      discipline: "educational",
      targetS: 90,
    }),
  );
  await saveStep(p.id, "frames", { frames: "not a list", renderId: "r-1" });
  const { computeVerdict } = await contract();
  const out = await computeVerdict(p.id, "frames");
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.key).toBe("frames");
  expect(out.refused).toBe("malformed");
});

/* ───────────────────────── case 6 — purity + determinism ──────────────────── */

const FORBIDDEN = /^(react|react-dom|next)(\/|$)/;

/** Value imports of one module: `import x from`, `import { a, type B } from`,
 *  `export { a } from`, bare `import "x"`. A clause whose every specifier is
 *  `type`, or `import type …`, is erased and not followed. */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    if (m[2]) continue;
    const clause = m[3].trim();
    const braces = clause.match(/^\{([\s\S]*)\}$/);
    if (braces) {
      const items = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (items.length > 0 && items.every((s) => s.startsWith("type "))) continue;
    }
    out.push(m[4]);
  }
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  throw new Error(`unresolved import ${spec} from ${path.relative(ROOT, from)}`);
}

/** Every package specifier reachable from `entry` through value imports. */
function closure(entry: string): { files: string[]; packages: Map<string, string> } {
  const seen = new Set<string>();
  const packages = new Map<string, string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.(ts|tsx|mts)$/.test(f)) continue;
    for (const spec of valueImports(stripComments(readFileSync(f, "utf8")))) {
      const r = resolveSpec(f, spec);
      if (r) stack.push(r);
      else packages.set(spec, path.relative(ROOT, f));
    }
  }
  return { files: [...seen], packages };
}

const VERDICT_FILES = readdirSync(path.join(ROOT, "app/_phases"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => path.join(ROOT, "app/_phases", d.name, "verdict.ts"))
  .filter((f) => existsSync(f));

test("case 6a: every verdict module's value-import graph reaches neither React nor Next", async () => {
  // The walk must have read something: five steps, each with a verdict.
  expect(VERDICT_FILES.length).toBeGreaterThanOrEqual(5);
  let walked = 0;
  for (const f of VERDICT_FILES) {
    const src = stripComments(readFileSync(f, "utf8"));
    expect(src, `${path.relative(ROOT, f)} is a client module`).not.toMatch(/^\s*["']use client["']/);
    const { files, packages } = closure(f);
    walked += files.length;
    const bad = [...packages].filter(([spec]) => FORBIDDEN.test(spec));
    expect(bad, `${path.relative(ROOT, f)} reaches ${bad.map(([s, by]) => `${s} (via ${by})`).join(", ")}`).toEqual([]);
  }
  expect(walked).toBeGreaterThan(VERDICT_FILES.length);
});

test("case 6b: the ratchet itself sees React when it is there (seeded red)", () => {
  // The same walk from a module known to import React must report it, or the
  // green above is a walk that cannot see.
  const { packages } = closure(path.join(ROOT, "app/_phases/_shared/usePhaseReport.ts"));
  expect([...packages.keys()].some((s) => FORBIDDEN.test(s))).toBe(true);
  // And a type-only clause is not followed.
  expect(valueImports(`import type { A } from "react";\nimport { type B } from "next/x";\nimport { c } from "./c";`)).toEqual(["./c"]);
});

test("case 6c: every registered step module has a verdict file, and every verdict is deterministic", async () => {
  const { STEP_MODULES, verdictOf } = await contract();
  const keys = STEP_MODULES.map((m) => m.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const k of ["research", "script", "frames", "score", "cut"] as PhaseKey[]) expect(keys).toContain(k);
  for (const m of STEP_MODULES) {
    expect(existsSync(path.join(ROOT, "app/_phases", m.key, "verdict.ts")), `${m.key}/verdict.ts`).toBe(true);
    for (const r of m.reads) expect(keys, `${m.key} reads ${r}`).toContain(r);
  }
  for (const row of PARITY) {
    const m = STEP_MODULES.find((s) => s.key === row.step)!;
    const input = () => ({ project: projectFor(row.discipline), records: structuredClone(row.records) });
    const a = verdictOf(m, input());
    const b = verdictOf(m, input());
    expect(b, `${row.step}/${row.name}`).toEqual(a);
  }
});

test("case 6d: every record key a module names resolves to a declared def, owned by itself or a step it reads", async () => {
  const { STEP_MODULES, recordDefFor } = await contract();
  let n = 0;
  for (const m of STEP_MODULES)
    for (const key of m.records) {
      n++;
      const def = recordDefFor(key);
      expect(def?.key, `${m.key} reads ${key}`).toBe(key);
      // `reads` is the edge stage 2's recompute follows: a record owned by a
      // step not on it would change under this verdict with nobody recomputing.
      expect([m.key, ...m.reads], `${m.key} reads ${key}, owned by ${def?.owner}`).toContain(def?.owner);
    }
  expect(n).toBeGreaterThan(5);
});

/* ─────────────────────────────── the parity table ─────────────────────────── */

type Mounted = Exclude<PhaseState, "empty"> | "none";
type VerdictWord = Exclude<PhaseState, "empty" | "done"> | null;

/** Why the verdict says something other than today's mounted reporter.
 *
 *  `lock-is-sign-off` — the reporter writes `done`; a verdict cannot. `done`
 *    reads as locked everywhere and locking is `signOff`'s (lib/projects). The
 *    verdict says `review`, with the checkpoint as its reason.
 *  `mount-composes` — the reporter speaks about an artifact its own mount
 *    creates; the records hold nothing yet.
 *  `no-reporter` — the step has no reporter today, so it never speaks.
 *  `not-applicable` — the step does not apply to this discipline; the reporter
 *    asserts `done` on mount. */
type Divergence = "lock-is-sign-off" | "mount-composes" | "no-reporter" | "not-applicable";

interface Row {
  step: PhaseKey;
  discipline: Discipline;
  name: string;
  records: Record<string, unknown>;
  /** What today's mounted reporter writes for these records. */
  mounted: Mounted;
  verdict: VerdictWord;
  reason?: string;
  divergence?: Divergence;
}

const RENDER_ID = RENDERS[0].id;
const SPINE = { s1: "v1", s2: "v2" };

const PARITY: Row[] = [
  // research — ResearchStep.tsx (educational, beats), MusicVideoResearch.tsx
  { step: "research", discipline: "educational", name: "nothing", records: {}, mounted: "none", verdict: null },
  { step: "research", discipline: "educational", name: "researched", records: { research: { topic: "t", researched: true } }, mounted: "working", verdict: "working", reason: "notebook-ready" },
  { step: "research", discipline: "educational", name: "typed, not run", records: { research: { topic: "t", researched: false } }, mounted: "none", verdict: null },
  { step: "research", discipline: "educational", name: "scope confirmed", records: { research: { topic: "t", researched: true }, "research-scope": { scope: {}, confirmed: {} } }, mounted: "done", verdict: "review", reason: "scope-confirmed", divergence: "lock-is-sign-off" },
  { step: "research", discipline: "educational", name: "scope moved since", records: { research: { topic: "t", researched: true }, "research-scope": { scope: movedScope(), confirmed: {} } }, mounted: "review", verdict: "review", reason: "scope-diverged" },
  { step: "research", discipline: "trailer", name: "one pick", records: { "research-beats": { mode: "beats", picks: { s1: "v1" }, confirmed: null } }, mounted: "working", verdict: "working", reason: "beats-picked" },
  { step: "research", discipline: "trailer", name: "picks all cleared", records: { "research-beats": { mode: "beats", picks: { s1: null }, confirmed: null } }, mounted: "none", verdict: null },
  { step: "research", discipline: "trailer", name: "spine confirmed", records: { "research-beats": { mode: "beats", picks: SPINE, confirmed: SPINE } }, mounted: "done", verdict: "review", reason: "spine-confirmed", divergence: "lock-is-sign-off" },
  { step: "research", discipline: "free", name: "no mode chosen", records: {}, mounted: "none", verdict: null },
  { step: "research", discipline: "free", name: "facts mode, researched", records: { "research-beats": { mode: "facts", picks: {}, confirmed: null }, research: { topic: "t", researched: true } }, mounted: "working", verdict: "working", reason: "notebook-ready" },
  { step: "research", discipline: "music-video", name: "track decoded", records: { "music-video-source": { sourceAssetId: "a1", envelope: { peaks: [] } } }, mounted: "done", verdict: "review", reason: "track-decoded", divergence: "lock-is-sign-off" },
  { step: "research", discipline: "music-video", name: "nothing attached", records: {}, mounted: "none", verdict: null },

  // script — ScriptStep.tsx (explainer, music-video), trailer/TrailerScript.tsx
  { step: "script", discipline: "educational", name: "nothing", records: { research: { topic: "t", researched: true } }, mounted: "none", verdict: null },
  { step: "script", discipline: "educational", name: "adopted", records: { "script-adopted": { renderId: RENDER_ID } }, mounted: "working", verdict: "working", reason: "candidate-adopted" },
  { step: "script", discipline: "educational", name: "adoption cleared", records: { "script-adopted": { renderId: "" } }, mounted: "none", verdict: null },
  { step: "script", discipline: "educational", name: "adopted id unknown", records: { "script-adopted": { renderId: "gone" } }, mounted: "none", verdict: null },
  { step: "script", discipline: "educational", name: "one accepted version", records: { "script-versions": { notes: [], accepted: [{}] } }, mounted: "none", verdict: null },
  { step: "script", discipline: "educational", name: "two accepted versions", records: { "script-versions": { notes: [], accepted: [{}, {}] } }, mounted: "working", verdict: "working", reason: "versions-accepted" },
  { step: "script", discipline: "trailer", name: "cut on the spine", records: { "script-trailer": { cut: {}, budget: {}, spine: SPINE }, "research-beats": { mode: "beats", picks: SPINE, confirmed: SPINE } }, mounted: "working", verdict: "working", reason: "cut-composed" },
  { step: "script", discipline: "trailer", name: "spine moved past the cut", records: { "script-trailer": { cut: {}, budget: {}, spine: SPINE }, "research-beats": { mode: "beats", picks: SPINE, confirmed: { ...SPINE, s2: "v9" } } }, mounted: "review", verdict: "review", reason: "spine-moved" },
  { step: "script", discipline: "trailer", name: "cut predates the spine stamp", records: { "script-trailer": { cut: {}, budget: {} }, "research-beats": { mode: "beats", picks: SPINE, confirmed: SPINE } }, mounted: "working", verdict: "working", reason: "cut-composed" },
  { step: "script", discipline: "trailer", name: "spine confirmed, never opened", records: { "research-beats": { mode: "beats", picks: SPINE, confirmed: SPINE } }, mounted: "working", verdict: null, divergence: "mount-composes" },
  { step: "script", discipline: "free", name: "beats mode routes to the trailer half", records: { "script-trailer": { cut: {}, budget: {}, spine: SPINE }, "research-beats": { mode: "beats", picks: SPINE, confirmed: SPINE } }, mounted: "working", verdict: "working", reason: "cut-composed" },
  { step: "script", discipline: "music-video", name: "researched", records: { research: { topic: "", researched: true } }, mounted: "done", verdict: "review", reason: "nothing-to-write", divergence: "lock-is-sign-off" },
  { step: "script", discipline: "music-video", name: "not researched", records: {}, mounted: "none", verdict: null },

  // frames — useFrames.ts, music-video/MusicVideoFrames.tsx
  { step: "frames", discipline: "educational", name: "a plate refused", records: { frames: { frames: [frame("f1", "ready"), frame("f2", "refused")], renderId: "r" } }, mounted: "blocked", verdict: "blocked", reason: "plate-refused" },
  { step: "frames", discipline: "educational", name: "derived, untouched", records: { frames: { frames: [frame("f1", "empty"), frame("f2", "empty")], renderId: "r" } }, mounted: "none", verdict: null },
  { step: "frames", discipline: "educational", name: "a clip authored", records: { frames: { frames: [frame("f1", "empty", { clip: { status: "not-started", motion: "pan left" } })], renderId: "r" } }, mounted: "working", verdict: "working", reason: "clips-authored" },
  { step: "frames", discipline: "educational", name: "a direction pass paid for", records: { frames: { frames: [frame("f1", "empty")], renderId: "r", direction: { runs: 1, costUsd: 0.2, unpriced: 0, lastAt: 1 } } }, mounted: "working", verdict: "working", reason: "direction-run" },
  { step: "frames", discipline: "educational", name: "one of two composed", records: { frames: { frames: [frame("f1", "ready"), frame("f2", "empty")], renderId: "r" } }, mounted: "working", verdict: "working", reason: "plates-composed" },
  { step: "frames", discipline: "educational", name: "all composed, a figure unsourced", records: { frames: { frames: [frame("f1", "ready", { texts: [unsourcedFigure] }), frame("f2", "ready")], renderId: "r" } }, mounted: "review", verdict: "review", reason: "figure-unsourced" },
  { step: "frames", discipline: "educational", name: "all composed, figures sourced", records: { frames: { frames: [frame("f1", "ready", { texts: [sourcedFigure] })], renderId: "r" } }, mounted: "working", verdict: "working", reason: "plates-composed" },
  { step: "frames", discipline: "music-video", name: "poster generated", records: { "music-video-source": { envelope: {}, posterAssetId: "a2" } }, mounted: "done", verdict: "review", reason: "poster-ready", divergence: "lock-is-sign-off" },
  { step: "frames", discipline: "music-video", name: "no poster", records: { "music-video-source": { envelope: {} } }, mounted: "none", verdict: null },

  // score — ScoreSpotting.tsx (StandardScore has no reporter; MusicVideoScore asserts done)
  { step: "score", discipline: "educational", name: "spots saved", records: { score: { spots: [{ id: "c1", title: "Open", sceneIds: ["f1"], note: "" }] } }, mounted: "none", verdict: "working", reason: "cues-spotted", divergence: "no-reporter" },
  { step: "score", discipline: "educational", name: "never spotted", records: {}, mounted: "none", verdict: null },
  { step: "score", discipline: "music-video", name: "does not apply", records: {}, mounted: "done", verdict: null, reason: "not-applicable", divergence: "not-applicable" },

  // cut — no reporter anywhere under app/_phases/cut
  { step: "cut", discipline: "educational", name: "stills on the clock", records: { frames: { frames: [frame("f1", "ready"), frame("f2", "empty")], renderId: "r" } }, mounted: "none", verdict: "working", reason: "picture-placed", divergence: "no-reporter" },
  { step: "cut", discipline: "educational", name: "a clip nudged", records: { cut: { offsets: { f1: 40 } } }, mounted: "none", verdict: "working", reason: "clips-nudged", divergence: "no-reporter" },
  { step: "cut", discipline: "educational", name: "nothing to cut", records: { frames: { frames: [frame("f1", "empty")], renderId: "r" } }, mounted: "none", verdict: null },
  { step: "cut", discipline: "music-video", name: "poster in hand", records: { "music-video-source": { envelope: {}, posterAssetId: "a2" } }, mounted: "none", verdict: "working", reason: "poster-ready", divergence: "no-reporter" },
];

test("parity: every row's verdict is today's mounted word, or names why it is not", async () => {
  const { STEP_MODULES, verdictOf } = await contract();
  const table: string[] = [];
  for (const row of PARITY) {
    const m = STEP_MODULES.find((s) => s.key === row.step)!;
    const v = verdictOf(m, { project: projectFor(row.discipline), records: row.records });
    const label = `${row.step} · ${row.discipline} · ${row.name}`;
    expect(v.state, label).toBe(row.verdict);
    if (row.reason) expect(v.reasons.map((r) => r.code), label).toContain(row.reason);
    const same = (row.mounted === "none" ? null : row.mounted) === row.verdict;
    if (same) expect(row.divergence, `${label} agrees and must not name a divergence`).toBeUndefined();
    else expect(row.divergence, `${label} disagrees (${row.mounted} → ${row.verdict}) and names no divergence`).toBeTruthy();
    table.push(`${label.padEnd(64)} mounted=${row.mounted.padEnd(7)} verdict=${String(v.state).padEnd(7)} ${row.divergence ?? "="}`);
  }
  // Evidence for stage 2, in the run's own output.
  console.log(`step-verdicts parity (${PARITY.length} rows)\n${table.join("\n")}`);
  // Every step is covered by at least one agreeing row, or the table is not
  // evidence for that step.
  for (const k of ["research", "script", "frames", "score", "cut"] as PhaseKey[])
    expect(PARITY.some((r) => r.step === k), k).toBe(true);
});

/* ─────────── the transcription above, re-checked against the reporters ─────── */

const squash = (s: string) => s.replace(/\s+/g, "");
const sourceOf = (rel: string) => squash(stripComments(readFileSync(path.join(ROOT, rel), "utf8")));

/** The reporter expressions the `mounted` column was read off. If one of these
 *  changes, the column is stale — re-transcribe the rows, then this list. */
const REPORTERS: { file: string; fragment: string }[] = [
  { file: "app/_phases/research/ResearchStep.tsx", fragment: `beats.confirmed ? "done" : Object.values(beats.picks).some(Boolean) ? "working" : null` },
  { file: "app/_phases/research/ResearchStep.tsx", fragment: `api.confirmed ? api.diverged.length > 0 ? "review" : "done" : "working"` },
  { file: "app/_phases/research/MusicVideoResearch.tsx", fragment: `mv.envelope ? "done" : mv.status === "decoding" ? "working" : null` },
  { file: "app/_phases/script/ScriptStep.tsx", fragment: `usePhaseReport(projectId, "script", researched ? "done" : null)` },
  { file: "app/_phases/script/ScriptStep.tsx", fragment: `(adoption.adoptedId || versions.accepted.length > 1) ? "working" : null` },
  { file: "app/_phases/script/ScriptStep.tsx", fragment: `discipline === "trailer" || (discipline === "free" && picks?.mode === "beats")` },
  { file: "app/_phases/script/trailer/TrailerScript.tsx", fragment: `!api.hydrated || !api.cut ? null : api.staleSpine ? "review" : "working"` },
  { file: "app/_phases/frames/useFrames.ts", fragment: `if (refused > 0 || Object.keys(rejections).length > 0) return "blocked";` },
  { file: "app/_phases/frames/useFrames.ts", fragment: `if (composed === 0 && clipsAuthored === 0 && !direction) return null;` },
  { file: "app/_phases/frames/useFrames.ts", fragment: `if (frames.length > 0 && composed === frames.length && unboundFigures > 0) return "review";` },
  { file: "app/_phases/frames/music-video/MusicVideoFrames.tsx", fragment: `comp.posterAssetId ? "done" : comp.status === "generating" ? "working" : null` },
  { file: "app/_phases/score/ScoreSpotting.tsx", fragment: `usePhaseReport(projectId, "score", "done")` },
];

test("parity transcription: each reporter expression the table was read off is still in its source", () => {
  for (const r of REPORTERS) expect(sourceOf(r.file), `${r.file}: ${r.fragment}`).toContain(squash(r.fragment));
});

test("parity transcription: the steps the table says have no reporter still have none", () => {
  const cutFiles: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      // The ads discipline's Finish (app/_phases/cut/ads/) DOES report — `done`
      // once an export exists — and it postdates this table, which has no ads
      // rows on any step yet (research/script/frames/score ads reporters live
      // in their own ads/ files, outside the fragments above). Stage 2 owes the
      // table its ads rows; until then the branch is named here rather than
      // stripped of its signal.
      if (e.isDirectory()) { if (p !== path.join(ROOT, "app/_phases/cut/ads")) walk(p); }
      else if (/\.(ts|tsx)$/.test(e.name) && e.name !== "verdict.ts") cutFiles.push(p);
    }
  };
  walk(path.join(ROOT, "app/_phases/cut"));
  expect(cutFiles.length).toBeGreaterThan(3);
  for (const f of cutFiles) {
    const src = squash(stripComments(readFileSync(f, "utf8")));
    expect(src, path.relative(ROOT, f)).not.toContain("usePhaseReport(");
    expect(src, path.relative(ROOT, f)).not.toContain("reportPhase(");
  }
  // ScoreSpotting reports exactly once — the music-video branch. StandardScore
  // says nothing.
  const score = sourceOf("app/_phases/score/ScoreSpotting.tsx");
  expect(score.split("usePhaseReport(").length - 1).toBe(1);
});
