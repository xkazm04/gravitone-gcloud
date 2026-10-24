// VOICE FX (spark audio-postproduction-research WP3): a take of a line re-voiced as a character,
// through the part op that carries the words (`voice-fx-ask`) and the voice part's `fx-line` act,
// on a real-shaped explainer. Never a text model: a DRY job stands in (one room, the router never
// asked), and the LIVE chain path runs `proposeChain` against a STUB agent's recorded answers.
// The render runs the REAL audio sidecar where `sidecarDoctor` says it can (skipped with the
// doctor's own sentence where it cannot), and a fake render elsewhere so the crash enumeration
// spawns no Python. The source take is read before and after: the act never writes it.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DIRS = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-step-voice-fx-"));
  process.env["SOUND_STORE_DIR"] = p.join(dir, "sound");
  process.env["SPEND_STORE"] = "memory";
  return dir;
});

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import type { PartView } from "@gt/domain/partView";
import { decodeStep } from "@gt/domain/steps/record";
import { VOICE } from "@gt/domain/steps/parts";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { enumerateCrashes, type CrashSpec } from "@gt/kernel/crash";
import type { Effects } from "@gt/kernel/effects";
import { get, retry } from "@gt/kernel/job";
import { ackLane } from "@gt/kernel/job-queue";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { loadPart, opPart, resetParts } from "../../app/(studio)/projects/[id]/_part/fixture.ts";
import { actReceipt, confirmAct } from "../../app/(studio)/projects/[id]/_part/fixtureActs.ts";
import { albumOpSchema } from "../../app/(studio)/projects/[id]/_part/schema.ts";
import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";
import { applyChain, measureFile, sidecarDoctor } from "../../lib/audio/sidecar.ts";
import { blobRootOf, effectsOf, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";
import { voiceProducer, voiceUnits, type VoiceEngines } from "../../lib/producers/voice.ts";
import { FX_OF_STAND_IN_UNMEASURED } from "../../lib/producers/voiceFx.ts";
import { FX_STAND_IN } from "../../lib/sound/voiceFx/standIn.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";

afterAll(() => rmSync(DIRS, { recursive: true, force: true }));

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-24T09:00:00Z");
const ID = "ex1";
const PART = `${ID}/voice`;
const LINE = "line-card-1";
const SRC = "vtake-source";
const REF = { projectId: ID, partId: PART, act: "fx-line", target: LINE };
const GHOST = "a ghost in a stairwell";
const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

const CARDS = ["Bitcoin is scarce by design.", "Scarcity alone does not make a price."].map((caption, i) => ({ id: `card-${i + 1}`, section: "s1", title: `card ${i + 1}`, caption, state: "drawn" as const }));

let kernels: Kernel[] = [];
afterEach(() => {
  for (const k of kernels) k.close();
  kernels = [];
});

type World = { store: Store; dir: string; k: Kernel; blobs: BlobStore; port: ReturnType<typeof makeRealPart> };
function explainer(dir = mkdtempSync(path.join(DIRS, "w-"))): World {
  const k = must(openKernel(path.join(dir, "k.sqlite"), { snapshotDir: dir }));
  kernels.push(k);
  const store = k.store;
  must(compose(store, { recipe: "explainer", title: "Why bitcoin" }, OP, { id: ID }));
  must(writePart(store, { projectId: ID, partId: `${ID}/strips`, baseRev: "current", act: "land", op: { seed: "strips" }, label: "strips", by: { kind: "machine", id: "seed" }, next: () => ok({ strips: { cards: CARDS } }) }));
  const blobs = blobStore(blobRootOf(store));
  return { store, dir, k, blobs, port: makeRealPart({ store: () => ok(store), now: () => NOW, gates: { store: () => ok(store), blobs: () => blobs, now: () => NOW } }) };
}

/** A mono 16-bit sine at -20 dBFS: a spoken take's stand-in with signal in it. */
function sineWav(seconds: number, hz = 220, rate = 22_050): Uint8Array {
  const n = Math.round(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ascii = (at: number, s: string): void => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 0.1 * 32767), true);
  return new Uint8Array(buf);
}

/** A spoken (live) take on line-card-1, its bytes in the kernel's blob store, as WP2 lands one. */
async function spokenSource(w: World): Promise<BlobRef> {
  const ref = must(await w.blobs.put(sineWav(1.8), "audio/wav"));
  const take = { id: SRC, label: "take 1", at: NOW, seconds: 1.8, mark: null, blob: ref, sections: [], engine: { provider: "elevenlabs", model: "eleven_multilingual_v2", voiceId: "JBFqnCBsd6RMkjVDRZzb", mode: "live" } };
  must(writePart(w.store, { projectId: ID, partId: PART, baseRev: "current", act: "land", op: { seed: "voice" }, label: "voice", by: { kind: "machine", id: "seed" }, next: () => ok({ voice: { text: {}, takes: { [SRC]: take }, byLine: { [LINE]: { takeIds: [SRC], active: SRC } } } }) }));
  return ref;
}

const voiceOf = (s: Store) => must(decodeStep(VOICE, must(readPart(s, { projectId: ID, partId: PART })).records.get("voice") ?? {}));
const accepts = (s: Store) => must(s.read((r) => r.all("SELECT key, subject_id FROM events WHERE type = 'audio.accept' ORDER BY seq")));
const written = (b: unknown): BlobRef => b as BlobRef;
const voiceView = (v: PartView) => (v.kind === "voice" ? v.data : null);

async function ask(w: World, describe: string, takeId = SRC, lineId = LINE): Promise<Result<PartView>> {
  const v = must(await w.port.loadPart({ projectId: ID, key: "voice" }));
  const r = await w.port.opPart({ projectId: ID, key: "voice", baseRev: v.rev, op: { op: "voice-fx-ask", lineId, takeId, describe } });
  if (!r.ok) return r;
  return r.value.kind === "applied" ? ok(r.value.view) : { ok: false, error: new Error("conflict") as never };
}

/** A fake sidecar: the render writes the input back with every sample inverted; the measure reads a usable stem. */
const fakeRender: VoiceEngines["render"] = async (inPath, _chain, outPath) => {
  const b = readFileSync(inPath);
  for (let i = 44; i + 1 < b.length; i += 2) b.writeInt16LE(-b.readInt16LE(i) | 0, i);
  writeFileSync(outPath, b);
  return ok({ durationS: (b.length - 44) / 44_100 });
};
const fakeMeasure: VoiceEngines["measure"] = async (file) => ok({ integratedLufs: -21, truePeakDb: -6, lra: 2, clippedSamples: 0, leadSilenceS: 0, tailSilenceS: 0, durationS: (readFileSync(file).length - 44) / 44_100 } satisfies AudioMeasureFull);

function launch(w: World, mode: "dry" | "live"): string {
  const receipt = must(partActReceipt(w.store, REF, voiceUnits, { mode, now: NOW }));
  const l = must(launchPartAct(w.store, REF, voiceUnits, { mode, now: NOW, token: receipt.token, actor: OP, ...(mode === "live" ? { dryOnly: false } : {}) }));
  if (l.kind !== "launched") throw new Error("stale");
  return l.jobId;
}

/* ── the op ───────────────────────────────────────────────────────────────── */

describe("voice-fx-ask", () => {
  it("refuses an empty description, an unknown line and a take that is not on the line, each with a sentence", async () => {
    const w = explainer();
    await spokenSource(w);
    const msg = (r: Result<unknown>): string => (r.ok ? "" : r.error.message);
    expect(msg(await ask(w, "   "))).toBe("a voice fx needs a description");
    expect(msg(await ask(w, GHOST, SRC, "line-nope"))).toBe("no line line-nope");
    expect(msg(await ask(w, GHOST, SRC, "line-card-2"))).toBe(`no take ${SRC} on this line`);
    expect(msg(await ask(w, GHOST, "vtake-nope"))).toBe("no take vtake-nope on this line");
    // The server's door holds the same bounds before a side sees the op.
    const door = (describe: string) => albumOpSchema.safeParse({ op: "voice-fx-ask", lineId: LINE, takeId: SRC, describe }).success;
    expect([door(""), door("  "), door("x".repeat(401)), door(GHOST)]).toEqual([false, false, false, true]);
    const v = must(await ask(w, `  ${GHOST} `));
    expect(voiceView(v)?.lines.find((l) => l.id === LINE)?.fxAsk).toEqual({ from: SRC, describe: GHOST });
    expect(voiceOf(w.store).fxAsk).toEqual({ [LINE]: { from: SRC, describe: GHOST } });
    expect(msg(await ask(w, GHOST))).toBe("unchanged");
  });

  it("refuses the act at plan time while the line has no ask, or names none", async () => {
    const w = explainer();
    await spokenSource(w);
    const r = partActReceipt(w.store, REF, voiceUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe(`no voice fx is asked for ${LINE}`);
    const none = partActReceipt(w.store, { projectId: ID, partId: PART, act: "fx-line" }, voiceUnits, { mode: "dry", now: NOW });
    expect(none.ok ? "" : none.error.message).toBe("voice fx names a line");
  });
});

/* ── a DRY job through the real sidecar ───────────────────────────────────── */

const doctor = await sidecarDoctor();
if (!doctor.ok) console.log(`[voice-fx] the real-sidecar case is skipped: ${doctor.error.message}`);

describe.skipIf(!doctor.ok)("a DRY fx-line job, rendered by the real audio sidecar", () => {
  it("lands a new take beside the source - its bytes differ, the source is untouched, the ask is answered", async () => {
    const w = explainer();
    const src = await spokenSource(w);
    const before = voiceOf(w.store).takes[SRC];
    const srcBytes = must(await w.blobs.read(src));
    must(await ask(w, GHOST));
    const receipt = must(partActReceipt(w.store, REF, voiceUnits, { mode: "dry", now: NOW }));
    expect(receipt.lines[0]).toMatchObject({ lane: "cloud.elevenlabs", usd: 0 });
    const jobId = launch(w, "dry");
    const report = must(await runJob(effectsOf(w.store), voiceProducer("cloud.elevenlabs", {}, { render: applyChain, measure: (f) => measureFile(f), blobs: () => w.blobs }), jobId, { dryOnly: true }));
    expect(report.outcome).toBe("done");
    // A dry job asks no model: the meter booked the turn as a would-call, never a served one.
    expect(report.wouldCalls?.map((c) => c.model)).toEqual(["voice-fx"]);
    const v = voiceOf(w.store);
    expect(v.byLine[LINE]?.takeIds.length).toBe(2);
    expect(v.byLine[LINE]?.active).toBe(SRC);
    const fxId = v.byLine[LINE]?.takeIds[1] ?? "";
    const fx = v.takes[fxId];
    expect(fx).toMatchObject({ fxOf: SRC, describe: GHOST, label: GHOST, chain: FX_STAND_IN, engine: { provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb", mode: "dry" } });
    expect(fx?.blob?.mime).toBe("audio/wav");
    expect(fx?.blob?.sha256).not.toBe(src.sha256);
    const fxBytes = must(await w.blobs.read(written(fx?.blob)));
    expect(Buffer.from(fxBytes).equals(Buffer.from(srcBytes))).toBe(false);
    // The source take: the same record, the same bytes.
    expect(v.takes[SRC]).toEqual(before);
    expect(Buffer.from(must(await w.blobs.read(src))).equals(Buffer.from(srcBytes))).toBe(true);
    // A spoken source is measured and judged; its row names the FX take.
    expect(fx?.accept?.profile).toBe("voice-take");
    expect(accepts(w.store)).toEqual([{ key: `audio-accept:${fx?.blob?.sha256}:voice-take`, subject_id: `${ID}:${LINE}:${fxId}` }]);
    expect(v.fxAsk).toBeUndefined();
    const line = voiceView(must(await w.port.loadPart({ projectId: ID, key: "voice" })))?.lines.find((l) => l.id === LINE);
    expect(line?.fxAsk).toBeUndefined();
    expect(line?.takes[1]).toMatchObject({ id: fxId, label: GHOST, active: false, fx: { of: SRC, describe: GHOST, chain: FX_STAND_IN } });
  }, 120_000);
});


/* ── a dry stand-in source ────────────────────────────────────────────────── */

describe("an FX take of a dry stand-in", () => {
  it("lands, and is not measured: no verdict, no row", async () => {
    const w = explainer();
    const record = must(partActReceipt(w.store, { projectId: ID, partId: PART, act: "record-line", target: LINE }, voiceUnits, { mode: "dry", now: NOW }));
    const rl = must(launchPartAct(w.store, { projectId: ID, partId: PART, act: "record-line", target: LINE }, voiceUnits, { mode: "dry", now: NOW, token: record.token, actor: OP }));
    if (rl.kind !== "launched") throw new Error("stale");
    const seen: string[] = [];
    const measure: VoiceEngines["measure"] = async (f) => (seen.push(f), fakeMeasure(f));
    must(await runJob(effectsOf(w.store), voiceProducer("cloud.elevenlabs", {}, { measure, render: fakeRender, blobs: () => w.blobs }), rl.jobId, { dryOnly: true }));
    const standIn = voiceOf(w.store).byLine[LINE]?.active ?? "";
    must(await ask(w, GHOST, standIn));
    const jobId = launch(w, "dry");
    must(await runJob(effectsOf(w.store), voiceProducer("cloud.elevenlabs", {}, { measure, render: fakeRender, blobs: () => w.blobs }), jobId, { dryOnly: true }));
    const v = voiceOf(w.store);
    const fx = v.takes[v.byLine[LINE]?.takeIds[1] ?? ""];
    expect(fx?.fxOf).toBe(standIn);
    expect(fx !== undefined && "accept" in fx).toBe(false);
    expect(seen).toEqual([]);
    expect(accepts(w.store)).toEqual([]);
    const out = must(w.store.read((r) => r.all("SELECT output FROM job_outputs WHERE job_id = ? AND step LIKE 'unit:%'", jobId)));
    expect(JSON.parse(String(out[0]?.["output"]))["unmeasured"]).toBe(FX_OF_STAND_IN_UNMEASURED);
  });
});

/* ── the LIVE chain: a stub agent's answers through the door ──────────────── */

const PROV = { provider: "claude-cli", model: "stub-agent", transport: "local-subprocess", rung: "preferred", turn: "voice-fx", schemaEnforcement: "prompted", durationMs: 1200, costBasis: "unpriced", promptChars: 0 } as const;
const stubAgent = (answer: unknown, asked: TextRequest[] = []) => async (req: TextRequest): Promise<TextResult> => {
  asked.push(req);
  return { text: JSON.stringify(answer), json: answer, provenance: { ...PROV, promptChars: req.prompt.length } };
};

describe("a LIVE fx-line job, its chain from a stub agent", () => {
  it("renders the agent's chain as answered, and books who wrote it", async () => {
    const w = explainer();
    await spokenSource(w);
    must(await ask(w, GHOST));
    const chain = { v: 1, stages: [{ kind: "pitch", semitones: -2 }, { kind: "reverb", roomSize: 0.95, damping: 0.6, wet: 0.6, dry: 0.4, width: 1 }] };
    const asked: TextRequest[] = [];
    const report = must(await runJob(effectsOf(w.store), voiceProducer("cloud.elevenlabs", { reason: stubAgent(chain, asked) }, { render: fakeRender, measure: fakeMeasure, blobs: () => w.blobs }), launch(w, "live"), { dryOnly: false }));
    expect(report.outcome).toBe("done");
    expect(asked.map((r) => r.turn)).toEqual(["voice-fx"]);
    expect(asked[0]?.prompt).toContain(GHOST);
    const v = voiceOf(w.store);
    const fx = v.takes[v.byLine[LINE]?.takeIds[1] ?? ""];
    expect(fx).toMatchObject({ chain, engine: { mode: "live", usd: null }, chainBy: { provider: "claude-cli", model: "stub-agent", rung: "preferred" } });
  });

  it("refuses an out-of-bounds answer with the door's path, lands nothing, and keeps the ask", async () => {
    const w = explainer();
    await spokenSource(w);
    must(await ask(w, GHOST));
    const tooLow = { v: 1, stages: [{ kind: "pitch", semitones: -24 }] };
    const report = must(await runJob(effectsOf(w.store), voiceProducer("cloud.elevenlabs", { reason: stubAgent(tooLow) }, { render: fakeRender, measure: fakeMeasure, blobs: () => w.blobs }), launch(w, "live"), { dryOnly: false }));
    expect(report.outcome).not.toBe("done");
    expect(report.job?.error?.message).toBe("voice-fx: stages.0.semitones: Too small: expected number to be >=-12");
    const v = voiceOf(w.store);
    expect(v.byLine[LINE]?.takeIds).toEqual([SRC]);
    expect(v.fxAsk).toEqual({ [LINE]: { from: SRC, describe: GHOST } });
  });
});

/* ── a job that dies after any effect ─────────────────────────────────────── */

describe("a DRY fx-line job that dies after any effect", () => {
  it("re-lands without a second FX take or a second acceptance row", async () => {
    type W = World & { fx: Effects; jobId: string };
    const holder = { bootId: "boot-fx", pid: 702, host: "box" };
    const second = { bootId: "boot-fx2", pid: 702, host: "box" };
    const producerOf = (w: W) => voiceProducer("cloud.elevenlabs", {}, { render: fakeRender, measure: fakeMeasure, blobs: () => w.blobs });
    const open = async (): Promise<W> => {
      const w = explainer();
      await spokenSource(w);
      must(await ask(w, GHOST));
      return { ...w, fx: effectsOf(w.store), jobId: launch(w, "dry") };
    };
    const spec: CrashSpec<W> = {
      open,
      reopen: (w) => {
        w.k.close();
        const k = must(openKernel(path.join(w.dir, "k.sqlite"), { snapshotDir: w.dir }));
        kernels.push(k);
        return { ...w, k, store: k.store, fx: effectsOf(k.store) };
      },
      close: (w) => w.k.close(),
      effects: (w) => w.fx,
      scenario: async (fx, w) => {
        must(await runJob(fx, producerOf(w), w.jobId, { holder, alive: () => true, heartbeatMs: 3_600_000, dryOnly: true }));
      },
      recover: async (fx, w) => {
        must(recover(fx, { holder: second, alive: () => true }));
        const id = must(parseAt("job id", jobIdSchema, w.jobId));
        if (must(get(w.k.store, id)).job.state === "interrupted") {
          must(ackLane(w.k.store, "cloud.elevenlabs", OP));
          must(retry(w.k.store, id, OP));
        }
        if (must(get(w.k.store, id)).job.state === "queued") must(await runJob(fx, producerOf(w), w.jobId, { holder: second, alive: () => true, dryOnly: true }));
      },
      invariant: (w, phase) => {
        if (phase === "crashed") return undefined;
        const v = voiceOf(w.k.store);
        const ids = v.byLine[LINE]?.takeIds ?? [];
        if (ids.length !== 2) return `the line holds ${ids.length} takes, not the source and one FX take: ${JSON.stringify(ids)}`;
        if (Object.keys(v.takes).length !== 2) return `${Object.keys(v.takes).length} takes in the record, not 2`;
        if (v.takes[ids[1] ?? ""]?.fxOf !== SRC) return "the second take is not the source's FX version";
        if (v.fxAsk !== undefined) return "the ask survived its landing";
        const rows = accepts(w.k.store).length;
        if (rows !== 1) return `${rows} acceptance rows, not 1`;
        return undefined;
      },
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects).toContain("tx:part.land");
    expect(report.effects).toContain("tx:audio.accept");
    expect(report.effects.filter((e) => e.startsWith("call:perform:unit:"))).toHaveLength(1);
    expect(report.violations).toEqual([]);
  }, 180_000);
});

/* ── the fixture side: the same module, dry landings ─────────────────────── */

describe("voice fx on the fixture side", () => {
  const FX = "provider-routing-explainer";
  const okOf = async <T,>(p: Result<T> | Promise<Result<T>>): Promise<T> => must(await p);
  const fact = async (key: string, a: Parameters<typeof actReceipt>[2], target?: string): Promise<PartView> => {
    const r = await okOf(actReceipt(FX, key, a, NOW, target));
    const c = await okOf(confirmAct(FX, key, a, r.token, NOW, target));
    if (c.kind !== "launched") throw new Error("stale");
    return c.view;
  };

  it("lands an FX take beside the recorded one, with its words, its chain and the verdict its silence earns", async () => {
    resetParts();
    await fact("article", "write-article");
    await fact("strips", "draw-strips");
    const lines = voiceView(await okOf(loadPart(FX, "voice", NOW)))?.lines ?? [];
    const line = lines[0]?.id ?? "";
    await fact("voice", "record-line", line);
    const v = await okOf(loadPart(FX, "voice", NOW));
    const source = voiceView(v)?.lines[0]?.takes[0]?.id ?? "";
    const early = await actReceipt(FX, "voice", "fx-line", NOW, line);
    expect(early.ok ? "" : early.error.message).toBe(`no voice fx is asked for ${line}`);
    const blank = await opPart(FX, "voice", v.rev, { op: "voice-fx-ask", lineId: line, takeId: source, describe: " " }, NOW);
    expect(blank.ok ? "" : blank.error.message).toBe("a voice fx needs a description");
    const asked = await okOf(opPart(FX, "voice", v.rev, { op: "voice-fx-ask", lineId: line, takeId: source, describe: GHOST }, NOW));
    expect(asked.kind).toBe("applied");
    const after = voiceView(await fact("voice", "fx-line", line))?.lines[0];
    expect(after?.fxAsk).toBeUndefined();
    expect(after?.activeTakeId).toBe(source);
    const fx = after?.takes[1];
    expect(fx).toMatchObject({ label: GHOST, active: false, held: true, fx: { of: source, describe: GHOST, chain: FX_STAND_IN } });
    expect(fx?.accept?.verdict).toBe("fail");
    expect(fx?.accept?.reasons).toEqual(expect.arrayContaining(["loudness not measured", "true peak not measured"]));
  });
});
