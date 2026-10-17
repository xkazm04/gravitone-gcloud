// LANE — THE MANIFEST REACHES THE VERSION (AIO-B session 2).
//
// Session 1 built the dispatch manifest and the assemblers behind it. This lane
// held two halves that make it the creator's:
//
//   · THE CLIENT DOOR - RETIRED (Phase 6 L70). `previewTurn` and `dispatchBlock`
//     (lib/turns/client.ts) asked POST /api/turns/preview and read its answer for
//     the v1 run controls; the route, the door and the controls retired together.
//     What the preview answered from - the assemblers' refusals and manifests, and
//     the router's descent on the managed posture - is pinned by
//     turn-preview.probe.spec.ts directly.
//
//   · THE RECEIPT (kept). Acceptance 7: a version staged after a run carries
//     `engineRun.manifest` — what the engine actually read — and a version
//     staged before that existed still renders its receipt unchanged. The run is
//     the real `recalibrate` turn kind on the real runner, as the script producer
//     (lib/producers/script.ts) runs it; it was the route's `?wait=1` body.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { CONCLUSIONS } from "@/lib/notebook/conclusions";
import { RENDERS } from "@/lib/script/renders";
import { BASELINE, engineRunWith, manifestOf, receiptOf, type Version } from "@/lib/script/versions";
import { RECALIBRATE_SPEC } from "@/lib/turns/kinds/recalibrate";
import { startTurn, whenIdle, type TurnSpec } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, withFakeEngine } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE", "K_SERVICE", "TEXT_TURN_DIR"]);

let turnDir = "";

test.beforeAll(() => {
  turnDir = mkdtempSync(join(tmpdir(), "gravitone-dispatch-turns-"));
});
test.afterAll(() => {
  if (turnDir) rmSync(turnDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  process.env.TEXT_TURN_DIR = turnDir;
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.K_SERVICE;
  process.env.LIGHTTRACK_DISABLE = "1";
});

/** Attributed only in `adjudication`, so the other two renders are withheld —
 *  the note turn-preview.probe and recalibrate-route-e2e drive. */
const NOTE = { kind: "less-focus", cardId: "f-macro-cause" };
const RECAL = { notebook: {}, conclusions: CONCLUSIONS, renders: RENDERS, scope: {}, notes: [NOTE] };

test("acceptance 7: a version staged after a run carries engineRun.manifest, and its receipt names what was held", async () => {
  await withFakeEngine("recalibrate-ok", async () => {
    const out = await startTurn(RECALIBRATE_SPEC as TurnSpec, "p-dispatch-1", RECAL);
    if (!out.ok) throw new Error(`slot held by ${out.holder.id}`);
    const rec = await out.done;
    await whenIdle();
    expect(rec.status, JSON.stringify(rec.error)).toBe("done");
    const result = rec.result as { engine?: unknown; manifest?: unknown };

    // What a landing stamps onto the candidate.
    const engineRun = engineRunWith(result.engine, result.manifest);
    expect(engineRun?.manifest?.renders).toEqual({ sent: ["adjudication"], notSent: ["reversal-chain", "derived-short"] });
    // Sizes and ids only — the manifest never carries the prompt's text.
    expect(JSON.stringify(engineRun!.manifest)).not.toMatch(/## NOTES|## NOTEBOOK/);

    const staged: Version = { ...BASELINE, id: "v2", label: "v2", basedOn: "baseline", engine: "model", engineRun };
    const receipt = receiptOf(staged)!;
    console.log(`[dispatch] receipt: ${receipt}`);
    expect(receipt).toContain("1/3 renders sent");
  });
});

test("acceptance 7: a version staged before the manifest existed still renders its receipt", () => {
  const engineRun = engineRunWith({ kind: "local-claude-code", costUsd: 0.41, durationMs: 200_000, promptChars: 40_000 }, undefined);
  expect(engineRun).toBeDefined();
  expect(engineRun!.manifest).toBeUndefined();
  const old: Version = { ...BASELINE, id: "v2", label: "v2", basedOn: "baseline", engine: "model", engineRun };
  expect(receiptOf(old)).toBe("$0.410 · 3m 20s · 40k prompt chars");
});

test("a damaged manifest is dropped whole, never half-believed", () => {
  const good = { blocks: [{ name: "system", chars: 10 }], renders: { sent: ["a"], notSent: [] }, totalChars: 10, ceilingChars: 100 };
  expect(manifestOf(good)).toEqual(good);
  expect(manifestOf({ ...good, totalChars: "10" })).toBeUndefined();
  expect(manifestOf({ ...good, blocks: [{ name: "system", chars: Number.NaN }] })).toBeUndefined();
  expect(manifestOf({ ...good, renders: { sent: [1], notSent: [] } })).toBeUndefined();
  // And a manifest with no engine account has nothing to ride on.
  expect(engineRunWith(undefined, good)).toBeUndefined();
});
