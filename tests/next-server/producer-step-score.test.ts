// THE SCORE PART'S ACTS AS KERNEL JOBS (Phase 4 wave C, L37): a cue's receipt, its confirm, the
// job driven on its own lane (dry: a stand-in take filed in the sound store, the vendor never
// asked; live: a fake engine through the meter), the take bound onto the spot, the verdict moved.
// Single flight per cue is the job id; a crash between two cues resumes without re-buying the
// first; a cue with no tempo is refused before anything is priced to run.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-step-score-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "k.sqlite");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { rmSync } from "node:fs";
import path from "node:path";

import { ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { ackLane } from "@gt/kernel/job-queue";
import { get, list, retry } from "@gt/kernel/job";
import { recover } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { modelOptions } from "@gt/kernel/records/options";
import { compose, setPart } from "@gt/kernel/records/write";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";

import { partVerdict } from "../../lib/parts/verdict.ts";
import { driveStep, effectsOf, launchPartAct, partActReceipt, type UnitsFn } from "../../lib/producers/research.ts";
import { scoreProducer, scoreUnits, type ScoreEngines } from "../../lib/producers/score.ts";
import { createTake, getTake } from "../../lib/sound/takes.ts";
import type { GenerateRequest, SoundTake } from "../../lib/sound/types.ts";

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");
let kernel: Kernel | undefined;
afterEach(() => undefined);
afterAll(() => {
  kernel?.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function store(): Store {
  if (kernel === undefined) {
    const k = openKernel(path.join(ROOT, "k.sqlite"));
    if (!k.ok) throw k.error;
    kernel = k.value;
  }
  return kernel.store;
}

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
const jid = (s: string) => must(parseAt("job id", jobIdSchema, s));

const plate = { state: "ready", blob: { sha256: "a".repeat(64), bytes: 4, mime: "image/png" } };
const unit = (id: string, startS: number, holdS: number) => ({ id, sourceId: "r", beatRef: { at: `0:${String(startS).padStart(2, "0")}`, beatId: id }, ordinal: 1, ofBeat: 1, startS, holdS, kind: "shot", beatKind: "hook", title: id, line: "", plate, clip: { status: "not-started", motion: "" }, elements: [], texts: [] });

/** A trailer with two placed shots and two spots: one with a tempo, one without. */
function project(id: string, spots: unknown[]): void {
  const s = store();
  must(compose(s, { recipe: "film/trailer" }, OP, { id }));
  // The film recipe's score part defaults to Suno; a cue renders on ElevenLabs (the Plan's picker).
  const eleven = modelOptions("score", "2026-10-16").find((o) => o.provider === "elevenlabs");
  must(setPart(s, { id, baseRev: 1, partId: `${id}/score`, patch: { option: eleven?.key ?? "" } }, OP));
  const land = (part: string, recs: Record<string, unknown>) => must(writePart(s, { projectId: id, partId: `${id}/${part}`, baseRev: "current", act: "land", op: { seed: part }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok(recs) }));
  land("frames", { frames: { units: [unit("u1", 0, 10), unit("u2", 10, 10)], renderId: "r" } });
  land("score", { score: { spots } });
}

const SPOTS = [
  { id: "spot-a", title: "build", sceneIds: ["u1"], note: "the climb", bpm: 96 },
  { id: "spot-b", title: "release", sceneIds: ["u2"], note: "" },
];

const ref = (projectId: string, target?: string) => ({ projectId, partId: `${projectId}/score`, act: "render-cue", ...(target === undefined ? {} : { target }) });

function verdictOf(projectId: string) {
  const snap = must(readPart(store(), { projectId, partId: `${projectId}/score` }));
  return partVerdict("score", { projectId, title: projectId, discipline: "trailer", targetS: 120, plansVoice: false, records: snap.records });
}

async function run(projectId: string, target: string | undefined, o: { live?: boolean; engines?: Partial<ScoreEngines>; holder?: Holder } = {}) {
  const units: UnitsFn = scoreUnits;
  const mode = o.live === true ? "live" : "dry";
  const r = must(partActReceipt(store(), ref(projectId, target), units, { mode, now: NOW }));
  const l = must(launchPartAct(store(), ref(projectId, target), units, { mode, now: NOW, token: r.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  const report = await driveStep((lane, h) => scoreProducer(lane, h, o.engines), store(), l.jobId, { dryOnly: o.live !== true, ...(o.holder === undefined ? {} : { run: { holder: o.holder } }) });
  return { jobId: l.jobId, receipt: r, report };
}

const spotsOf = (projectId: string): { id: string; takeIds?: string[]; activeTakeId?: string }[] => {
  const s = must(readPart(store(), { projectId, partId: `${projectId}/score` })).records.get("score")?.["spots"];
  return Array.isArray(s) ? (s as { id: string; takeIds?: string[]; activeTakeId?: string }[]) : [];
};

describe("score acts are jobs with receipts", () => {
  it("a cue renders dry: a stand-in take is filed (no vendor), bound onto the spot as active, and the verdict counts it", async () => {
    project("t1", SPOTS);
    expect(verdictOf("t1")).toMatchObject({ state: "working", codes: [{ code: "take-missing", text: "2 cues without a take" }, { code: "cues-spotted" }] });
    const { jobId, receipt, report } = await run("t1", "spot-a");
    expect(receipt).toMatchObject({ mode: "dry", subject: { kind: "part", act: "render-cue", target: "spot-a" }, lines: [{ lane: "cloud.elevenlabs" }] });
    expect(must(report).outcome).toBe("done");
    expect(must(report).wouldCalls?.map((w) => `${w.provider}/${w.model}`)).toEqual(["elevenlabs/music"]);
    expect(jobId).toMatch(/^job:part:t1\/score:render-cue:\d+:spot-a$/);
    const a = spotsOf("t1").find((s) => s.id === "spot-a");
    expect(a?.takeIds?.length).toBe(1);
    expect(a?.activeTakeId).toBe(a?.takeIds?.[0]);
    expect((await getTake(a?.activeTakeId ?? "")).origin).toBe("score");
    expect(verdictOf("t1")).toMatchObject({ state: "working", codes: [{ code: "take-missing", text: "1 cue without a take" }, { code: "cues-spotted" }] });
    const job = must(list(store())).find((j) => j.id === jobId);
    expect(job).toMatchObject({ state: "done", producer: "score", lane: "cloud.elevenlabs", spend: { usd: 0, unpriced: 0 } });
  });

  it("a cue with no tempo is refused on its receipt, in the work's words; nothing is enqueued; a part routed to Suno renders no cue", () => {
    project("t2", SPOTS);
    must(compose(store(), { recipe: "film/trailer" }, OP, { id: "t2s" }));
    const suno = partActReceipt(store(), ref("t2s", "spot-a"), scoreUnits, { mode: "dry", now: NOW });
    expect(suno.ok ? "" : suno.error.message).toBe("cues render on ElevenLabs; this score part is routed to Suno v6 · serial");
    const r = partActReceipt(store(), ref("t2", "spot-b"), scoreUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("release needs a tempo");
    expect(must(list(store())).filter((j) => j.of.id === "t2/score")).toEqual([]);
  });

  it("single flight per cue: a second confirm while the cue's job is live adopts it - one job, one purchase", () => {
    project("t3", SPOTS);
    const r = must(partActReceipt(store(), ref("t3", "spot-a"), scoreUnits, { mode: "dry", now: NOW }));
    const a = must(launchPartAct(store(), ref("t3", "spot-a"), scoreUnits, { mode: "dry", now: NOW, token: r.token, actor: OP }));
    const r2 = must(partActReceipt(store(), ref("t3", "spot-a"), scoreUnits, { mode: "dry", now: NOW }));
    const b = must(launchPartAct(store(), ref("t3", "spot-a"), scoreUnits, { mode: "dry", now: NOW, token: r2.token, actor: OP }));
    expect(a.kind === "launched" && b.kind === "launched" ? [b.jobId === a.jobId, b.adopted] : []).toEqual([true, true]);
    expect(must(list(store())).filter((j) => j.of.id === "t3/score").length).toBe(1);
  });

  it("live through a fake engine: each cue bought once, booked unpriced with its reason, spend equals the meter, the cue goes READY", async () => {
    project("t4", [SPOTS[0], { ...SPOTS[1], bpm: 120 }]);
    const asked: GenerateRequest[] = [];
    const generateTake = async (req: GenerateRequest): Promise<SoundTake> => {
      asked.push(req);
      return (await createTake({ kind: "music", title: req.title ?? "cue", provider: "elevenlabs", op: "cue", origin: "score", projectId: req.projectId ?? null, cueId: req.cueId ?? null }, { bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3]), mime: "audio/mpeg", name: "cue.mp3" })).take;
    };
    const { jobId, report } = await run("t4", undefined, { live: true, engines: { generateTake } });
    expect(must(report).outcome).toBe("done");
    expect(asked.map((r) => r.cueId)).toEqual(["spot-a", "spot-b"]);
    expect(asked[0]?.cue?.bpm).toBe(96);
    const rec = must(store().read((r) => reconcileJobSpend(r, jobId)));
    expect(rec.drift).toBeUndefined();
    expect(rec.job.unpriced).toBe(2);
    expect(verdictOf("t4").state).toBe("ready");
  });

  it("a crash during the second cue: swept, acknowledged, retried - the first cue is not bought again", async () => {
    project("t5", [SPOTS[0], { ...SPOTS[1], bpm: 120 }]);
    let calls = 0;
    let die = true;
    const generateTake = async (req: GenerateRequest): Promise<SoundTake> => {
      calls++;
      // The process dies mid-call (the crash harness's sentinel is not an Error).
      if (req.cueId === "spot-b" && die) throw Object.assign(Object.create(null) as object, { crash: true });
      return (await createTake({ kind: "music", title: "cue", provider: "elevenlabs", op: "cue", origin: "score", projectId: "t5", cueId: req.cueId ?? null }, { bytes: new Uint8Array([0xff, 0xfb, 1]), mime: "audio/mpeg", name: "c.mp3" })).take;
    };
    const first: Holder = { bootId: "boot-1", pid: 9001, host: "box" };
    const crashed = await run("t5", undefined, { live: true, engines: { generateTake }, holder: first }).catch((e: unknown) => e);
    expect(crashed).toMatchObject({ crash: true });
    // A restarted process sweeps: the dead holder's job is interrupted at the cue it was buying.
    const swept = must(recover(effectsOf(store()), { holder: { bootId: "boot-2", pid: 9002, host: "box" }, alive: () => false }));
    const id = swept.find((j) => j.of.id === "t5/score")?.id ?? "";
    expect(must(get(store(), jid(id))).job).toMatchObject({ state: "interrupted", interruption: { stage: "unit:cue:spot-b" } });
    // A paid lane holds until the operator looks; then the operator retries.
    must(ackLane(store(), "cloud.elevenlabs", OP));
    must(retry(store(), jid(id), OP));
    die = false;
    const again = await driveStep((lane, h) => scoreProducer(lane, h, { generateTake }), store(), id, { dryOnly: false });
    expect(must(again).outcome).toBe("done");
    expect(calls).toBe(3);
    expect(spotsOf("t5").every((s) => (s.takeIds ?? []).length === 1)).toBe(true);
  });
});
