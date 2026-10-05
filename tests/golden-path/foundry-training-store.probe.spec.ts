// LANE — THE DOJO TRAINING DISK LAYER, against the real filesystem (dynamic).
//
// lib/foundry/training/store.ts is the Dojo's gate interface for cycle manifests,
// verdicts, thumbnails, and training-ledger.json.
//
// These tests assert:
// 1. listCycles skips unreadable/corrupt manifests with a warning, returning valid cycles.
// 2. readCycle on malformed cycle.json throws FoundryError with status 503 ("damaged manifest").
// 3. With FOUNDRY_DIR=<tmp>, commitCycle writes ledger and thumbs to tmp, leaving tracked untouched.
// 4. commitCycle failure on ledger write preserves media so retry succeeds without ENOENT.
// 5. Re-committing a cycle replaces its row in training-ledger.json rather than appending duplicates.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { FoundryError } from "@/lib/foundry/store";
import { commitCycle, listCycles, readCycle } from "@/lib/foundry/training/store";
import type { CycleManifest, CycleStatus } from "@/lib/foundry/training/types";

import { probeFoundryDir } from "./_helpers";

const foundryDir = probeFoundryDir();
const TRAINING_ROOT = path.join(process.cwd(), "foundry-out", "training");

function setupProbeCycle(id: string, status: CycleStatus = "awaiting-gate") {
  const dir = path.join(TRAINING_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "pairs", "imp-1"), { recursive: true });

  const baselineRel = "pairs/imp-1/pair-1-baseline.png";
  const challengerRel = "pairs/imp-1/pair-1-challenger.png";

  writeFileSync(path.join(dir, baselineRel), "baseline-image-content", "utf8");
  writeFileSync(path.join(dir, challengerRel), "challenger-image-content", "utf8");

  const cycle: CycleManifest = {
    version: 1,
    id,
    at: new Date().toISOString(),
    dimension: "camera",
    subject: "portrait",
    status,
    media: "image",
    fail_streak: 0,
    log: [],
    improvements: [
      {
        id: "imp-1",
        technique: "low-angle",
        subject: "portrait",
        claim: "better depth",
        standard: "portrait/low-angle",
        challenger_recipe: "challenger-recipe",
        baseline_recipe: "baseline-recipe",
        thumbnail: challengerRel,
        pairs: [
          {
            id: "p1",
            scene: "scene-1",
            seed: 42,
            baseline: { file: baselineRel, kind: "image" },
            challenger: { file: challengerRel, kind: "image" },
            judge_pick: "challenger",
            reason: "cleaner lines",
          },
        ],
      },
    ],
  };

  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify(cycle, null, 2), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ "imp-1": "approve" }, null, 2), "utf8");

  return { dir, cycle, baselineRel, challengerRel };
}

test("listCycles: a corrupt cycle.json is skipped with warning, returning valid runs without 500ing", async () => {
  const corruptId = `probe-corrupt-${Date.now().toString(36)}`;
  const dir = path.join(TRAINING_ROOT, corruptId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "cycle.json"), '{"id": "damaged-json', "utf8");

  const warned: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => warned.push(args.map(String).join(" "));

  try {
    const cycles = await listCycles();
    expect(cycles.some((c) => c.id === corruptId)).toBe(false);
    expect(warned.some((w) => w.includes(corruptId) && (w.includes("unreadable") || w.includes("damaged")))).toBe(true);
  } finally {
    console.warn = orig;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readCycle: malformed cycle.json throws FoundryError with status 503", async () => {
  const corruptId = `probe-corrupt-manifest-${Date.now().toString(36)}`;
  const dir = path.join(TRAINING_ROOT, corruptId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "cycle.json"), '{"id": "damaged-manifest', "utf8");

  try {
    let err: unknown = null;
    try {
      await readCycle(corruptId);
    } catch (e) {
      err = e;
    }
    expect(err instanceof FoundryError).toBe(true);
    expect((err as FoundryError).status).toBe(503);
    expect((err as FoundryError).message).toMatch(/damaged|unreadable/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("commitCycle: with FOUNDRY_DIR=<tmp>, writes ledger and copies keeper thumbs under tmp, leaving tracked untouched", async () => {
  const tmpDir = foundryDir();
  const id = `probe-commit-tmp-${Date.now().toString(36)}`;
  const { dir } = setupProbeCycle(id);

  const trackedLedger = path.join(process.cwd(), "pipeline", "foundry", "training-ledger.json");
  const trackedLedgerBefore = existsSync(trackedLedger) ? readFileSync(trackedLedger, "utf8") : null;
  const trackedThumbsDir = path.join(process.cwd(), "pipeline", "foundry", "training", "thumbs");

  try {
    const res = await commitCycle(id);
    expect(res.ledger_rows).toBe(1);

    // Temp directory received ledger and thumb
    const tmpLedger = path.join(tmpDir, "training-ledger.json");
    expect(existsSync(tmpLedger), "training-ledger.json must be written under FOUNDRY_DIR").toBe(true);
    const ledgerContent = JSON.parse(readFileSync(tmpLedger, "utf8"));
    expect(ledgerContent.rows.some((r: { cycle: string }) => r.cycle === id)).toBe(true);

    const tmpThumb = path.join(tmpDir, "training", "thumbs", `${id}--imp-1.png`);
    expect(existsSync(tmpThumb), "keeper thumbnail must be copied under <tmp>/training/thumbs").toBe(true);

    // Tracked pipeline/foundry/ must be untouched
    const trackedLedgerAfter = existsSync(trackedLedger) ? readFileSync(trackedLedger, "utf8") : null;
    expect(trackedLedgerAfter).toBe(trackedLedgerBefore);
    expect(existsSync(path.join(trackedThumbsDir, `${id}--imp-1.png`))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("commitCycle: directory collision retry recovers, ledger_rows === 1 and thumbnail exists without ENOENT", async () => {
  const tmpDir = foundryDir();
  const id = `probe-retry-dir-${Date.now().toString(36)}`;
  const { dir } = setupProbeCycle(id);

  const tmpLedgerPath = path.join(tmpDir, "training-ledger.json");
  mkdirSync(tmpLedgerPath, { recursive: true });

  try {
    let firstErr: unknown = null;
    try {
      await commitCycle(id);
    } catch (e) {
      firstErr = e;
    }
    expect(firstErr).not.toBeNull();

    // Remove the blocking directory
    rmSync(tmpLedgerPath, { recursive: true, force: true });

    // Retry commitCycle
    const retryRes = await commitCycle(id);
    expect(retryRes.ledger_rows).toBe(1);

    const ledgerContent = JSON.parse(readFileSync(tmpLedgerPath, "utf8"));
    expect(ledgerContent.rows.length).toBe(1);
    expect(ledgerContent.rows[0].cycle).toBe(id);

    const tmpThumb = path.join(tmpDir, "training", "thumbs", `${id}--imp-1.png`);
    expect(existsSync(tmpThumb), "thumbnail must exist after retry").toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("commitCycle: re-commit after reset replaces ledger row, holding 1 row not 2", async () => {
  const tmpDir = foundryDir();
  const id = `probe-dedup-${Date.now().toString(36)}`;
  const { dir } = setupProbeCycle(id);

  try {
    await commitCycle(id);

    // Reset status to 'awaiting-gate' in cycle.json
    const cyclePath = path.join(dir, "cycle.json");
    const cycleData = JSON.parse(readFileSync(cyclePath, "utf8"));
    cycleData.status = "awaiting-gate";
    writeFileSync(cyclePath, JSON.stringify(cycleData, null, 2), "utf8");

    // Commit again
    await commitCycle(id);

    const tmpLedgerPath = path.join(tmpDir, "training-ledger.json");
    const ledgerContent = JSON.parse(readFileSync(tmpLedgerPath, "utf8"));
    const matchingRows = ledgerContent.rows.filter((r: { cycle: string }) => r.cycle === id);
    expect(matchingRows.length).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
