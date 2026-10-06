// LANE — THE PRE-FLIGHT REACHES THE RUN CONTROL, AND THE MANIFEST REACHES THE
// VERSION (AIO-B session 2).
//
// Session 1 built POST /api/turns/preview and the assemblers behind it. This
// lane holds the two halves that make it the creator's:
//
//   · THE CLIENT DOOR. `previewTurn` (lib/turns/client.ts) is how the Script
//     pad and the Frames pass ask, and `dispatchBlock` is the one reading of the
//     answer both run controls are disabled by. Driven here through the REAL
//     route — the stubbed `fetch` hands the door's request to the handler — so
//     a wire-shape drift between the two fails here rather than in a browser.
//     Acceptance 4's client half: on the managed posture with no cloud key the
//     control is blocked with both of the router's reasons, before any click, so
//     no "Simulated instead" candidate can be staged from it.
//
//   · THE RECEIPT. Acceptance 7: a version staged after a run carries
//     `engineRun.manifest` — what the engine actually read — and a version
//     staged before that existed still renders its receipt unchanged.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as previewPOST } from "@/app/api/turns/preview/route";
import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { RENDERS } from "@/app/_phases/script/renders";
import { BASELINE, engineRunWith, manifestOf, receiptOf, type Version } from "@/app/_phases/script/versions";
import { dispatchBlock, previewTurn, type PreviewOutcome } from "@/lib/turns/client";

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

let turnDir = "";
const realFetch = globalThis.fetch;
const seen: { url: string; method: string; body: unknown }[] = [];

test.beforeAll(() => {
  turnDir = mkdtempSync(join(tmpdir(), "gravitone-dispatch-turns-"));
});
test.afterAll(() => {
  globalThis.fetch = realFetch;
  if (turnDir) rmSync(turnDir, { recursive: true, force: true });
});

let ip = 0;
test.beforeEach(() => {
  process.env.TEXT_TURN_DIR = turnDir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.K_SERVICE;
  process.env.LIGHTTRACK_DISABLE = "1";
  seen.length = 0;
  // The browser's fetch, answered by the real route handler.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url !== "/api/turns/preview") throw new Error(`unexpected fetch ${url}`);
    const headers = new Headers(init?.headers);
    headers.set("x-forwarded-for", `10.82.0.${++ip}`);
    return previewPOST(new Request(`http://localhost${url}`, { method: init?.method, headers, body: init?.body }));
  }) as typeof fetch;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Attributed only in `adjudication`, so the other two renders are withheld —
 *  the note turn-preview.probe and recalibrate-route-e2e drive. */
const NOTE = { kind: "less-focus", cardId: "f-macro-cause" };
const RECAL = { notebook: {}, renders: RENDERS, scope: {}, notes: [NOTE] };

test("the door asks the preview route once, with the kind and the run's own body", async () => {
  await withFakeEngine("recalibrate-ok", async () => {
    const out = await previewTurn("recalibrate", RECAL);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ url: "/api/turns/preview", method: "POST", body: { kind: "recalibrate", input: RECAL } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.preview.manifest.renders).toEqual({ sent: ["adjudication"], notSent: ["reversal-chain", "derived-short"] });
    expect(out.preview.engine.available).toBe(true);
    // A preview with an engine that can serve does not block the run.
    expect(dispatchBlock(out)).toBeNull();
  });
});

test("acceptance 4 (client): managed posture, no cloud key -> the run control is blocked with both reasons", async () => {
  delete process.env.LOCAL_BINARIES;
  process.env.K_SERVICE = "gravitone-probe";
  const out = await previewTurn("recalibrate", RECAL);
  const block = dispatchBlock(out);
  console.log(`[dispatch] managed -> ${block?.reason} ${block?.descent.map((d) => d.provider)}`);
  expect(block).not.toBeNull();
  expect(block!.descent.map((d) => d.provider)).toEqual(["claude-cli", "google"]);
  expect(block!.descent[1]!.detail).toMatch(/GOOGLE_AI_API_KEY/);
});

test("a refusal the route would answer blocks the run with the route's own sentence", async () => {
  const beats = Array.from({ length: 401 }, (_, i) => ({ at: `${i}:00`, kind: "hook", text: "x" }));
  const out = await previewTurn("frames", { beats, style: "flat ink" });
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.status).toBe(413);
  expect(dispatchBlock(out)).toEqual({ reason: out.detail, descent: [] });
  expect(out.detail).toMatch(/401 beats/);
});

test("a preview that failed for any other reason is advisory: it never blocks the run", () => {
  const failed = (status: number): PreviewOutcome => ({ ok: false, status, detail: "x" });
  for (const status of [401, 403, 429, 500, 502]) expect(dispatchBlock(failed(status)), String(status)).toBeNull();
  expect(dispatchBlock(null)).toBeNull();
});

test("acceptance 7: a version staged after a run carries engineRun.manifest, and its receipt names what was held", async () => {
  await withFakeEngine("recalibrate-ok", async () => {
    const res = await recalibratePOST(
      new Request("http://localhost/api/recalibrate?wait=1", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.82.1.1" },
        body: JSON.stringify({ ...RECAL, projectId: "p-dispatch-1" }),
      }),
    );
    const json = (await res.json()) as { engine?: unknown; manifest?: unknown; detail?: string };
    expect(res.status, json.detail).toBe(200);

    // What useVersions.land stamps onto the candidate.
    const engineRun = engineRunWith(json.engine, json.manifest);
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
