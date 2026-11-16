// A CASTING ROUND'S ELEVENLABS VOICES (spark concept-casting-stages S3), on a temp kernel against a FAKE fetch with a dummy
// key and a fake ffmpeg spawn: no vendor, no GPU, no ffmpeg. What these prove is the code's own wiring, not that a live
// call works; no live call has been made.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DIRS = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  return fs.mkdtempSync(p.join(os.tmpdir(), "gt-voice-design-"));
});

import { parseAt } from "@gt/domain/door";
import { ok } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import type { ProductionId } from "@gt/domain/production";
import { enumerateCrashes, type CrashSpec } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { get, retry } from "@gt/kernel/job";
import { ackLane } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import type { Spawn } from "../../lib/foundry/scout/ingest.ts";
import { auditionRefusal, castVoiceIdOf, designVoices, fakeAuditionWriter, speakWithVoice, writeAudition } from "../../lib/music/voiceDesign.ts";
import { effectsFor } from "../../lib/producers/extract.ts";
import { createdVoiceOf, pickVoice, productionVoicesProducer, requestVoiceRound, voiceRoundOf, type VoicesEngines } from "../../lib/producers/productionVoices.ts";
import { producers } from "../../lib/producers/registry.ts";

afterAll(() => rmSync(DIRS, { recursive: true, force: true }));

const OP = { kind: "operator", id: "op" } as const;
const AGENT = { kind: "agent", id: "a" } as const;
const NOW = Date.parse("2026-11-09T09:00:00Z");
const PRODUCTION = "prdn:the-pour" as ProductionId;
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const SCRIPT = `The tide does not wait for the harbourmaster, and neither do I, so hear me once and hear me well before the light goes.`;
const BRIEF = "a gravelly old harbourmaster";
const HEARD = "2026-11-09T10:00:00.000Z";

/* ── The fake vendor ──────────────────────────────────────────────────────── */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
/** Consumed per paid call: header value, or added to the balance when `header` is false. */
let cost = 137;
let header = true;
let balance = 1000;
let failSubscription = false;
let failNextDesign = 0;
const designCallsMade = () => calls.filter((c) => c.url.includes("/text-to-voice/design")).length;
const createCalls = () => calls.filter((c) => c.url.endsWith("/v1/text-to-voice")).length;

function preview(n: number) {
  return { audio_base_64: Buffer.alloc(800, n).toString("base64"), generated_voice_id: `gen-${n}`, duration_secs: 4.5 };
}

let nextPreview = 1;

function fakeVendor(): void {
  calls = [];
  cost = 137;
  header = true;
  balance = 1000;
  failSubscription = false;
  failNextDesign = 0;
  nextPreview = 1;
  process.env["ELEVENLABS_API_KEY"] = "test-key-not-a-real-one";
  delete process.env["GRAVITONE_DRY_ONLY"];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : (JSON.parse(String(init.body)) as Record<string, unknown>);
    calls.push({ url, method, body });
    if (url.endsWith("/v1/user/subscription")) {
      if (failSubscription) return new Response("no", { status: 403 });
      return Response.json({ character_count: balance });
    }
    if (url.includes("/text-to-voice/design")) {
      if (failNextDesign > 0) {
        failNextDesign -= 1;
        return new Response("slow down", { status: 429 });
      }
      if (!header) balance += cost;
      const previews = [preview(nextPreview), preview(nextPreview + 1), preview(nextPreview + 2)];
      nextPreview += 3;
      return Response.json({ previews }, { headers: header ? { "character-cost": String(cost) } : {} });
    }
    if (url.endsWith("/v1/text-to-voice")) return Response.json({ voice_id: "createdVoice0001" });
    if (url.includes("/v1/text-to-speech/")) return new Response(new Uint8Array(1200).fill(7), { headers: { "character-cost": "62" } });
    throw new Error(`unexpected fetch ${url}`);
  });
}

function noVendor(): void {
  vi.unstubAllGlobals();
  delete process.env["ELEVENLABS_API_KEY"];
}

/* ── The fake ffmpeg ──────────────────────────────────────────────────────── */

type Spawned = { args: readonly string[] };
function fakeFfmpeg(log: Spawned[]): Spawn {
  return async (_bin, args) => {
    log.push({ args });
    const filter = args[args.indexOf("-af") + 1] ?? "";
    if (filter.includes("measured_I")) {
      writeFileSync(args[args.length - 1] ?? "", Buffer.alloc(600, 3));
      return { ok: true, stdout: Buffer.alloc(0), stderr: `[Parsed_loudnorm_0]\n{\n"input_i": "-24.0",\n"output_i": "-18.2"\n}\n` };
    }
    return { ok: true, stdout: Buffer.alloc(0), stderr: `[Parsed_loudnorm_0]\n{\n"input_i": "-24.0",\n"input_tp": "-6.0",\n"input_lra": "5.0",\n"input_thresh": "-34.0",\n"target_offset": "0.2"\n}\n` };
  };
}

const instant: VoicesEngines["deps"] = { sleep: async () => undefined };
const engines = (log: Spawned[] = []): VoicesEngines => ({ spawn: fakeFfmpeg(log), ffmpeg: "ffmpeg", deps: instant });

/* ── The kernel ───────────────────────────────────────────────────────────── */

let kernels: Kernel[] = [];
afterEach(() => {
  for (const k of kernels) k.close();
  kernels = [];
});

function world(dir = mkdtempSync(path.join(DIRS, "w-"))): { store: Store; dir: string; k: Kernel; location: string } {
  const location = path.join(dir, "k.sqlite");
  const k = must(openKernel(location, { snapshotDir: dir }));
  kernels.push(k);
  return { store: k.store, dir, k, location };
}

const askBase = { productionId: PRODUCTION, roleId: "harbourmaster", roundId: "round-1", brief: BRIEF, script: SCRIPT, by: "op", actor: OP, dryOnly: false, now: NOW };

function launch(store: Store, mode: "dry" | "live"): string {
  const ask = { ...askBase, mode };
  const first = must(requestVoiceRound(store, ask));
  if (first.kind !== "receipt") throw new Error("expected a receipt");
  const done = must(requestVoiceRound(store, { ...ask, token: first.receipt.token }));
  if (done.kind !== "launched") throw new Error("expected a launch");
  return done.jobId;
}

function run(w: ReturnType<typeof world>, jobId: string, e: VoicesEngines) {
  const producer = productionVoicesProducer({ store: () => ok(w.store), engines: e });
  return runJob(effectsFor(w.store, w.location), producer, jobId, { dryOnly: false });
}

const stateOf = (s: Store, jobId: string) => must(get(s, must(parseAt("job id", jobIdSchema, jobId)))).job.state;

/* ── The round ────────────────────────────────────────────────────────────── */

describe("a live round against a fake fetch", () => {
  beforeEach(fakeVendor);
  afterEach(noVendor);

  it("gives five previews over two design calls and creates nothing", async () => {
    const w = world();
    const ffmpeg: Spawned[] = [];
    const jobId = launch(w.store, "live");
    expect(designCallsMade()).toBe(0);
    must(await run(w, jobId, engines(ffmpeg)));
    expect(stateOf(w.store, jobId)).toBe("done");
    expect(designCallsMade()).toBe(2);
    const design = calls.find((c) => c.url.includes("/text-to-voice/design"));
    expect(design?.body).toMatchObject({ model_id: "eleven_multilingual_ttv_v2", text: SCRIPT, auto_generate_text: false });
    expect(String(design?.body?.["voice_description"])).toContain(BRIEF);
    expect(createCalls()).toBe(0);
    const round = must(voiceRoundOf(w.store, jobId));
    expect(round.voices.map((v) => v.id)).toEqual(["voice-1", "voice-2", "voice-3", "voice-4", "voice-5"]);
    expect(round.voices.every((v) => v.preview?.url.startsWith("/") === true)).toBe(true);
  });

  it("levels every preview through two loudnorm passes, the second using what the first measured, and reports ffmpeg's own output level", async () => {
    const w = world();
    const ffmpeg: Spawned[] = [];
    const jobId = launch(w.store, "live");
    must(await run(w, jobId, engines(ffmpeg)));
    expect(ffmpeg).toHaveLength(10);
    const applied = ffmpeg.filter((c) => (c.args[c.args.indexOf("-af") + 1] ?? "").includes("measured_I"));
    expect(applied).toHaveLength(5);
    for (const c of applied) expect(c.args[c.args.indexOf("-af") + 1]).toContain("measured_I=-24.0");
    expect(must(voiceRoundOf(w.store, jobId)).voices.every((v) => v.preview?.lufs === -18.2)).toBe(true);
  });

  it("records credits from the character-cost header, summed over the round", async () => {
    const w = world();
    const jobId = launch(w.store, "live");
    must(await run(w, jobId, engines()));
    const round = must(voiceRoundOf(w.store, jobId));
    expect(round.creditsUsed).toBe(274);
    expect(round.creditsRead).toBe("character-cost-header");
    expect(round.unreadCalls).toBeUndefined();
  });

  it("falls back to the subscription delta when the header is absent, and says so", async () => {
    header = false;
    cost = 80;
    const w = world();
    const jobId = launch(w.store, "live");
    must(await run(w, jobId, engines()));
    const round = must(voiceRoundOf(w.store, jobId));
    expect(round.creditsUsed).toBe(160);
    expect(round.creditsRead).toBe("subscription-delta");
    expect(calls.filter((c) => c.url.endsWith("/v1/user/subscription")).length).toBeGreaterThanOrEqual(4);
  });

  it("marks credits unread rather than guessing when neither source answers, and still keeps the previews", async () => {
    header = false;
    failSubscription = true;
    const w = world();
    const jobId = launch(w.store, "live");
    must(await run(w, jobId, engines()));
    const round = must(voiceRoundOf(w.store, jobId));
    expect(round.voices).toHaveLength(5);
    expect(round.creditsRead).toBe("unread");
    expect(round.creditsUsed).toBe(0);
    expect(round.unreadCalls).toBe(2);
  });

  it("a level that fails does not pay for the design again", async () => {
    const w = world();
    const jobId = launch(w.store, "live");
    const broken: Spawn = async () => ({ ok: false, error: "ffmpeg is gone" });
    await run(w, jobId, { spawn: broken, ffmpeg: "ffmpeg", deps: instant });
    expect(stateOf(w.store, jobId)).toBe("failed");
    expect(designCallsMade()).toBe(2);
    must(retry(w.store, must(parseAt("job id", jobIdSchema, jobId)), OP));
    must(await run(w, jobId, engines()));
    expect(stateOf(w.store, jobId)).toBe("done");
    expect(designCallsMade()).toBe(2);
    expect(must(voiceRoundOf(w.store, jobId)).voices).toHaveLength(5);
  });
});

/* ── Resume ───────────────────────────────────────────────────────────────── */

describe("a round that stops part way", () => {
  beforeEach(fakeVendor);
  afterEach(noVendor);

  it("a failed call's retry re-runs only the design it never stored", async () => {
    const w = world();
    const jobId = launch(w.store, "live");
    const producer = productionVoicesProducer({ store: () => ok(w.store), engines: engines() });
    // The first design succeeds; the second answers 429 until the breaker fails the job.
    const fx = effectsFor(w.store, w.location);
    failNextDesign = 0;
    let stubbed = false;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/text-to-voice/design") && designCallsMade() === 1 && !stubbed) {
        stubbed = true;
        failNextDesign = 3;
      }
      return realFetch(input, init);
    });
    must(await runJob(fx, producer, jobId, { dryOnly: false }));
    expect(stateOf(w.store, jobId)).toBe("failed");
    expect(designCallsMade()).toBe(4); // one served, three 429s

    must(retry(w.store, must(parseAt("job id", jobIdSchema, jobId)), OP));
    must(await run(w, jobId, engines()));
    expect(stateOf(w.store, jobId)).toBe("done");
    expect(designCallsMade()).toBe(5); // only the missing call ran again
    expect(must(voiceRoundOf(w.store, jobId)).voices).toHaveLength(5);
  });

  it("recovers from a crash after any effect with five previews and no create", async () => {
    type W = { dir: string; k: Kernel; fx: Effects; jobId: string };
    const holder = { bootId: "boot-v", pid: 901, host: "box" };
    const second = { bootId: "boot-v2", pid: 901, host: "box" };
    let producerStore: Store | undefined;
    const producer = productionVoicesProducer({
      store: () => {
        if (producerStore === undefined) throw new Error("no store");
        return ok(producerStore);
      },
      engines: engines(),
    });
    const open = (): W => {
      fakeVendor();
      const w = world();
      producerStore = w.store;
      return { dir: w.dir, k: w.k, fx: effectsFor(w.store, w.location), jobId: launch(w.store, "live") };
    };
    const spec: CrashSpec<W> = {
      open,
      reopen: (w) => {
        w.k.close();
        const k = must(openKernel(path.join(w.dir, "k.sqlite"), { snapshotDir: w.dir }));
        kernels.push(k);
        producerStore = k.store;
        return { ...w, k, fx: effectsFor(k.store, path.join(w.dir, "k.sqlite")) };
      },
      close: (w) => w.k.close(),
      effects: (w) => w.fx,
      scenario: async (fx, w) => {
        must(await runJob(fx, producer, w.jobId, { holder, alive: () => true, heartbeatMs: 3_600_000, dryOnly: false }));
      },
      recover: async (fx, w) => {
        must(recover(fx, { holder: second, alive: () => true }));
        const id = must(parseAt("job id", jobIdSchema, w.jobId));
        if (must(get(w.k.store, id)).job.state === "interrupted") {
          must(ackLane(w.k.store, "cloud.elevenlabs", OP));
          must(retry(w.k.store, id, OP));
        }
        if (must(get(w.k.store, id)).job.state === "queued") must(await runJob(fx, producer, w.jobId, { holder: second, alive: () => true, dryOnly: false }));
      },
      invariant: (w, phase) => {
        if (phase === "crashed") return undefined;
        if (createCalls() !== 0) return "a voice was created without a pick";
        const made = designCallsMade();
        if (made < 2 || made > 3) return `${made} design calls: stored calls must not repeat (one in-flight call at most may)`;
        const round = must(voiceRoundOf(w.k.store, w.jobId));
        if (round.voices.length !== 5) return `${round.voices.length} voices, not 5`;
        return stateOf(w.k.store, w.jobId) === "done" ? undefined : `the job ended ${stateOf(w.k.store, w.jobId)}`;
      },
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects.filter((e) => e.startsWith("call:perform:design:"))).toHaveLength(2);
    expect(report.violations).toEqual([]);
  }, 180_000);
});

/* ── The pick ─────────────────────────────────────────────────────────────── */

describe("creating a voice", () => {
  beforeEach(fakeVendor);
  afterEach(noVendor);

  async function finishedRound(): Promise<{ w: ReturnType<typeof world>; roundJob: string }> {
    const w = world();
    const roundJob = launch(w.store, "live");
    must(await run(w, roundJob, engines()));
    return { w, roundJob };
  }
  const pickBase = { candidateId: "voice-2", name: "Harbourmaster", by: "op", actor: OP, mode: "live" as const, dryOnly: false };

  it("creates only on the operator's pick, from that preview, once", async () => {
    const { w, roundJob } = await finishedRound();
    expect(createCalls()).toBe(0);
    const picked = must(pickVoice(w.store, { ...pickBase, roundJobId: roundJob, heardAt: HEARD }));
    expect(createCalls()).toBe(0);
    must(await run(w, picked.jobId, engines()));
    expect(createCalls()).toBe(1);
    expect(calls.find((c) => c.url.endsWith("/v1/text-to-voice"))?.body?.["generated_voice_id"]).toBe("gen-2");
    expect(must(createdVoiceOf(w.store, picked.jobId))).toEqual({ voiceId: "createdVoice0001", dry: false });
  });

  it("refuses an agent, an unheard preview, and a candidate the round does not hold", async () => {
    const { w, roundJob } = await finishedRound();
    expect(pickVoice(w.store, { ...pickBase, roundJobId: roundJob, heardAt: HEARD, actor: AGENT }).ok).toBe(false);
    const unheard = pickVoice(w.store, { ...pickBase, roundJobId: roundJob });
    expect(unheard.ok).toBe(false);
    if (!unheard.ok) expect(unheard.error.message).toMatch(/play this voice/);
    expect(pickVoice(w.store, { ...pickBase, roundJobId: roundJob, heardAt: HEARD, candidateId: "voice-9" }).ok).toBe(false);
    expect(createCalls()).toBe(0);
  });

  it("refuses a pick before the round is done", () => {
    const w = world();
    const roundJob = launch(w.store, "live");
    const r = pickVoice(w.store, { ...pickBase, roundJobId: roundJob, heardAt: HEARD });
    expect(r.ok).toBe(false);
    expect(createCalls()).toBe(0);
  });
});

/* ── Dry ──────────────────────────────────────────────────────────────────── */

describe("a dry round", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("a dry round must not reach the network");
    });
  });
  afterEach(noVendor);

  it("answers with stand-ins and a would-call for each design, the vendor never asked", async () => {
    const w = world();
    const log: Spawned[] = [];
    const jobId = launch(w.store, "dry");
    const report = must(await run(w, jobId, engines(log)));
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls).toHaveLength(2);
    expect(log).toHaveLength(0);
    const round = must(voiceRoundOf(w.store, jobId));
    expect(round.voices).toHaveLength(5);
    expect(round.dry).toBe(true);
    expect(round.creditsRead).toBe("unread");
    expect(round.creditsUsed).toBe(0);
  });
});

/* ── The door, directly ───────────────────────────────────────────────────── */

describe("the vendor door", () => {
  beforeEach(fakeVendor);
  afterEach(noVendor);

  it("refuses tags on a model that would speak them, before any call", async () => {
    const r = await speakWithVoice("Stay down.", { voiceId: "abcdefghij", direction: "whispered", model: "eleven_multilingual_v2" }, instant);
    expect(r.ok).toBe(false);
    const inText = await speakWithVoice("[whispers] stay down", { voiceId: "abcdefghij", model: "eleven_multilingual_v2" }, instant);
    expect(inText.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(auditionRefusal(`[shouts] ${"x".repeat(120)}`)).toMatch(/speaks audio tags aloud/);
  });

  it("speaks direction as v3 tags in the cast voice, with no default voice and no ceiling", async () => {
    const r = must(await speakWithVoice("Stay down.", { voiceId: "abcdefghij", direction: "whispered, tense" }, instant));
    expect(r.sentText).toBe("[whispered] [tense] Stay down.");
    expect(r.credits).toEqual({ used: 62, read: "character-cost-header" });
    const speech = calls.find((c) => c.url.includes("/v1/text-to-speech/abcdefghij"));
    expect(speech?.body).toEqual({ text: "[whispered] [tense] Stay down.", model_id: "eleven_v3" });
    expect(castVoiceIdOf({ id: "a", name: "A", brief: "b" }).ok).toBe(false);
    expect(must(castVoiceIdOf({ id: "a", name: "A", brief: "b", cast: { characterId: "chr:01ABCDEFGHJKMNPQRSTVWXYZ01" as never, voiceId: "voice9999", roundId: "r", pickedAt: HEARD, pickedBy: "op" } }))).toBe("voice9999");
  });

  it("designs in the function too, three previews a call", async () => {
    const r = must(await designVoices({ brief: BRIEF, script: SCRIPT, count: 5 }, instant));
    expect(r.previews).toHaveLength(5);
    expect(r.calls).toHaveLength(2);
    expect(designCallsMade()).toBe(2);
  });

  it("the audition seam: the fake writer is deterministic and its line passes the door's check", async () => {
    const role = { role: "The archer", brief: "a patient voice", logline: "An archer returns to a town that forgot her name." };
    const a = must(await writeAudition(fakeAuditionWriter, role));
    const b = must(await writeAudition(fakeAuditionWriter, role));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(100);
    expect(auditionRefusal(a)).toBeUndefined();
  });
});

describe("the wiring", () => {
  it("the worker carries production-voices on cloud.elevenlabs", () => {
    const set = must(producers());
    expect(set.has("production-voices@cloud.elevenlabs")).toBe(true);
  });
});
