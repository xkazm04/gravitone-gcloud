// THE ALBUM WORDS AND EXPLAINER VOICE ACTS (Phase 4 wave C, L37), through their receipts and
// jobs: words is one `mv-metadata` turn whose answer passes v1's fitter and is booked on the job
// (the words part holds no step record yet); voice needs lines to speak - strip cards with
// captions - and a live job on an option with no engine is refused at its plan step. Voice that
// speaks is tests/next-server/producer-step-voice.test.ts.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const SOUND = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-step-words-sound-"));
  process.env["SOUND_STORE_DIR"] = dir;
  return dir;
});

import { openKernel } from "@gt/kernel/kernel";
import { list } from "@gt/kernel/job";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { driveStep, launchPartAct, partActReceipt, type UnitsFn } from "../../lib/producers/research.ts";
import { NO_LINES, NO_VOICE_ENGINE } from "../../packages/producers/src/voice/define.ts";
import { voiceUnits } from "../../lib/producers/voice.ts";
import { wordsProducer, wordsUnits } from "../../lib/producers/words.ts";

const dirs: string[] = [SOUND];
const kernels: { close(): void }[] = [];
afterAll(() => {
  for (const k of kernels) k.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

function store(recipe: string, id: string): Store {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-step-wv-"));
  dirs.push(dir);
  const k = must(openKernel(path.join(dir, "k.sqlite")));
  kernels.push(k);
  const s = k.store;
  must(compose(s, { recipe, title: "08 Stay" }, OP, { id }));
  return s;
}

async function run(s: Store, ref: { projectId: string; partId: string; act: string }, units: UnitsFn, factory: typeof wordsProducer) {
  const receipt = must(partActReceipt(s, ref, units, { mode: "dry", now: NOW }));
  const l = must(launchPartAct(s, ref, units, { mode: "dry", now: NOW, token: receipt.token, actor: OP }));
  if (l.kind !== "launched") throw new Error("stale");
  return { receipt, report: must(await driveStep(factory, s, l.jobId, { dryOnly: true })) };
}

describe("album words", () => {
  it("prices one seat turn before it runs, runs dry on the stand-in, and books fitted words on the job", async () => {
    const s = store("album-video", "alb");
    const { receipt, report } = await run(s, { projectId: "alb", partId: "alb/words", act: "write-words" }, wordsUnits, wordsProducer);
    expect(receipt.lines[0]).toMatchObject({ lane: "seat.text", usd: null });
    expect(receipt.lines[0]?.unpricedReason).toContain("text seat");
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.map((c) => c.model)).toEqual(["mv-metadata"]);
    const out = must(s.read((r) => r.get("SELECT output FROM job_outputs WHERE step = 'unit:metadata'")));
    expect(String(out?.["output"])).toContain('"title"');
    expect(must(list(s))[0]).toMatchObject({ producer: "words", state: "done", spend: { usd: 0 } });
  });
});

describe("explainer voice", () => {
  it("is refused on its receipt while there are no lines to speak", () => {
    const s = store("explainer", "ex");
    const ref = { projectId: "ex", partId: "ex/voice", act: "record-line" };
    const dry = partActReceipt(s, ref, voiceUnits, { mode: "dry", now: NOW });
    expect(dry.ok ? "" : dry.error.message).toBe(NO_LINES);
    // The live refusal (an option with no engine) is held on literal inputs in packages/producers/test/steps.test.ts.
    expect(NO_VOICE_ENGINE).toContain("no speech engine");
  });
});
