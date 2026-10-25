// THE ALBUM WORDS AND EXPLAINER VOICE ACTS (Phase 4 wave C, L37), through their receipts and
// jobs: words is one `mv-metadata` turn whose answer passes v1's fitter and is booked on the job
// (the words part holds no step record yet); voice has no engine in this studio, so a live job is
// refused at its plan step with that sentence, and a dry one needs lines to speak.

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
import { readPart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { driveStep, launchPartAct, partActReceipt, type UnitsFn } from "../../lib/producers/research.ts";
import { encodeRecord } from "../../packages/domain/src/steps/registry.ts";
import type { PartSnapshot } from "../../packages/kernel/src/parts/driver.ts";
import { FREE } from "../../packages/producers/src/research/partAct.ts";
import { NO_VOICE_ENGINE, voicePlan } from "../../packages/producers/src/voice/define.ts";
import { landVoice, standInSeconds, voiceUnits } from "../../lib/producers/voice.ts";
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

  it("lands what the turn wrote on the words record, beside the job's output", async () => {
    const s = store("album-video", "alb");
    await run(s, { projectId: "alb", partId: "alb/words", act: "write-words" }, wordsUnits, wordsProducer);
    const out = must(s.read((r) => r.get("SELECT output FROM job_outputs WHERE step = 'unit:metadata'")));
    const meta = (JSON.parse(String(out?.["output"])) as { metadata: { title: string; description: string; tags: string[] } }).metadata;
    const rec = must(readPart(s, { projectId: "alb", partId: "alb/words" })).records.get("words");
    expect(rec?.["written"]).toEqual({ title: meta.title, description: meta.description, tags: meta.tags });
    expect(rec?.["title"]).toBe("");
  });
});

describe("explainer voice", () => {
  it("is refused on its receipt while there are no lines to speak", () => {
    const s = store("explainer", "ex");
    const ref = { projectId: "ex", partId: "ex/voice", act: "record-line" };
    const dry = partActReceipt(s, ref, voiceUnits, { mode: "dry", now: NOW });
    expect(dry.ok ? "" : dry.error.message).toBe("record lines needs an adopted script with spoken beats");
    // The live refusal (no engine) is held on literal inputs in packages/producers/test/steps.test.ts.
    expect(NO_VOICE_ENGINE).toContain("no speech engine");
  });

  // The explainer recipe has no script part to adopt lines from, so no driven record-line job can
  // be composed; the stand-in's length is held on the function perform calls.
  it("sizes a stand-in take by the words on the line, not the whitespace around them", () => {
    expect(standInSeconds("  two words  ")).toBe(1);
    expect(standInSeconds("\tone two three four five six\n")).toBeCloseTo(2.4);
  });

  // No recipe composes a driven record-line job (see above), so the landing is held on the plan
  // and booked outputs a job would hand it, through the record's own door.
  it("lands a take per line on the voice record: the first is active, a rerun adds beside it", () => {
    const lines = [{ id: "r:1", text: "Bitcoin is scarce." }, { id: "r:2", text: "Scarcity is not price." }];
    const planned = voicePlan({ lines, engine: null, dry: true }, null, FREE);
    if (!planned.ok) throw planned.error;
    const blob = (n: number) => ({ sha256: String(n).repeat(64).slice(0, 64), mime: "audio/wav", bytes: 44 });
    const book = (n: number) => new Map(planned.value.units.map((u, i) => [u.name, { id: u.input["id"], blob: blob(n + i), seconds: 1, standIn: true }] as const));
    const none = { records: new Map() } as unknown as PartSnapshot;
    const first = landVoice("job1", planned.value, book(1), none, 10);
    if (!first.ok) throw first.error;
    const enc = encodeRecord("voice", first.value["voice"]);
    expect(enc.ok).toBe(true);
    const rec = first.value["voice"] as { takes: Record<string, unknown>; byLine: Record<string, { takeIds: string[]; active: string | null }> };
    expect(Object.keys(rec.takes)).toEqual(["job1:line:r:1", "job1:line:r:2"]);
    expect(rec.byLine["r:1"]).toEqual({ takeIds: ["job1:line:r:1"], active: "job1:line:r:1" });
    const again = landVoice("job2", planned.value, book(5), { records: new Map([["voice", rec]]) } as unknown as PartSnapshot, 20);
    if (!again.ok) throw again.error;
    const rec2 = again.value["voice"] as typeof rec;
    expect(rec2.byLine["r:1"]).toEqual({ takeIds: ["job1:line:r:1", "job2:line:r:1"], active: "job1:line:r:1" });
    expect(encodeRecord("voice", rec2).ok).toBe(true);
  });
});
