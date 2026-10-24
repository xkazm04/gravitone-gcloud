// THE EXPLAINER'S VOICE PART SPEAKS (spark audio-postproduction-research WP2), through its
// receipt and its job, on a real-shaped explainer: an article, strip cards with captions, NO
// script part - the shape every explainer has, and the one the old producer refused (it read
// script beats). Never the vendor: a DRY job stands in; the LIVE path runs the real `speak`
// door (lib/music/elevenlabs.ts) against a FAKE fetch with a dummy key, so the wire request, the
// character ceiling and the price are the code's own. The sidecar is a fake too - one that
// measures, and one that answers as the WP0 stub does - so no Python is spawned here. A dry
// stand-in is silence and is never measured: only a spoken (live) take earns a verdict and a row.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DIRS = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-step-voice-"));
  process.env["SOUND_STORE_DIR"] = p.join(dir, "sound");
  process.env["SPEND_STORE"] = "memory";
  return dir;
});

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import { err, ok, type Result } from "@gt/domain/errors";
import { decodeStep } from "@gt/domain/steps/record";
import { VOICE } from "@gt/domain/steps/parts";
import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { ackLane } from "@gt/kernel/job-queue";
import { get, list, retry } from "@gt/kernel/job";
import { enumerateCrashes, type CrashSpec } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { quote } from "@gt/kernel/pricing/quote";

import { explainerCut } from "../../lib/cut/explainer.ts";
import { formatCall } from "../../lib/music/log.ts";
import { priceCall } from "../../lib/music/pricing.ts";
import { __resetTtsBudget, ttsBudgetStats } from "../../lib/music/ttsBudget.ts";
import { effectsOf, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";
import { STAND_IN_UNMEASURED, voiceProducer, voiceUnits, type VoiceEngines } from "../../lib/producers/voice.ts";

afterAll(() => rmSync(DIRS, { recursive: true, force: true }));

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-24T09:00:00Z");
const ID = "ex1";
const PART = `${ID}/voice`;
const REF = { projectId: ID, partId: PART, act: "record-line" };
const RATE = 0.08 / 1000;
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

/** Three cards whose captions differ in length, so their stand-ins differ in bytes. */
const CAPTIONS = ["Bitcoin is scarce by design.", "Scarcity alone does not make a price.", "A price needs buyers who believe the scarcity will hold."];
const CARDS = CAPTIONS.map((caption, i) => ({ id: `card-${i + 1}`, section: "s1", title: `card ${i + 1}`, caption, state: "drawn" as const }));
const LINES = CARDS.map((c) => `line-${c.id}`);

let kernels: Kernel[] = [];
afterEach(() => {
  for (const k of kernels) k.close();
  kernels = [];
});

function explainer(dir = mkdtempSync(path.join(DIRS, "w-"))): { store: Store; dir: string; k: Kernel } {
  const k = must(openKernel(path.join(dir, "k.sqlite"), { snapshotDir: dir }));
  kernels.push(k);
  must(compose(k.store, { recipe: "explainer", title: "Why bitcoin" }, OP, { id: ID }));
  must(writePart(k.store, { projectId: ID, partId: `${ID}/strips`, baseRev: "current", act: "land", op: { seed: "strips" }, label: "strips", by: { kind: "machine", id: "seed" }, next: () => ok({ strips: { cards: CARDS } }) }));
  return { store: k.store, dir, k };
}

/** A sidecar that measures: a usable stem, its length read off the bytes it was handed. */
const measured = (seen: string[] = []): VoiceEngines["measure"] => async (file) => {
  const bytes = readFileSync(file);
  seen.push(path.basename(file));
  const durationS = file.endsWith(".wav") ? (bytes.byteLength - 44) / 16_000 : bytes.byteLength / 16_000;
  return ok({ integratedLufs: -19, truePeakDb: -3, lra: 5, clippedSamples: 0, leadSilenceS: 0.05, tailSilenceS: 0.2, durationS } satisfies AudioMeasureFull);
};
/** The WP0 stub's answer: no sidecar here. */
const stubbed: VoiceEngines["measure"] = async () => err("unavailable", "the audio sidecar is not built yet");

const voiceOf = (s: Store) => must(decodeStep(VOICE, must(readPart(s, { projectId: ID, partId: PART })).records.get("voice") ?? {}));
const accepts = (s: Store) => must(s.read((r) => r.all("SELECT key, subject_id, data FROM events WHERE type = 'audio.accept' ORDER BY seq")));

/** The vendor, faked at `fetch`: the real `speak` door runs, with a dummy key, and every call is noted. */
const calls: { url: string; body: unknown; key: string | null }[] = [];
function fakeVendor(): void {
  calls.length = 0;
  __resetTtsBudget();
  process.env["ELEVENLABS_API_KEY"] = "test-key-not-a-real-one";
  delete process.env["GRAVITONE_DRY_ONLY"];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { text: string };
    calls.push({ url, body, key: new Headers(init.headers).get("xi-api-key") });
    // Bytes that differ per line, sized like 128 kbit/s speech of it at 2.5 words a second.
    const words = body.text.split(/\s+/).length;
    return new Response(new Uint8Array(words * 6_400 + body.text.length).fill(body.text.length), { status: 200, headers: { "content-type": "audio/mpeg" } });
  });
}
function noVendor(): void {
  vi.unstubAllGlobals();
  delete process.env["ELEVENLABS_API_KEY"];
}

/** A live voice job launched through its receipt's confirm. */
function liveLaunch(s: Store, ref: typeof REF & { target?: string } = REF): string {
  const receipt = must(partActReceipt(s, ref, voiceUnits, { mode: "live", now: NOW }));
  const l = must(launchPartAct(s, ref, voiceUnits, { mode: "live", now: NOW, token: receipt.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  return l.jobId;
}

async function dryJob(s: Store, measure: VoiceEngines["measure"], target?: string) {
  const ref = { ...REF, ...(target === undefined ? {} : { target }) };
  const receipt = must(partActReceipt(s, ref, voiceUnits, { mode: "dry", now: NOW }));
  const l = must(launchPartAct(s, ref, voiceUnits, { mode: "dry", now: NOW, token: receipt.token, actor: OP }));
  if (l.kind !== "launched") throw new Error("stale");
  const report = must(await runJob(effectsOf(s), voiceProducer("cloud.elevenlabs", {}, { measure }), l.jobId, { dryOnly: true }));
  return { receipt, report, jobId: l.jobId };
}

describe("a DRY voice job on a real explainer (strips, no script)", () => {
  it("plans one unit per strip line, priced by its characters, and lands silent stand-ins the cut holds", async () => {
    const { store } = explainer();
    const { receipt, report } = await dryJob(store, stubbed);
    expect(receipt.lines[0]).toMatchObject({ lane: "cloud.elevenlabs", label: "record-line · 3 units" });
    const chars = CAPTIONS.reduce((n, c) => n + c.length, 0);
    expect(receipt.lines[0]?.usd).toBeCloseTo(chars * RATE, 2);
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.map((c) => c.model)).toEqual(["eleven_multilingual_v2", "eleven_multilingual_v2", "eleven_multilingual_v2"]);
    const v = voiceOf(store);
    expect(Object.keys(v.byLine).sort()).toEqual(LINES);
    for (const line of LINES) {
      const slot = v.byLine[line];
      const take = v.takes[slot?.active ?? ""];
      expect(take?.engine).toMatchObject({ provider: "elevenlabs", model: "eleven_multilingual_v2", voiceId: "JBFqnCBsd6RMkjVDRZzb", mode: "dry" });
      expect(take?.blob?.mime).toBe("audio/wav");
      // The stub measured nothing: no verdict, never a fabricated one.
      expect(take !== undefined && "accept" in take).toBe(false);
    }
    expect(accepts(store)).toEqual([]);
    const cut = explainerCut({ cards: CARDS, voice: v, targetS: null });
    expect(cut.clips.filter((c) => c.track === "vo").map((c) => c.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("records one take for the one line a target names, and a second take does not steal the slot", async () => {
    const { store } = explainer();
    await dryJob(store, stubbed, "line-card-2");
    const first = voiceOf(store).byLine["line-card-2"];
    expect(first?.takeIds.length).toBe(1);
    expect(Object.keys(voiceOf(store).byLine)).toEqual(["line-card-2"]);
    await dryJob(store, stubbed, "line-card-2");
    const after = voiceOf(store).byLine["line-card-2"];
    expect(after?.takeIds.length).toBe(2);
    expect(after?.active).toBe(first?.active);
    expect(voiceOf(store).takes[after?.takeIds[1] ?? ""]?.label).toBe("take 2");
  });

  it("never measures a stand-in, even where a sidecar measures: no verdict, no acceptance row", async () => {
    const { store } = explainer();
    const seen: string[] = [];
    const { jobId } = await dryJob(store, measured(seen));
    expect(seen).toEqual([]);
    expect(accepts(store)).toEqual([]);
    const v = voiceOf(store);
    expect(Object.keys(v.takes).length).toBe(3);
    for (const t of Object.values(v.takes)) expect("accept" in t).toBe(false);
    const outs = must(store.read((r) => r.all("SELECT output FROM job_outputs WHERE job_id = ? AND step LIKE 'unit:%'", jobId)));
    expect(outs.length).toBe(3);
    for (const o of outs) {
      const out = JSON.parse(String(o["output"])) as Record<string, unknown>;
      expect(out["unmeasured"]).toBe(STAND_IN_UNMEASURED);
      expect("measure" in out).toBe(false);
    }
  });
});

describe("a LIVE voice job that dies after any effect", () => {
  beforeEach(fakeVendor);
  afterEach(noVendor);

  it("re-lands without a second take or a second acceptance row", async () => {
    type W = { dir: string; k: Kernel; fx: Effects; jobId: string };
    const holder = { bootId: "boot-v", pid: 701, host: "box" };
    const second = { bootId: "boot-v2", pid: 701, host: "box" };
    const producer = voiceProducer("cloud.elevenlabs", {}, { measure: measured() });
    const open = (): W => {
      __resetTtsBudget();
      const w = explainer();
      return { dir: w.dir, k: w.k, fx: effectsOf(w.store), jobId: liveLaunch(w.store) };
    };
    const spec: CrashSpec<W> = {
      open,
      reopen: (w) => {
        w.k.close();
        const k = must(openKernel(path.join(w.dir, "k.sqlite"), { snapshotDir: w.dir }));
        kernels.push(k);
        return { ...w, k, fx: effectsOf(k.store) };
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
        const v = voiceOf(w.k.store);
        const takes = Object.keys(v.takes).length;
        if (takes !== 3) return `${takes} takes landed, not 3`;
        if (LINES.some((l) => v.byLine[l]?.takeIds.length !== 1)) return `a line holds a take twice: ${JSON.stringify(v.byLine)}`;
        const rows = accepts(w.k.store).length;
        if (rows !== 3) return `${rows} acceptance rows, not 3`;
        if (Object.values(v.takes).some((t) => t.accept === undefined)) return "a measured take landed without its verdict";
        if (Object.values(v.takes).some((t) => t.engine?.mode !== "live")) return "a take of a live job landed as a stand-in";
        return undefined;
      },
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects).toContain("tx:part.land");
    expect(report.effects).toContain("tx:audio.accept");
    expect(report.effects.filter((e) => e.startsWith("call:perform:unit:"))).toHaveLength(3);
    expect(report.violations).toEqual([]);
  }, 180_000);
});

describe("the LIVE voice path, against a fake fetch", () => {
  beforeEach(fakeVendor);
  afterEach(noVendor);

  it("prices characters x rate on the receipt, speaks only through its confirm, and books the spend", async () => {
    const { store } = explainer();
    const receipt = must(partActReceipt(store, REF, voiceUnits, { mode: "live", now: NOW }));
    const chars = CAPTIONS.reduce((n, c) => n + c.length, 0);
    expect(receipt.mode).toBe("live");
    expect(receipt.lines[0]?.usd).toBeCloseTo(chars * RATE, 2);
    // A receipt is a price: nothing was called to make it, and a wrong token launches nothing.
    expect(calls).toEqual([]);
    expect(must(launchPartAct(store, REF, voiceUnits, { mode: "live", now: NOW, token: "not-the-token", actor: OP, dryOnly: false })).kind).toBe("stale");
    const refused = launchPartAct(store, REF, voiceUnits, { mode: "live", now: NOW, token: receipt.token, actor: OP, dryOnly: true });
    expect(refused.ok ? "" : refused.error.message).toMatch(/GRAVITONE_DRY_ONLY/);
    expect(must(store.read((r) => r.all("SELECT id FROM jobs"))).length).toBe(0);
    const l = must(launchPartAct(store, REF, voiceUnits, { mode: "live", now: NOW, token: receipt.token, actor: OP, dryOnly: false }));
    if (l.kind !== "launched") throw new Error("stale");
    const seen: string[] = [];
    const report = must(await runJob(effectsOf(store), voiceProducer("cloud.elevenlabs", {}, { measure: measured(seen) }), l.jobId, { dryOnly: false }));
    expect(report.outcome).toBe("done");
    // The spoken bytes are measured as what they are: an MP3 file.
    expect(seen).toEqual(["take.mp3", "take.mp3", "take.mp3"]);
    expect(calls.map((c) => c.url)).toEqual(Array(3).fill("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128"));
    expect(calls.map((c) => c.body)).toEqual(CAPTIONS.map((text) => ({ text, model_id: "eleven_multilingual_v2" })));
    expect(calls.every((c) => c.key === "test-key-not-a-real-one")).toBe(true);
    expect(must(list(store))[0]?.spend.usd).toBeCloseTo(chars * RATE, 6);
    expect((await ttsBudgetStats()).spent).toBe(chars);
    const v = voiceOf(store);
    for (const line of LINES) {
      const take = v.takes[v.byLine[line]?.active ?? ""];
      expect(take?.engine).toMatchObject({ provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb", mode: "live" });
      expect(take?.blob?.mime).toBe("audio/mpeg");
    }
    // One audio.accept row per landed take, keyed by its bytes, its verdict mirrored on the take.
    const rows = accepts(store);
    expect(rows.length).toBe(3);
    for (const line of LINES) {
      const id = v.byLine[line]?.active ?? "";
      expect(v.takes[id]?.accept).toEqual({ profile: "voice-take", verdict: "pass", reasons: [] });
      const row = rows.find((r) => r["subject_id"] === `${ID}:${line}:${id}`);
      expect(row?.["key"]).toBe(`audio-accept:${v.takes[id]?.blob?.sha256}:voice-take`);
    }
  });

  it("with the sidecar stub, a spoken take still lands - with no verdict and no row", async () => {
    const { store } = explainer();
    const jobId = liveLaunch(store, { ...REF, target: "line-card-1" });
    const report = must(await runJob(effectsOf(store), voiceProducer("cloud.elevenlabs", {}, { measure: stubbed }), jobId, { dryOnly: false }));
    expect(report.outcome).toBe("done");
    const v = voiceOf(store);
    const take = v.takes[v.byLine["line-card-1"]?.active ?? ""];
    expect(take?.engine).toMatchObject({ mode: "live" });
    expect(take !== undefined && "accept" in take).toBe(false);
    expect(accepts(store)).toEqual([]);
  });

  it("a vendor refusal of the key is the job's sentence, and the character hold is released", async () => {
    vi.stubGlobal("fetch", async () => new Response("invalid api key", { status: 401 }));
    const { store } = explainer();
    const receipt = must(partActReceipt(store, { ...REF, target: "line-card-1" }, voiceUnits, { mode: "live", now: NOW }));
    const l = must(launchPartAct(store, { ...REF, target: "line-card-1" }, voiceUnits, { mode: "live", now: NOW, token: receipt.token, actor: OP, dryOnly: false }));
    if (l.kind !== "launched") throw new Error("stale");
    const report = must(await runJob(effectsOf(store), voiceProducer("cloud.elevenlabs", {}, { measure: stubbed }), l.jobId, { dryOnly: false }));
    expect(report.outcome).not.toBe("done");
    expect(report.job?.error?.message).toBe("The vendor rejected the key (401).");
    const stats = await ttsBudgetStats();
    expect([stats.spent, stats.held]).toEqual([0, 0]);
    expect(voiceOf(store).takes).toEqual({});
  });
});

describe("explainer voice with nothing to say", () => {
  it("is refused on its receipt while no strip card has a caption", () => {
    const { store } = explainer();
    must(writePart(store, { projectId: ID, partId: `${ID}/strips`, baseRev: "current", act: "land", op: { seed: "empty" }, label: "strips", by: { kind: "machine", id: "seed" }, next: () => ok({ strips: { cards: [] } }) }));
    const r: Result<unknown> = partActReceipt(store, REF, voiceUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("record lines needs strip cards with captions to speak");
  });
});

describe("the speech rate", () => {
  it("is one figure in the kernel's price table and the music engine's, and its log line counts characters", () => {
    const kernel = quote({ provider: "elevenlabs-voice", model: "eleven_multilingual_v2", usage: { character: 1_000 }, on: "2026-10-24" });
    const music = priceCall({ op: "tts", model: "eleven_multilingual_v2", seconds: 0, characters: 1_000 });
    expect(kernel.usd).toBeCloseTo(0.08, 9);
    expect(music).toMatchObject({ basis: "estimated" });
    expect(music.usd).toBeCloseTo(0.08, 9);
    expect(formatCall({ op: "tts", ms: 900, seconds: 0, chars: 28, model: "eleven_multilingual_v2", basis: "estimated", usd: 28 * RATE })).toBe("[music] tts ok model=eleven_multilingual_v2 ms=900 chars=28 cost=$0.0022");
  });
});
