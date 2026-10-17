// LANE — THE DISPATCH MANIFEST: WHAT THE ENGINE WILL READ, AND WHICH ENGINE, BEFORE SPENDING (AIO-B).
//
// The recalibrate and frames turns decide, before a minutes-long paid turn,
// which renders and conclusions the engine will see and which it will not; the
// router can say which rung would serve. `POST /api/turns/preview` answered that
// for free from three lib seams: the assemblers' manifests
// (lib/turns/assemble/*), the router's `engineStatus()` and the turn-time stats
// (lib/text/stats.ts). The route retired with the v1 pages (Phase 6 L70); its
// three seams are what this probe now drives, each directly. DROPPED with the
// route: its envelope (the 200 body, the `estimate` field echo, the unknown-kind
// 400) and its own composition of rung/transport/costBasis, which no caller
// reads now.
//
// Free means: assembling and asking the router spawn nothing but the router's
// own `claude --version` probe. Each case that could spawn runs under
// `withFakeEngine`, whose side log records every invocation, so "nothing was
// spawned" is a count, not a hope.
//
// Also here, because it is the same widening: `forceRenders` /
// `forceConclusions`, which put withheld material back in scope — and the stray
// and blind guards have to read that widened scope, or forcing a render in is a
// guaranteed failure. Those two run the real `recalibrate` turn kind on the real
// runner (lib/turns/runner.ts), the way the script producer runs it.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { CONCLUSIONS } from "@/lib/notebook/conclusions";
import { RENDERS } from "@/lib/script/renders";
import { logTurn } from "@/lib/text/log";
import { engineStatus } from "@/lib/text/router";
import { __resetTurnStats, turnEstimate, turnStats } from "@/lib/text/stats";
import { assembleFrames, framesRefusal, framesSystemPrompt, tooLarge as framesTooLarge } from "@/lib/turns/assemble/frames";
import { assembleRecalibrate, recalibrateRefusal, recalibrateSystemPrompt } from "@/lib/turns/assemble/recalibrate";
import { FRAMES_SPEC } from "@/lib/turns/kinds/frames";
import { RECALIBRATE_SPEC } from "@/lib/turns/kinds/recalibrate";
import { startTurn, TurnInputError, whenIdle, type TurnSpec } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, withFakeEngine } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE", "K_SERVICE", "TEXT_TURN_DIR"]);

// The forced cases run as ledger turns; their records go to a temp directory of
// this file's own, never foundry-out/.
let turnDir = "";
test.beforeAll(() => {
  turnDir = mkdtempSync(join(tmpdir(), "gravitone-preview-turns-"));
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

/** Attributed only in `adjudication` (impact.ts), so the other two renders are
 *  withheld — the same note recalibrate-route-e2e drives. */
const NOTE = { kind: "less-focus", cardId: "f-macro-cause" };
const HELD = "c-one-time-rerating";
const RECAL = { notebook: {}, conclusions: CONCLUSIONS, renders: RENDERS, scope: {}, notes: [NOTE] };

/** The recalibrate manifest as a preview builds it: the refusal first, then the assembler. */
async function recalManifest(input: Record<string, unknown>) {
  return recalibrateRefusal(input) ?? assembleRecalibrate(input, await recalibrateSystemPrompt()).manifest;
}

test("acceptance 1: a note reaching one render previews sent=[A], notSent=[B,C], and spawns nothing with binaries off", async () => {
  await withFakeEngine("recalibrate-ok", async (engine) => {
    const before = engine.calls().length; // the helper's own --version check
    process.env.LOCAL_BINARIES = "off";
    const m = await recalManifest(RECAL);
    if ("status" in m) throw new Error(`refused: ${m.detail}`);
    console.log(`[preview] recal sent=${m.renders?.sent} notSent=${m.renders?.notSent} held=${m.conclusions?.held.length}`);
    expect(m.renders!.sent).toEqual(["adjudication"]);
    expect(m.renders!.notSent).toEqual(["reversal-chain", "derived-short"]);
    expect(m.conclusions!.held).toContain(HELD);
    // Every character is accounted for by a named block.
    expect(m.blocks.reduce((n, b) => n + b.chars, 0)).toBe(m.totalChars);
    expect(m.blocks.map((b) => b.name)).toContain("renders-not-sent");
    expect(m.totalChars).toBeLessThanOrEqual(m.ceilingChars);
    const status = await engineStatus("edit-plan");
    expect(status.serving, "LOCAL_BINARIES=off still served locally").not.toBe("claude-cli");
    expect(engine.calls().length, "assembling or asking the router started a process with LOCAL_BINARIES=off").toBe(before);
  });
});

test("asking which engine would serve spawns nothing beyond the free --version probe", async () => {
  await withFakeEngine("recalibrate-ok", async (engine) => {
    const before = engine.calls().length;
    const status = await engineStatus("edit-plan");
    const after = engine.calls().slice(before);
    expect(after.map((c) => c.kind), "asking the router dispatched a turn").toEqual(["version"]);
    expect(status.serving).toBe("claude-cli");
    expect(status.candidates.find((c) => c.provider === "claude-cli")?.ok).toBe(true);
  });
});

test("acceptance 4: managed posture with no cloud key -> nothing serves, with both descent reasons", async () => {
  delete process.env.LOCAL_BINARIES;
  process.env.K_SERVICE = "gravitone-probe";
  const status = await engineStatus("edit-plan");
  const descent = status.candidates.filter((c) => !c.ok);
  console.log(`[preview] managed -> serving=${status.serving} descent=${descent.map((d) => d.provider)}`);
  expect(status.serving).toBeNull();
  expect(descent.map((d) => d.provider)).toEqual(["claude-cli", "google"]);
  expect(descent[0]!.detail).toMatch(/managed serverless platform/);
  expect(descent[1]!.detail).toMatch(/GOOGLE_AI_API_KEY/);
  // The manifest still answers: what WOULD be sent does not depend on who serves.
  const m = await recalManifest(RECAL);
  expect("status" in m ? null : m.renders!.sent).toEqual(["adjudication"]);
});

test("acceptance 5: three logged turns of 100/200/300s -> p50 200000ms over n=3, and no record carries the prompt", () => {
  __resetTurnStats();
  for (const ms of [100_000, 300_000, 200_000])
    logTurn({ turn: "edit-plan", env: "local", ms, promptChars: 40_000, provider: "claude-cli", rung: "preferred", costUsd: 0.4 });
  // Another class and a failure do not leak into this estimate.
  logTurn({ turn: "scene-direction", env: "local", ms: 5, promptChars: 9, provider: "claude-cli", rung: "preferred" });
  logTurn({ turn: "edit-plan", env: "local", ms: 9_000_000, promptChars: 9, kind: "timeout", provider: "claude-cli" });
  expect(turnEstimate("edit-plan", "preferred")).toEqual({ p50Ms: 200_000, n: 3, p50CostUsd: 0.4 });
  for (const r of turnStats()) expect(Object.keys(r)).not.toContain("prompt");
  expect(JSON.stringify(turnStats())).not.toContain("promptChars");
  __resetTurnStats();
});

test("the stats ring is bounded", () => {
  __resetTurnStats();
  for (let i = 0; i < 1_000; i++)
    logTurn({ turn: "probe", env: "local", ms: i, promptChars: 1, provider: "claude-cli", rung: "preferred" });
  expect(turnStats().length).toBeLessThan(1_000);
  expect(turnStats().length).toBeGreaterThan(0);
  __resetTurnStats();
});

test("acceptance 6: a 401-beat frames run is refused 413 with the size sentence, before any assembly", async () => {
  const beats = Array.from({ length: 401 }, (_, i) => ({ at: `${i}:00`, kind: "hook", text: "x" }));
  const body = { beats, style: "flat ink" };
  const expected = framesTooLarge(body);
  expect(expected).toMatch(/401 beats/);
  // An empty working directory: had the refusal assembled first, reading
  // FRAMES-SCENE-PROMPT.md would have failed before the size was ever asked.
  const cwd = process.cwd();
  const empty = mkdtempSync(join(tmpdir(), "gravitone-preview-"));
  let refused: unknown;
  let viaKind: unknown;
  try {
    process.chdir(empty);
    refused = framesRefusal(body);
    viaKind = await FRAMES_SPEC.prepare(body).then(
      () => null,
      (e: unknown) => e,
    );
  } finally {
    process.chdir(cwd);
    rmSync(empty, { recursive: true, force: true });
  }
  expect(refused).toEqual({ status: 413, detail: expected, code: "too-large" });
  // The kind a run goes through refuses with the same status and sentence.
  expect(viaKind).toBeInstanceOf(TurnInputError);
  expect((viaKind as TurnInputError).status).toBe(413);
  expect((viaKind as TurnInputError).message).toBe(expected);
});

test("a frames manifest names its blocks and accounts for every character", async () => {
  const input = { beats: [{ at: "0:00", kind: "hook", text: "x" }], style: "flat ink", template: "mid-educational-video", targetS: 300 };
  expect(framesRefusal(input)).toBeNull();
  const m = assembleFrames(input, await framesSystemPrompt()).manifest;
  expect(m.blocks.map((b) => b.name)).toEqual(["system", "run", "format", "script", "notebook", "style"]);
  expect(m.blocks.reduce((n, b) => n + b.chars, 0)).toBe(m.totalChars);
});

test("the manifest refuses what the run would refuse", () => {
  expect(recalibrateRefusal({ renders: RENDERS, notes: [] })?.status).toBe(400);
  expect(framesRefusal({ beats: [] })?.status).toBe(400);
});

/* ── acceptance 3: forcing withheld material in ─────────────────────────── */

test("acceptance 3: forceRenders/forceConclusions move material into the manifest's sent set", () => {
  const plain = assembleRecalibrate(RECAL, "SYSTEM\n").manifest;
  expect(plain.renders!.notSent).toContain("reversal-chain");
  expect(plain.conclusions!.held).toContain(HELD);

  const forced = assembleRecalibrate({ ...RECAL, forceRenders: ["reversal-chain"], forceConclusions: [HELD] }, "SYSTEM\n");
  expect(forced.manifest.renders!.sent).toEqual(["reversal-chain", "adjudication"]);
  expect(forced.manifest.renders!.notSent).toEqual(["derived-short"]);
  expect(forced.manifest.conclusions!.whole).toContain(HELD);
  expect(forced.manifest.conclusions!.held).not.toContain(HELD);
  expect(forced.prompt).toContain('"id":"reversal-chain"');

  // A forced id that names no render cannot be sent and is not invented.
  const ghost = assembleRecalibrate({ ...RECAL, forceRenders: ["no-such-render"] }, "SYSTEM\n");
  expect(ghost.manifest.renders!.sent).toEqual(["adjudication"]);
});

/** One recalibrate turn to its end on the real runner, one project per call so no
 *  case waits on another's slot. */
let recalProject = 0;
async function recalibrate(body: unknown) {
  const out = await startTurn(RECALIBRATE_SPEC as TurnSpec, `p-preview-${++recalProject}`, body);
  if (!out.ok) throw new Error(`slot held by ${out.holder.id}`);
  const rec = await out.done;
  await whenIdle();
  return rec;
}

test("acceptance 3: a plan editing a FORCED render is no longer refused as stray", async () => {
  await withFakeEngine("recalibrate-stray", async () => {
    const rec = await recalibrate({ ...RECAL, forceRenders: ["reversal-chain"] });
    console.log(`[preview] forced stray -> ${rec.status} ${String(rec.error?.message ?? "").slice(0, 100)}`);
    expect(rec.status, JSON.stringify(rec.error)).toBe("done");
    expect((rec.result as { manifest: { renders?: { sent: string[] } } }).manifest.renders!.sent).toContain("reversal-chain");
  });
});

test("acceptance 3: a plan resting on a FORCED conclusion is no longer refused as blind", async () => {
  await withFakeEngine("recalibrate-blind", async () => {
    const rec = await recalibrate({ ...RECAL, forceConclusions: [HELD] });
    console.log(`[preview] forced blind -> ${rec.status} ${String(rec.error?.message ?? "").slice(0, 100)}`);
    expect(rec.status, JSON.stringify(rec.error)).toBe("done");
  });
});
