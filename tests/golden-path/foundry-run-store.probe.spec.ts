// LANE — THE FOUNDRY RUN STORE KERNEL AND CONCURRENT WRITES (dynamic).
//
// lib/foundry/runStore.ts is the shared kernel for disk operations across:
// - lib/foundry/store.ts (the forge)
// - lib/foundry/extract/store.ts (the style extractor)
// - lib/foundry/training/store.ts (the dojo training loop)
//
// These tests assert:
// 1. Concurrent writes via writeJsonAtomic do not collide on a shared tmp filename.
// 2. Source ratchet: function readJson, function writeJsonAtomic, and RUN_ID_RE
//    occur ONLY in lib/foundry/runStore.ts.
// 3. Guard: forge store disk invariants remain healthy.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { OUT_ROOT, putVerdicts } from "@/lib/foundry/store";
import type { Candidate, RunManifest, Verdicts } from "@/lib/foundry/types";

import { stripComments } from "./_helpers";

function styleDef(id: string) {
  return {
    id,
    name: id,
    family: "f",
    status: "candidate" as const,
    origin: { kind: "authored" as const },
    observables: {},
    recipe: "r",
    negative: "n",
    evidence: [],
  };
}

function forgeRunFixture(id: string): { dir: string; verdictsA: Verdicts; verdictsB: Verdicts } {
  const dir = path.join(OUT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const candidates: Candidate[] = [
    {
      id: "sc0/haze--ref--s0",
      scene: "sc0",
      style: "haze",
      mechanism: "ref",
      seed: 0,
      file: "sc0/haze--ref--s0.png",
      sidecar: "sc0/haze--ref--s0.json",
      status: "graded",
      grade: null,
      error: null,
    },
  ];

  const run: RunManifest = {
    id,
    created: new Date().toISOString(),
    plan: {
      id: "p",
      scenes: [{ id: "sc0", frame: "f" }],
      styles: ["haze"],
      mechanisms: [{ id: "ref", reference: true }],
      seeds: [0],
    },
    styles: { haze: styleDef("haze") },
    status: "done",
    progress: { stage: "done", done: 1, total: 1 },
    scenes: [{ id: "sc0", frame: "f", note: "", source: "s.png", annotation: null, annotation_from: null }],
    candidates,
    log: [],
  };

  const verdictsA: Verdicts = {
    "sc0/haze--ref--s0": { verdict: "keep", at: new Date().toISOString() },
  };
  const verdictsB: Verdicts = {
    "sc0/haze--ref--s0": { verdict: "reject", at: new Date().toISOString() },
  };

  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({}, null, 2), "utf8");

  return { dir, verdictsA, verdictsB };
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

test("concurrent putVerdicts: Promise.all of two writes on the same run both resolve without collision", async () => {
  const id = `probe-race-${Date.now().toString(36)}`;
  const { dir, verdictsA, verdictsB } = forgeRunFixture(id);

  try {
    // Before: both writers share `${file}.${process.pid}.tmp`, so second rename rejects when concurrent.
    await Promise.all([putVerdicts(id, verdictsA), putVerdicts(id, verdictsB)]);

    // putVerdicts REPLACES the whole map, so this race has exactly two legal
    // histories: A's document or B's, each whole. "Either verdict" alone would
    // also accept a document stitched from both writers. A lost update ACROSS
    // keys is a different race (whole-map replace, foundry-engine-B) and the
    // index lost update is foundry-commit-race.probe.spec.ts.
    const saved = JSON.parse(readFileSync(path.join(dir, "verdicts.json"), "utf8")) as Verdicts;
    expect([verdictsA, verdictsB], "the file is one writer's whole document").toContainEqual(saved);
    // writeJsonAtomic's unique tmp names must all have been renamed away.
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp")), "no tmp residue from either writer").toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SOURCE RATCHET: function readJson, function writeJsonAtomic, and RUN_ID regex exist ONLY in runStore.ts", () => {
  const foundryRoot = path.join(process.cwd(), "lib", "foundry");
  const files = walkTsFiles(foundryRoot);

  // Read-nothing guard
  expect(files.length).toBeGreaterThan(4);

  const runStorePath = path.join(foundryRoot, "runStore.ts");
  expect(existsSync(runStorePath), "lib/foundry/runStore.ts must exist as the shared kernel").toBe(true);

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    const code = stripComments(readFileSync(file, "utf8"));

    const hasReadJson = code.includes("function readJson");
    const hasWriteJsonAtomic = code.includes("function writeJsonAtomic");
    const hasSlugRegex = code.includes("/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/");

    if (rel === "lib/foundry/runStore.ts") {
      expect(hasReadJson, "runStore.ts must declare function readJson").toBe(true);
      expect(hasWriteJsonAtomic, "runStore.ts must declare function writeJsonAtomic").toBe(true);
      expect(hasSlugRegex, "runStore.ts must declare RUN_ID regex literal").toBe(true);
    } else {
      expect(hasReadJson, `${rel} must not declare function readJson (import from runStore)`).toBe(false);
      expect(hasWriteJsonAtomic, `${rel} must not declare function writeJsonAtomic (import from runStore)`).toBe(false);
      expect(hasSlugRegex, `${rel} must not declare slug regex literal (import RUN_ID_RE from runStore)`).toBe(false);
    }
  }
});

test("GUARD: existing forge store OUT_ROOT and basic exports remain intact", () => {
  expect(typeof OUT_ROOT).toBe("string");
  expect(OUT_ROOT.endsWith(path.join("foundry-out", "runs"))).toBe(true);
});
