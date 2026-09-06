// LANE — WHAT A COMMIT WRITES TO THE VERSIONED INDICES, against a real
// filesystem (dynamic).
//
// `commitRun` and `commitExtractRun` are the only two functions in the app
// that write pipeline/foundry/ledger.json and styles.json, and both files are
// git-TRACKED. That is why neither had a probe: exercising a commit meant
// rewriting two files under version control, and a test lane may not do that.
//
// lib/foundry/store.ts::foundryFile now reads `FOUNDRY_DIR` (the shape
// next.config.ts uses for NEXT_DIST_DIR) so the pair can be aimed at a temp
// directory, and `probeFoundryDir` in _helpers.ts does the aiming. THE FIRST
// TEST HERE IS THE INSTRUMENT'S OWN GATE: it takes the bytes of both tracked
// files, runs a real commit of each kind, and requires the bytes to be
// unchanged — while requiring the temp directory to have received the writes,
// so a probe that silently exercised nothing cannot read as success.

import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { EXTRACT_ROOT, commitExtractRun } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, ExtractedStyle, Observables } from "@/lib/foundry/extract/types";
import { OUT_ROOT, commitRun, foundryFile } from "@/lib/foundry/store";
import type { Candidate, RunManifest, StyleDef, Verdicts } from "@/lib/foundry/types";

import { probeFoundryDir } from "./_helpers";

const foundryDir = probeFoundryDir();

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const observables = (): Observables =>
  Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, "x"])) as Observables;

function styleDef(id: string): StyleDef {
  return {
    id,
    name: id,
    family: "f",
    status: "candidate",
    origin: { kind: "authored" },
    observables: {},
    recipe: "r",
    negative: "n",
    evidence: [],
  };
}

/** A finished forge run on disk, with `n` graded candidates over `n` scenes. */
function forgeRun(id: string, n: number): { id: string; verdicts: Verdicts } {
  const dir = path.join(OUT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const candidates: Candidate[] = [];
  const verdicts: Verdicts = {};
  for (let i = 0; i < n; i++) {
    const cid = `sc${i}/haze--ref--s${i}`;
    candidates.push({
      id: cid,
      scene: `sc${i}`,
      style: "haze",
      mechanism: "ref",
      seed: i,
      file: `${cid}.png`,
      sidecar: `${cid}.json`,
      status: "graded",
      grade: null,
      error: null,
    });
    verdicts[cid] = { verdict: "keep", at: new Date().toISOString() };
  }
  const run: RunManifest = {
    id,
    created: new Date().toISOString(),
    plan: {
      id: "p",
      scenes: candidates.map((c) => ({ id: c.scene, frame: "f" })),
      styles: ["haze"],
      mechanisms: [{ id: "ref", reference: true }],
      seeds: candidates.map((c) => c.seed),
    },
    styles: { haze: styleDef("haze") },
    status: "done",
    progress: { stage: "done", done: n, total: n },
    scenes: candidates.map((c) => ({ id: c.scene, frame: "f", note: "", source: "s.png", annotation: null, annotation_from: null })),
    candidates,
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return { id, verdicts };
}

const extractStyle = (id: string): ExtractedStyle => ({
  id,
  name: id,
  family: "f",
  members: ["s01"],
  observables: observables(),
  recipe: "r",
  negative: "n",
  recipe_history: ["r"],
  grouped_by: "singleton",
  replicas: [],
  transfers: [],
});

/** A finished extract run on disk holding one kept-able style. */
function extractRun(id: string, styleId: string): string {
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
    styles: [extractStyle(styleId)],
    engines: {},
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m), "utf8");
  return id;
}

const readIndex = <T>(name: "ledger.json" | "styles.json"): T =>
  JSON.parse(readFileSync(path.join(foundryDir(), name), "utf8")) as T;

function cleanup(runId: string, extractId: string) {
  rmSync(path.join(OUT_ROOT, runId), { recursive: true, force: true });
  rmSync(path.join(EXTRACT_ROOT, extractId), { recursive: true, force: true });
}

/* ── The instrument's own gate ────────────────────────────────────────────── */

test("FOUNDRY_DIR: a real commit of either kind leaves the TRACKED indices byte-identical", async () => {
  // Resolved with the override OFF, which is what the app, the CLI and the
  // forge see — the paths the rest of this file must not touch.
  const tracked = ["ledger.json", "styles.json"].map((n) => {
    const saved = process.env.FOUNDRY_DIR;
    delete process.env.FOUNDRY_DIR;
    const abs = foundryFile(n as "ledger.json" | "styles.json");
    process.env.FOUNDRY_DIR = saved;
    return abs;
  });
  // The walk read something: both tracked files exist and are non-empty, so
  // "unchanged" below cannot be the absence of a file agreeing with itself.
  for (const f of tracked) {
    expect(existsSync(f), `${f} must exist for this comparison to mean anything`).toBe(true);
    expect(readFileSync(f).length).toBeGreaterThan(2);
  }
  expect(tracked[0].startsWith(foundryDir())).toBe(false);
  const before = tracked.map((f) => readFileSync(f));

  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  const run = forgeRun(`probe-idem-${Date.now().toString(36)}`, 3);
  const ex = extractRun(`probe-ex-${Date.now().toString(36)}`, "haze");
  try {
    await commitRun(run.id, "leave");
    await commitExtractRun(ex, { haze: { verdict: "keep", at: new Date().toISOString() } });

    // The override took the writes...
    const ledger = readIndex<{ rows: unknown[] }>("ledger.json");
    const styles = readIndex<{ styles: StyleDef[] }>("styles.json");
    console.log(`[foundry] under FOUNDRY_DIR: ${ledger.rows.length} ledger row(s), ${styles.styles.length} catalogue style(s)`);
    expect(ledger.rows.length).toBe(3);
    expect(styles.styles.length).toBe(2);

    // ...and the tracked pair did not move a byte.
    for (let i = 0; i < tracked.length; i++) {
      expect(readFileSync(tracked[i]).equals(before[i]), `${tracked[i]} must be untouched by a probe commit`).toBe(true);
    }
  } finally {
    cleanup(run.id, ex);
  }
});
