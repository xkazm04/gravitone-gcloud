// LANE — THE DISPATCH MANIFEST: WHAT THE ENGINE WILL READ, AND WHICH ENGINE, BEFORE SPENDING (AIO-B).
//
// /api/recalibrate and /api/frames decide, before a minutes-long paid turn,
// which renders and conclusions the engine will see and which it will not; the
// router can say which rung would serve. None of that reached the creator until
// after the run, or ever. `POST /api/turns/preview` answers it for free: the
// manifest the assembler would build, the engine that would serve (or every
// reason none can), and how long that turn class has taken here.
//
// Free means: no turn is dispatched, and the only process it may start is the
// router's own `claude --version` probe. Each case that could spawn runs under
// `withFakeEngine`, whose side log records every invocation, so "nothing was
// spawned" is a count, not a hope.
//
// Also here, because it is the same widening: `forceRenders` /
// `forceConclusions`, which put withheld material back in scope — and the stray
// and blind guards have to read that widened scope, or forcing a render in is a
// guaranteed 502.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as previewPOST } from "@/app/api/turns/preview/route";
import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { POST as framesPOST, tooLarge as framesTooLarge } from "@/app/api/frames/route";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { RENDERS } from "@/app/_phases/script/renders";
import { logTurn } from "@/lib/text/log";
import { __resetTurnStats, turnEstimate, turnStats } from "@/lib/text/stats";
import { assembleRecalibrate } from "@/lib/turns/assemble/recalibrate";

import { FAKE_ENGINE_ENV, keepEnv, withFakeEngine } from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "NEXT_PUBLIC_DEV_AUTH",
  "LIGHTTRACK_DISABLE",
  "K_SERVICE",
  "TEXT_TURN_DIR",
]);

// /api/recalibrate runs as a ledger turn since AIO-A stage 2; its records go to
// a temp directory of this file's own, never foundry-out/.
let turnDir = "";
test.beforeAll(() => {
  turnDir = mkdtempSync(join(tmpdir(), "gravitone-preview-turns-"));
});
test.afterAll(() => {
  if (turnDir) rmSync(turnDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  process.env.TEXT_TURN_DIR = turnDir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
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

let ip = 0;
const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.81.0.${++ip}` },
    body: JSON.stringify(body),
  });

async function preview(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await previewPOST(post("http://localhost/api/turns/preview", body));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

type Manifest = {
  blocks: { name: string; chars: number }[];
  renders?: { sent: string[]; notSent: string[] };
  conclusions?: { whole: string[]; held: string[] };
  totalChars: number;
  ceilingChars: number;
};

test("acceptance 1: a note reaching one render previews sent=[A], notSent=[B,C], and spawns nothing with binaries off", async () => {
  await withFakeEngine("recalibrate-ok", async (engine) => {
    const before = engine.calls().length; // the helper's own --version check
    process.env.LOCAL_BINARIES = "off";
    const { status, json } = await preview({ kind: "recalibrate", input: RECAL });
    const m = json.manifest as Manifest;
    console.log(`[preview] recal -> ${status} sent=${m?.renders?.sent} notSent=${m?.renders?.notSent} held=${m?.conclusions?.held.length}`);
    expect(status, String(json.detail)).toBe(200);
    expect(m.renders!.sent).toEqual(["adjudication"]);
    expect(m.renders!.notSent).toEqual(["reversal-chain", "derived-short"]);
    expect(m.conclusions!.held).toContain(HELD);
    // Every character is accounted for by a named block.
    expect(m.blocks.reduce((n, b) => n + b.chars, 0)).toBe(m.totalChars);
    expect(m.blocks.map((b) => b.name)).toContain("renders-not-sent");
    expect(m.totalChars).toBeLessThanOrEqual(m.ceilingChars);
    expect(engine.calls().length, "the preview started a process with LOCAL_BINARIES=off").toBe(before);
  });
});

test("preview spawns nothing beyond the free --version probe when the local engine may run", async () => {
  await withFakeEngine("recalibrate-ok", async (engine) => {
    const before = engine.calls().length;
    const { status, json } = await preview({ kind: "recalibrate", input: RECAL });
    expect(status, String(json.detail)).toBe(200);
    const after = engine.calls().slice(before);
    expect(after.map((c) => c.kind), "the preview dispatched a turn").toEqual(["version"]);
    const e = json.engine as Record<string, unknown>;
    expect(e.available).toBe(true);
    expect(e.provider).toBe("claude-cli");
    expect(e.rung).toBe("preferred");
    expect(e.transport).toBe("local-subprocess");
    expect(e.costBasis).toBe("vendor-reported");
  });
});

test("acceptance 4: managed posture with no cloud key -> unavailable, with both descent reasons", async () => {
  delete process.env.LOCAL_BINARIES;
  process.env.K_SERVICE = "gravitone-probe";
  const { status, json } = await preview({ kind: "recalibrate", input: RECAL });
  const e = json.engine as { available: boolean; provider: unknown; descent: { provider: string; detail: string }[] };
  console.log(`[preview] managed -> ${status} available=${e?.available} descent=${e?.descent?.map((d) => d.provider)}`);
  expect(status, String(json.detail)).toBe(200);
  expect(e.available).toBe(false);
  expect(e.provider).toBeNull();
  expect(e.descent.map((d) => d.provider)).toEqual(["claude-cli", "google"]);
  expect(e.descent[0]!.detail).toMatch(/managed serverless platform/);
  expect(e.descent[1]!.detail).toMatch(/GOOGLE_AI_API_KEY/);
  // The manifest still answers: what WOULD be sent does not depend on who serves.
  expect((json.manifest as Manifest).renders!.sent).toEqual(["adjudication"]);
});

test("acceptance 5: three logged turns of 100/200/300s -> p50 200000ms over n=3, and no record carries the prompt", async () => {
  __resetTurnStats();
  for (const ms of [100_000, 300_000, 200_000])
    logTurn({ turn: "edit-plan", env: "local", ms, promptChars: 40_000, provider: "claude-cli", rung: "preferred", costUsd: 0.4 });
  // Another class and a failure do not leak into this estimate.
  logTurn({ turn: "scene-direction", env: "local", ms: 5, promptChars: 9, provider: "claude-cli", rung: "preferred" });
  logTurn({ turn: "edit-plan", env: "local", ms: 9_000_000, promptChars: 9, kind: "timeout", provider: "claude-cli" });
  expect(turnEstimate("edit-plan", "preferred")).toEqual({ p50Ms: 200_000, n: 3, p50CostUsd: 0.4 });

  for (const r of turnStats()) expect(Object.keys(r)).not.toContain("prompt");
  expect(JSON.stringify(turnStats())).not.toContain("promptChars");

  await withFakeEngine("recalibrate-ok", async () => {
    const { status, json } = await preview({ kind: "recalibrate", input: RECAL });
    expect(status, String(json.detail)).toBe(200);
    expect(json.estimate).toEqual({ p50Ms: 200_000, n: 3, p50CostUsd: 0.4 });
  });
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

test("acceptance 6: a 401-beat frames preview is the POST's own 413 sentence, before any assembly", async () => {
  const beats = Array.from({ length: 401 }, (_, i) => ({ at: `${i}:00`, kind: "hook", text: "x" }));
  const body = { beats, style: "flat ink" };
  const expected = framesTooLarge(body);
  expect(expected).toMatch(/401 beats/);

  // An empty working directory: had the preview assembled first, reading
  // FRAMES-SCENE-PROMPT.md would have failed before the size was ever asked.
  const cwd = process.cwd();
  const empty = mkdtempSync(join(tmpdir(), "gravitone-preview-"));
  let out: Awaited<ReturnType<typeof preview>>;
  try {
    process.chdir(empty);
    out = await preview({ kind: "frames", input: body });
  } finally {
    process.chdir(cwd);
    rmSync(empty, { recursive: true, force: true });
  }
  const viaRoute = await framesPOST(post("http://localhost/api/frames", body));
  const routeJson = (await viaRoute.json()) as Record<string, unknown>;
  expect(out.status).toBe(413);
  expect(out.json.detail).toBe(expected);
  expect(out.json.code).toBe("too-large");
  expect(viaRoute.status).toBe(413);
  expect(routeJson.detail).toBe(out.json.detail);
});

test("a frames preview names its blocks and accounts for every character", async () => {
  await withFakeEngine("recalibrate-ok", async () => {
    const { status, json } = await preview({
      kind: "frames",
      input: { beats: [{ at: "0:00", kind: "hook", text: "x" }], style: "flat ink", template: "mid-educational-video", targetS: 300 },
    });
    expect(status, String(json.detail)).toBe(200);
    const m = json.manifest as Manifest;
    expect(m.blocks.map((b) => b.name)).toEqual(["system", "run", "format", "script", "notebook", "style"]);
    expect(m.blocks.reduce((n, b) => n + b.chars, 0)).toBe(m.totalChars);
    expect((json.engine as Record<string, unknown>).available).toBe(true);
  });
});

test("preview refuses what the run would refuse, and an unknown kind", async () => {
  expect((await preview({ kind: "recalibrate", input: { renders: RENDERS, notes: [] } })).status).toBe(400);
  expect((await preview({ kind: "frames", input: { beats: [] } })).status).toBe(400);
  const unknown = await preview({ kind: "research", input: {} });
  expect(unknown.status).toBe(400);
  expect(String(unknown.json.detail)).toMatch(/recalibrate/);
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

/** The synchronous body (`?wait=1`; the route answers 202 by default since
 *  AIO-A stage 2), one project per call so no case waits on another's slot. */
let recalProject = 0;
async function recalibrate(body: unknown) {
  const res = await recalibratePOST(
    post("http://localhost/api/recalibrate?wait=1", { ...(body as object), projectId: `p-preview-${++recalProject}` }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

test("acceptance 3: a plan editing a FORCED render is no longer refused as stray", async () => {
  await withFakeEngine("recalibrate-stray", async () => {
    const { status, json } = await recalibrate({ ...RECAL, forceRenders: ["reversal-chain"] });
    console.log(`[preview] forced stray -> ${status} ${String(json.detail ?? "").slice(0, 100)}`);
    expect(status, String(json.detail)).toBe(200);
    expect((json.manifest as Manifest).renders!.sent).toContain("reversal-chain");
  });
});

test("acceptance 3: a plan resting on a FORCED conclusion is no longer refused as blind", async () => {
  await withFakeEngine("recalibrate-blind", async () => {
    const { status, json } = await recalibrate({ ...RECAL, forceConclusions: [HELD] });
    console.log(`[preview] forced blind -> ${status} ${String(json.detail ?? "").slice(0, 100)}`);
    expect(status, String(json.detail)).toBe(200);
  });
});
