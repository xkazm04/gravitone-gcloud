// THE AUDIO DESK'S INSIGHT DOORS (Phase 6, L66) through the REAL sound store in a temp dir and a
// kernel in a temp file:
//   · the rubric: a judged take scored on its own dimensions, the ledger row's score moved in the
//     same store transaction, one event per op; an unjudged take, a demo take and a dimension the
//     take does not have are refused with nothing written; @gt/ui's mean is lib/sound's mean;
//   · the batch: the engine is the registry's answer, a withheld one refused with its reason; a
//     receipt writes nothing; a music batch confirms into N Suno drafts and N jobs, a stale token
//     into nothing; an effect batch into ONE run of N clips under the `sfx` producer, its brief
//     filed in the sound store, another brief under the same batch refused;
//   · the sfx producer: a dry job files N stand-ins nobody can judge and calls no vendor; a live
//     job buys each clip once through the meter, booked unpriced with its reason.
// SOUND_LEDGER_PATH is a temp file (pipeline/sound/ledger.json is git-tracked and another session
// owns it); nothing here spends - every vendor is a stand-in or a fake.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The Suno draft door with a seam: `ensureFails.at` makes the n-th ensure of a confirm throw the
// way the real one does (a SoundError 409 / a 503 lock timeout); null leaves it untouched.
const ensureFails = vi.hoisted(() => ({ at: null as number | null, calls: 0 }));
vi.mock("../../lib/sound/suno/draft.ts", async (orig) => {
  const m = await orig<typeof import("../../lib/sound/suno/draft.ts")>();
  const { SoundError } = await import("../../lib/sound/store.ts");
  return {
    ...m,
    ensureDraftJob: (...a: Parameters<typeof m.ensureDraftJob>) => {
      ensureFails.calls += 1;
      if (ensureFails.at !== null && ensureFails.calls === ensureFails.at) return Promise.reject(new SoundError("suno store is busy", 503));
      return m.ensureDraftJob(...a);
    },
  };
});

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-insight-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { runIdSchema } from "@gt/domain/ids";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { queryEvents } from "@gt/kernel/events-query";
import { get, list } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { openKernel } from "@gt/kernel/kernel";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import { blankBatch, type BatchForm } from "@gt/ui/components/audio/batch.ts";
import { RUBRIC as UI_RUBRIC, rubricMean as uiMean } from "@gt/ui/components/audio/rubric.ts";

import { jobIdOf } from "../../lib/producers/sound.ts";
import { sendBatch, type BatchOptions } from "../../lib/sound/batch.ts";
import { engineRegistry, type EngineDef } from "../../lib/sound/engines.ts";
import { rubricMean } from "../../lib/sound/ledger.ts";
import { rateTake } from "../../lib/sound/rubric.ts";
import { readBrief, sfxProducer } from "../../lib/sound/sfxJob.ts";
import { createTake } from "../../lib/sound/takes.ts";
import { RUBRIC, type GenerateRequest, type SoundTake } from "../../lib/sound/types.ts";

const SOUND = path.join(ROOT, "sound");
const LEDGER = path.join(ROOT, "ledger.json");
const NOW = new Date("2026-10-17T12:00:00.000Z");
const OP: Actor = { kind: "operator", id: "op-test" };

const k = openKernel(path.join(ROOT, "kernel.sqlite"));
if (!k.ok) throw k.error;
const store = k.value.store;
const fx = liveEffects(store, blobStore(path.join(ROOT, "blobs")));
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const take = (id: string, over: Partial<SoundTake> = {}): SoundTake => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "suno",
  op: "manual",
  origin: "lab",
  technique: [],
  prompt: `prompt ${id}`,
  negative: null,
  terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: null,
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "kept",
  reasons: [],
  note: null,
  stage: "pending",
  group: null,
  label: null,
  parentId: null,
  huntId: null,
  nodeId: null,
  songId: null,
  plan: null,
  referenceTrackId: null,
  promptRound: null,
  draftId: null,
  variation: null,
  editModes: null,
  fileName: null,
  projectId: null,
  cueId: null,
  createdAt: "2026-10-10T00:00:00.000Z",
  judgedAt: "2026-10-10T00:00:00.000Z",
  finalizedAt: null,
  ...over,
});

function seed(takes: readonly SoundTake[]): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes }));
  writeFileSync(LEDGER, JSON.stringify({ verdicts: [], lessons: [] }));
}
const onDisk = (): SoundTake[] => (JSON.parse(readFileSync(path.join(SOUND, "takes.json"), "utf8")) as { takes: SoundTake[] }).takes;
const ledgerRows = (): { takeId: string; score: number | null }[] => (JSON.parse(readFileSync(LEDGER, "utf8")) as { verdicts: { takeId: string; score: number | null }[] }).verdicts;
const events = (type: string) => must(queryEvents(store, { order: "asc", limit: 500 })).events.filter((e) => e.type === type);

describe("the rubric", () => {
  it("@gt/ui's rubric is lib/sound's: the same dimensions, the same mean on every shape of bag", () => {
    expect(UI_RUBRIC).toEqual(RUBRIC);
    const bags: Record<string, number | null>[] = [{}, { melody: 7 }, { melody: 6, instrument_choice: null, instrument_quality: 9 }, { event_match: 3, loop_seam: 8 }, { melody: 4, event_match: 9 }, { other: 5 }];
    for (const kind of ["music", "sfx"] as const) for (const b of bags) expect(uiMean(kind, b)).toBe(rubricMean(kind, b));
  });

  it("a judged take is scored on its own dimensions; the ledger row's score moves with it; one event per op", async () => {
    seed([take("a", { verdict: "kept" })]);
    // The row the Board's commit wrote: syncVerdict upserts on the next patch of the take.
    const r = must(await rateTake(store, { id: "a", ratings: { melody: 8, instrument_choice: 6 }, opId: "rate000001" }, OP, NOW));
    expect([r.mean, r.recorded]).toEqual([7, true]);
    expect(onDisk()[0]?.ratings).toEqual({ melody: 8, instrument_choice: 6 });
    expect(ledgerRows()).toEqual([expect.objectContaining({ takeId: "a", score: 7 })]);
    // Ratings merge: a second dimension keeps the first; a null clears one.
    must(await rateTake(store, { id: "a", ratings: { instrument_quality: 10, instrument_choice: null }, opId: "rate000002" }, OP, NOW));
    expect(onDisk()[0]?.ratings).toEqual({ melody: 8, instrument_choice: null, instrument_quality: 10 });
    expect(ledgerRows()[0]?.score).toBe(9);
    const again = must(await rateTake(store, { id: "a", ratings: { instrument_quality: 10, instrument_choice: null }, opId: "rate000002" }, OP, NOW));
    expect(again.recorded).toBe(false);
    expect(events("take.rated").filter((e) => e.subject.id === "a")).toHaveLength(2);
  });

  it("an unjudged take, a demo take and a dimension the take does not have are refused, nothing written", async () => {
    seed([take("u", { verdict: "unjudged", stage: null }), take("f", { origin: "fixture" }), take("x", { kind: "sfx", loop: false })]);
    const before = readFileSync(path.join(SOUND, "takes.json"), "utf8");
    const u = await rateTake(store, { id: "u", ratings: { melody: 5 }, opId: "rate000003" }, OP, NOW);
    expect(u.ok ? null : [u.error.code, u.error.message]).toEqual(["refused", "Take u is unjudged; keep or reject it on the Board first"]);
    const f = await rateTake(store, { id: "f", ratings: { melody: 5 }, opId: "rate000004" }, OP, NOW);
    expect(f.ok ? null : f.error.code).toBe("refused");
    const x = await rateTake(store, { id: "x", ratings: { loop_seam: 5 }, opId: "rate000005" }, OP, NOW);
    expect(x.ok ? null : [x.error.code, x.error.message]).toEqual(["invalid", "loop seam is not scored on a one-shot effect"]);
    const gone = await rateTake(store, { id: "nope", ratings: { melody: 5 }, opId: "rate000006" }, OP, NOW);
    expect(gone.ok ? null : gone.error.code).toBe("not-found");
    expect(readFileSync(path.join(SOUND, "takes.json"), "utf8")).toBe(before);
  });
});

/* ── the batch ──────────────────────────────────────────────────────────── */

const caps = { musicSectionEdit: true, musicSfx: true };
/** With the capability on, the registry names ElevenLabs the effects maker (the sfx producer is bound). */
const DESK = engineRegistry(caps);
const SFX_DESK = DESK;
/** A deployment with the effects capability off: the op stays withheld with that deployment's reason. */
const NO_SFX_DESK: readonly EngineDef[] = engineRegistry({ ...caps, musicSfx: false });
const o = (over: Partial<BatchOptions> = {}): BatchOptions => ({ mode: "dry", actor: OP, dryOnly: true, now: NOW.getTime(), store, ...over });
const music: BatchForm = { ...blankBatch("music"), prompt: "slow synthwave, warm pads", negative: "vocals", genre: "synthwave", count: 3 };
const sfx: BatchForm = { ...blankBatch("sfx"), event: "door slam", material: "oak", space: "stone hall", sfxCategory: "impact", count: 2, durationS: 1.5 };
const suno = (): { proposals: { id: string; fields: { style: string; exclude?: string } }[]; jobs: { id: string; job?: string }[] } =>
  existsSync(path.join(SOUND, "suno.json")) ? JSON.parse(readFileSync(path.join(SOUND, "suno.json"), "utf8")) : { proposals: [], jobs: [] };
const jobIds = (): string[] => must(list(store)).map((j) => j.id);

describe("the operator batch", () => {
  it("the engine is the registry's: an effect batch on a desk with no sfx maker is refused with the registry's reason", async () => {
    seed([]);
    const r = await sendBatch({ kind: "sfx", form: sfx, batch: "bnoengine01" }, NO_SFX_DESK, o());
    const reason = NO_SFX_DESK.find((e) => e.id === "elevenlabs")?.withheld.find((w) => w.op === "sfx")?.reason;
    expect(reason).toBeDefined();
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["unavailable", `ElevenLabs makes no sfx batch on this desk: ${reason}`]);
    const bad = await sendBatch({ kind: "music", form: { ...music, count: 9 }, batch: "bbadcount01" }, DESK, o());
    expect(bad.ok ? null : bad.error.message).toBe("1–6 takes");
  });

  it("music: the receipt prices N identical Suno drafts and writes nothing; the confirm drafts and launches them; a stale token launches none", async () => {
    seed([]);
    const rec = must(await sendBatch({ kind: "music", form: music, batch: "bmusic0001" }, DESK, o()));
    if (rec.kind !== "receipt") throw new Error(rec.kind);
    expect(rec.receipt.lines.map((l) => l.label)).toEqual(["slow synthwave, warm pads · 1/3", "slow synthwave, warm pads · 2/3", "slow synthwave, warm pads · 3/3"]);
    expect(suno().jobs).toEqual([]);
    expect(jobIds()).toEqual([]);
    const stale = must(await sendBatch({ kind: "music", form: music, batch: "bmusic0001" }, DESK, o({ token: "not-the-token" })));
    expect(stale.kind).toBe("stale");
    expect(suno().jobs).toEqual([]);
    const c = must(await sendBatch({ kind: "music", form: music, batch: "bmusic0001" }, DESK, o({ token: rec.receipt.token })));
    expect(c.kind === "launched" ? [c.engine, c.jobIds] : c.kind).toEqual(["suno", ["job:run:suno.sj-bmusic0001-1", "job:run:suno.sj-bmusic0001-2", "job:run:suno.sj-bmusic0001-3"]]);
    // N identical: one form, verbatim, on every draft; the negatives as Suno's exclude.
    expect(new Set(suno().proposals.map((p) => JSON.stringify(p.fields))).size).toBe(1);
    expect(suno().proposals[0]?.fields).toMatchObject({ style: "slow synthwave, warm pads", exclude: "vocals" });
    expect(suno().jobs.map((j) => j.job)).toEqual(c.kind === "launched" ? c.jobIds : []);
  });

  it("music: a confirm that throws on draft k takes back the drafts it already queued; the retry starts clean", async () => {
    seed([]);
    const form = { ...music, count: 4 };
    const rec = must(await sendBatch({ kind: "music", form, batch: "bthrows0001" }, DESK, o()));
    if (rec.kind !== "receipt") throw new Error(rec.kind);
    const kernelJobs = jobIds();
    ensureFails.at = 3;
    ensureFails.calls = 0;
    try {
      const r = await sendBatch({ kind: "music", form, batch: "bthrows0001" }, DESK, o({ token: rec.receipt.token }));
      expect(r.ok ? r.value.kind : [r.error.code, r.error.message]).toEqual(["unavailable", "suno store is busy"]);
    } finally {
      ensureFails.at = null;
    }
    expect(suno().jobs.filter((j) => j.job === undefined)).toEqual([]);
    expect(jobIds()).toEqual(kernelJobs);
    const again = must(await sendBatch({ kind: "music", form, batch: "bthrows0001" }, DESK, o({ token: rec.receipt.token })));
    expect(again.kind).toBe("launched");
    expect(suno().jobs).toHaveLength(4);
  });

  it("sfx: ONE run of N clips under the sfx producer, its brief filed before the job; another brief under the batch is refused", async () => {
    seed([]);
    const rec = must(await sendBatch({ kind: "sfx", form: sfx, batch: "bsfx000001" }, SFX_DESK, o()));
    if (rec.kind !== "receipt") throw new Error(rec.kind);
    expect(rec.receipt.lines).toHaveLength(1);
    expect(rec.receipt.lines[0]?.units).toBe(2);
    expect(await readBrief("sfx.bsfx000001.2")).toBeNull();
    // The token is bound to the brief: the same token over another brief is stale, nothing filed.
    const other = must(await sendBatch({ kind: "sfx", form: { ...sfx, event: "glass break" }, batch: "bsfx000001" }, SFX_DESK, o({ token: rec.receipt.token })));
    expect(other.kind).toBe("stale");
    const c = must(await sendBatch({ kind: "sfx", form: sfx, batch: "bsfx000001" }, SFX_DESK, o({ token: rec.receipt.token })));
    expect(c.kind === "launched" ? [c.engine, c.runIds, c.jobIds] : c.kind).toEqual(["elevenlabs", ["sfx.bsfx000001.2"], ["job:run:sfx.bsfx000001.2"]]);
    expect(must(get(store, jobIdOf("job:run:sfx.bsfx000001.2"))).job).toMatchObject({ producer: "sfx", lane: "cloud.elevenlabs", mode: { kind: "dry" } });
    expect(await readBrief("sfx.bsfx000001.2")).toMatchObject({ kind: "sfx", prompt: "door slam, oak, stone hall", durationS: 1.5, loop: false, terms: { sfxCategory: "impact" } });
    const fresh = must(await sendBatch({ kind: "sfx", form: { ...sfx, event: "glass break" }, batch: "bsfx000001" }, SFX_DESK, o()));
    if (fresh.kind !== "receipt") throw new Error(fresh.kind);
    const clash = await sendBatch({ kind: "sfx", form: { ...sfx, event: "glass break" }, batch: "bsfx000001" }, SFX_DESK, o({ token: fresh.receipt.token }));
    expect(clash.ok ? null : [clash.error.code, clash.error.message]).toEqual(["conflict", "batch sfx.bsfx000001.2 was filed with another brief"]);
  });
});

/* ── the sfx producer ───────────────────────────────────────────────────── */

async function launched(batch: string, form: BatchForm, mode: "dry" | "live"): Promise<string> {
  const opts = o({ mode, dryOnly: mode === "dry" });
  const rec = must(await sendBatch({ kind: "sfx", form, batch }, SFX_DESK, opts));
  if (rec.kind !== "receipt") throw new Error(rec.kind);
  const c = must(await sendBatch({ kind: "sfx", form, batch }, SFX_DESK, { ...opts, token: rec.receipt.token }));
  if (c.kind !== "launched") throw new Error(c.kind);
  return c.jobIds[0] ?? "";
}

describe("the sfx producer", () => {
  it("dry: N stand-ins filed as demo takes nobody can judge; no vendor is asked; a re-drive files nothing twice", async () => {
    seed([]);
    const jobId = await launched("bdry000001", { ...sfx, count: 3 }, "dry");
    const asked: GenerateRequest[] = [];
    const producer = sfxProducer("cloud.elevenlabs", { generateTake: async (req) => (asked.push(req), Promise.reject(new Error("the vendor was asked"))) });
    const report = must(await runJob(fx, producer, jobId, { dryOnly: true }));
    expect(report.outcome).toBe("done");
    expect(asked).toEqual([]);
    expect(report.wouldCalls?.length).toBe(3);
    const filed = onDisk();
    expect(filed.map((t) => [t.origin, t.kind, t.verdict])).toEqual([
      ["fixture", "sfx", "unjudged"],
      ["fixture", "sfx", "unjudged"],
      ["fixture", "sfx", "unjudged"],
    ]);
    expect(new Set(filed.map((t) => t.prompt))).toEqual(new Set(["door slam, oak, stone hall"]));
    must(await runJob(fx, producer, jobId, { dryOnly: true }));
    expect(onDisk()).toHaveLength(3);
  });

  it("live through a fake engine: each clip bought once with the identical brief, booked unpriced with its reason", async () => {
    seed([]);
    const jobId = await launched("blive00001", sfx, "live");
    const asked: GenerateRequest[] = [];
    const generateTake = async (req: GenerateRequest): Promise<SoundTake> => {
      asked.push(req);
      return (await createTake({ kind: "sfx", title: req.title ?? "fx", provider: "elevenlabs", op: "sfx", origin: "lab", prompt: req.prompt, loop: req.loop, durationS: req.durationS }, { bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2]), mime: "audio/mpeg", name: "fx.mp3" })).take;
    };
    const report = must(await runJob(fx, sfxProducer("cloud.elevenlabs", { generateTake }), jobId, { dryOnly: false }));
    expect(report.outcome).toBe("done");
    expect(asked.map((r) => r.title)).toEqual(["impact · 1/2", "impact · 2/2"]);
    expect(asked.map((r) => ({ ...r, title: null }))).toEqual([{ ...asked[0], title: null }, { ...asked[0], title: null }]);
    expect(asked[0]).toMatchObject({ kind: "sfx", op: "sfx", origin: "lab", prompt: "door slam, oak, stone hall", durationS: 1.5, loop: false, terms: { sfxCategory: "impact" } });
    const rec = must(store.read((r) => reconcileJobSpend(r, jobId)));
    expect(rec.drift).toBeUndefined();
    expect(rec.job.unpriced).toBe(2);
    expect(onDisk().filter((t) => t.origin === "lab")).toHaveLength(2);
  });

  it("the plan is the run id's clips; a run id that names no batch plans one step that fails, nothing rendered", async () => {
    const producer = sfxProducer();
    const job = must(get(store, jobIdOf(await launched("bplan00001", sfx, "dry")))).job;
    expect(producer.plan(job, new Map()).map((s) => s.name)).toEqual(["clip:1", "clip:2"]);
    expect(producer.plan({ ...job, of: { kind: "run", id: must(parseAt("run id", runIdSchema, "sfx.oops")) } }, new Map()).map((s) => s.name)).toEqual(["unreadable"]);
  });
});
