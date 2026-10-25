// THE FIXTURE PRODUCE SIDE ANSWERS WHAT THE REAL SIDE ANSWERS (app/(studio)/projects/_port).
// GRAVITONE_PRODUCE_SIDE=fixture is how the Plan, Compose, the Floor composers and the Runs acts are
// built, photographed and driven by the fixture lane (tests/live/produce.live.spec.ts), and the MCP
// door answers from the same side. A state the fixture reaches and the kernel cannot (a crashed job
// resumed past its hold, a lane an agent acknowledged) is a screen designed against a port that does
// not exist. Each case drives one verb on BOTH sides and pins the outcome: the code, and the words
// where a toast or an error line shows them, with the job's id put back as the kernel names it.
//
// The real side is the real port over a real kernel in a temp file; nothing here opens the
// operator's store, spends, or runs a worker (the one drive is a producer that refuses its step).

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-produce-parity-"));
  // Every store a real verb could touch is the test's own (CLAUDE.md: never the operator's).
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "process-store.sqlite");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["FOUNDRY_RUNS_DIR"] = path.join(dir, "runs");
  return dir;
});

import path from "node:path";
import { rmSync } from "node:fs";

import { AppError, ok, type Result } from "@gt/domain/errors";
import type { Producer } from "@gt/kernel/job-core";
import { list } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { openKernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";

import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";
import { resetProduce } from "../../app/(studio)/projects/_port/fixture.ts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";

const T0 = Date.parse("2026-10-16T09:00:00.000Z");
const k = openKernel(path.join(ROOT, "store.sqlite"), { clock: () => new Date(T0) });
if (!k.ok) throw k.error;
const store = k.value.store;
const fx = liveEffects(store, blobStore(path.join(ROOT, "blobs")));
afterAll(() => {
  k.value.close();
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});
let n = 0;
const env: Record<string, string | undefined> = { GRAVITONE_DRY_ONLY: "1" };
const real = makeRealProduce({ store: () => ok(store), strips: () => ok({ store, fx }), env: () => env, now: () => T0, cwd: () => process.cwd(), mint: () => `p${++n}` });
const fixture = fixtureProduce();
const op = { who: "op-test" };

beforeEach(() => resetProduce(T0));

/** A verb's outcome as a comparable shape: the code, and the message with `id` spelled `<job>`. */
async function said<T>(r: Result<T> | Promise<Result<T>>, id = "\u0000"): Promise<string> {
  const x = await r;
  return x.ok ? "ok" : `${x.error.code}: ${x.error.message.split(id).join("<job>")}`;
}

/** A launched film on the real side: research queued, the rest planned behind it. */
async function realFilm(): Promise<{ readonly id: string; readonly research: string }> {
  const c = await real.compose({ recipe: "film/short-educational-video" }, op);
  if (!c.ok) throw c.error;
  const id = c.value.id;
  const plan = real.loadPlan({ id });
  if (!plan.ok) throw plan.error;
  const receipt = real.planReceipt({ id });
  if (!receipt.ok) throw receipt.error;
  const l = real.launchPlan({ id, rev: plan.value.project.rev, token: receipt.value.token }, op);
  if (!l.ok || l.value.kind !== "launched") throw new Error("expected a launch");
  return { id, research: `job:part:${id}/research` };
}

/** Drive a real job to `failed`: its producer refuses the one step it plans. */
async function failReal(jobId: string): Promise<void> {
  const refuses: Producer = {
    lane: "seat.text",
    plan: (_j, outputs) => (outputs.has("a") ? [] : [{ name: "a", estimate: { seconds: 1, usd: 0 } }]),
    perform: () => Promise.reject(new AppError("invalid", "the step refused its input")),
  };
  await runJob(fx, refuses, jobId);
  const j = list(store);
  if (!j.ok || j.value.find((x) => x.id === jobId)?.state !== "failed") throw new Error(`expected ${jobId} failed`);
}

const fixtureState = (jobId: string): string | undefined => {
  const j = fixture.listJobs();
  return j.ok ? j.value.find((x) => x.id === jobId)?.state : undefined;
};

describe("a resume takes a paused job back to its queue, and nothing else", () => {
  it("refuses a failed or interrupted job on both sides, in the kernel's words, and moves nothing", async () => {
    const { research } = await realFilm();
    await failReal(research);
    const realSaid = await said(real.resumeJob({ jobId: research }, op), research);
    expect(realSaid).toBe("refused: job <job> is failed; only a paused job resumes");
    // The fixture's seeded crash holds its lane, and its gate-failed frames wait on a new route.
    const interrupted = "job:run:run-seed-suno";
    const failed = "job:part:the-quiet-tariff:frames";
    expect(await said(fixture.resumeJob({ jobId: failed }, op), failed)).toBe(realSaid);
    expect(await said(fixture.resumeJob({ jobId: interrupted }, op), interrupted)).toBe("refused: job <job> is interrupted; only a paused job resumes");
    expect([fixtureState(failed), fixtureState(interrupted)]).toEqual(["failed", "interrupted"]);
  });
});
