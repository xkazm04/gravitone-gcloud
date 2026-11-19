import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { AppError, errorMessage, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import type { Ending, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { landCutIn } from "@gt/kernel/productions/audio";
import type { Store } from "@gt/kernel/store";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import { ASSEMBLE_STEP, LAY_STEP, laysAudio, type CutPorts, type CutRequest } from "@gt/producers/production-cut/define";

import { parseEbur128 } from "../adRender.ts";
import { dialogueLoudnessArgs, dialogueMeasureArgs, dialogueMixArgs, loudnormMeasured, roomIrWav, type DialogueLine, type LoudnormMeasure } from "../cut/dialogueMix.ts";
import { binsFrom, realSpawn, type Spawn } from "../foundry/scout/ingest.ts";
import { blobRootOf } from "../kernelProcess.ts";
import { blobRoute } from "../library/media.ts";
import { packetIdOf } from "../ledger/v1/packet.ts";

// A FINAL CUT'S ACTS (spark concept-casting-stages S5): the ports of packages/producers/src/production-cut/define.ts.
//
// WRAPPED, NOT REIMPLEMENTED. `assemble` builds the folder each craft script reads - pipeline/trailer/cut.mts wants
// music-clip/edit.json and music-clip/clips/; pipeline/music-clip/assemble.mts wants music-clip/timeline.json,
// music-clip/keyframes.json, music-clip/clips/ and a track beside them - in a temp dir and runs that script unmodified,
// `process.execPath` with argv and no shell, then reads back the mp4. Neither script needs editing: they already take a
// folder, an output path, --edit, --size and --fps as arguments. Each uses h264_nvenc, so a live cut wants that encoder.
//
//   assemble   the craft script chosen by `req.format` over the takes, in order.
//   lay        ffmpeg lays the dub lines and the score over the assembled video, the same spawn seam. A line that runs past
//              the picture's end is cut there and named in the cut's note. Each line enters on its first speech, not
//              its first sample: ffmpeg silencedetect measures the leading silence and the lay trims it (0.2 s lead when
//              it cannot be measured). With lines, the native sound is dropped and lib/cut/dialogueMix.ts places each
//              line (its measured loudness to a per-direction level, tone, side, room), ducks the score under the voice
//              and sets the loudness in two passes; a bed with no lines keeps the native sound under it.
//   land       the video reaches the record and the Board; a dry job only rehearses (no packet, no video).
//
// A dry job asks no script and no ffmpeg: each is a declared stand-in. Every write is fenced against the job's slot.

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const DRY_CUT = new TextEncoder().encode("dry-run cut stand-in");
const SCRIPT_TIMEOUT_MS = 30 * 60_000;
const PROBE_TIMEOUT_MS = 30_000;

export const TRAILER_SCRIPT = path.join("pipeline", "trailer", "cut.mts");
export const MUSIC_CLIP_SCRIPT = path.join("pipeline", "music-clip", "assemble.mts");

export type CutEngines = {
  readonly spawn?: Spawn;
  readonly node?: string;
  readonly ffmpeg?: string;
  readonly ffprobe?: string;
  readonly probe?: (file: string) => Promise<number>;
  /** Seconds of silence before a line's first speech; undefined when it cannot be measured. */
  readonly onset?: (file: string) => Promise<number | undefined>;
  /** A line segment's integrated loudness (LUFS); undefined when it cannot be measured. */
  readonly loudness?: (file: string, trimS: number) => Promise<number | undefined>;
};

const dryRun = (ctx: StepContext): boolean => ctx.job.mode.kind !== "live";
const served = (ref: BlobRef): string => blobRoute(ref.sha256, ref.mime) ?? `/api/blob/${ref.sha256}`;
const fatal = (code: "unavailable" | "internal", message: string): StepOutcome => ({ kind: "fatal", code, message });

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; the cut is not written`);
  const r = ctx.fx.tx("production.cut-fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

/* ── The folder each craft script reads ───────────────────────────────────── */

const clipName = (i: number): string => `S${String(i + 1).padStart(2, "0")}`;

/** The picture's size for the craft scripts: the portrait or landscape box H3 renders. */
export const cutSize = (aspect: CutRequest["aspect"]): string => (aspect === "9:16" ? "704x1280" : "1280x704");

/** The trailer's edit.json: one scene per take, the clips' own sound kept unless silenced. */
export function trailerEdit(req: Pick<CutRequest, "takes" | "silence">): { readonly scenes: readonly { readonly id: string; readonly gainDb: number; readonly fadeOut: number }[] } {
  return { scenes: req.takes.map((_, i) => ({ id: clipName(i), gainDb: req.silence ? -90 : 0, fadeOut: 0.15 })) };
}

/**
 * assemble.mts's plan files: one keyframe per take on its cumulative start, and a beat at every cut so its snap holds them
 * where they are. A track longer than the picture is cut at the picture's end: a clip only stretches so far.
 */
export function musicClipPlan(req: Pick<CutRequest, "takes">, trackS: number): { readonly timeline: { readonly beats: readonly { readonly t: number }[]; readonly track: { readonly durationS: number } }; readonly keyframes: { readonly frames: readonly { readonly id: string; readonly t: number }[] }; readonly trimmed: boolean } {
  let at = 0;
  const frames = req.takes.map((c, i) => {
    const f = { id: clipName(i), t: Math.round(at * 1000) / 1000 };
    at += c.durationS;
    return f;
  });
  const end = Math.min(at, trackS);
  return { timeline: { beats: [...frames.map((f) => ({ t: f.t })), { t: Math.round(end * 1000) / 1000 }], track: { durationS: Math.round(end * 1000) / 1000 } }, keyframes: { frames }, trimmed: trackS > at };
}

/** The craft script's argv: the script, the folder, the output, the same flags its operator uses. Pure. */
export function scriptArgs(req: Pick<CutRequest, "format" | "aspect">, root: string, dir: string, out: string): readonly string[] {
  return req.format === "trailer" ? [path.join(root, TRAILER_SCRIPT), dir, out, "--edit", "edit.json", "--size", cutSize(req.aspect), "--fps", "24"] : [path.join(root, MUSIC_CLIP_SCRIPT), dir, out, "--size", cutSize(req.aspect), "--fps", "24"];
}

const trackExt = (mime: string): string => (mime === "audio/flac" ? "flac" : mime === "audio/mpeg" ? "mp3" : "wav");

async function bytesOf(root: string, ref: BlobRef): Promise<Uint8Array> {
  const r = await blobStore(root).read(ref);
  if (!r.ok) throw r.error;
  return r.value;
}

/** Writes the folder a craft script reads; answers whether a track was trimmed (the music-clip's). */
async function writeFolder(root: string, dir: string, req: CutRequest, trackDur: () => Promise<number>): Promise<{ readonly trimmed: boolean }> {
  const clipDir = path.join(dir, "music-clip", "clips");
  await mkdir(clipDir, { recursive: true });
  for (const [i, t] of req.takes.entries()) await writeFile(path.join(clipDir, `${clipName(i)}.mp4`), await bytesOf(root, t.video));
  if (req.format === "trailer") {
    await writeFile(path.join(dir, "music-clip", "edit.json"), JSON.stringify(trailerEdit(req)));
    return { trimmed: false };
  }
  if (req.track === undefined) throw new AppError("internal", "a music-clip cut needs its track");
  await writeFile(path.join(dir, `track.${trackExt(req.track.mime)}`), await bytesOf(root, req.track));
  const plan = musicClipPlan(req, await trackDur());
  await writeFile(path.join(dir, "music-clip", "timeline.json"), JSON.stringify(plan.timeline));
  await writeFile(path.join(dir, "music-clip", "keyframes.json"), JSON.stringify(plan.keyframes));
  return { trimmed: plan.trimmed };
}

/* ── probing and the ffmpeg lay ───────────────────────────────────────────── */

const probeWith = (e: CutEngines, bins: ReturnType<typeof binsFrom>) => async (file: string): Promise<number> => {
  if (e.probe !== undefined) return e.probe(file);
  const r = await (e.spawn ?? realSpawn)(e.ffprobe ?? bins.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeoutMs: PROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
  if (!r.ok) throw new AppError("unavailable", `ffprobe ${path.basename(file)}: ${r.error}`);
  const d = Number(r.stdout.toString("utf8").trim());
  if (!Number.isFinite(d) || d <= 0) throw new AppError("unavailable", `ffprobe could not read a duration from ${path.basename(file)}`);
  return d;
};

/** The lead a line is laid with when its first speech could not be measured: a guess at its leading silence. */
export const FALLBACK_LEAD_S = 0.2;
/** Quieter than this is silence; a pause shorter than the minimum is speech. */
const ONSET_NOISE = "-40dB";
const ONSET_MIN_S = 0.05;
/** A silence that starts this close to the head is still the leading one: a take may open on a few ms of click before
 *  its breath (C1-adrian, el-dub-r2: 3.15 ms, then silence to 0.119 s, read as 0 under a 1 ms window, laid ~110 ms late). */
const ONSET_HEAD_S = 0.01;
/** A score or music master under dub lines: today's static level, now ducked under the voice. */
export const SCORE_BED_DB = -14;

/** The ffmpeg argv that reports a line's silences on stderr. No shell. Pure. */
export const onsetArgs = (file: string): readonly string[] => ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${ONSET_NOISE}:d=${ONSET_MIN_S}`, "-f", "null", "-"];

/** Seconds of silence before the first speech, read from silencedetect's stderr: 0 when the line opens on speech,
 *  undefined when the report has no answer (no audio stream, a line that is silence throughout). Pure. */
export function leadingSilence(stderr: string): number | undefined {
  if (!/Stream #\d+:\d+.*Audio/.test(stderr)) return undefined;
  const start = /silence_start:\s*(-?[\d.]+)/.exec(stderr);
  if (start === null || Number(start[1]) > ONSET_HEAD_S) return 0;
  const end = /silence_end:\s*([\d.]+)/.exec(stderr);
  if (end === null) return undefined;
  const s = Number(end[1]);
  return Number.isFinite(s) && s >= 0 ? Math.round(s * 1000) / 1000 : undefined;
}

const onsetWith = (e: CutEngines, bins: ReturnType<typeof binsFrom>) => async (file: string): Promise<number | undefined> => {
  if (e.onset !== undefined) return e.onset(file);
  const r = await (e.spawn ?? realSpawn)(e.ffmpeg ?? bins.ffmpeg, onsetArgs(file), { timeoutMs: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  return r.ok ? leadingSilence(r.stderr) : undefined;
};

const loudnessWith = (e: CutEngines, bins: ReturnType<typeof binsFrom>) => async (file: string, trimS: number): Promise<number | undefined> => {
  if (e.loudness !== undefined) return e.loudness(file, trimS);
  const r = await (e.spawn ?? realSpawn)(e.ffmpeg ?? bins.ffmpeg, dialogueLoudnessArgs(file, trimS), { timeoutMs: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  return r.ok ? parseEbur128(r.stderr)?.integratedLufs : undefined;
};

/**
 * Each line's start, in order, on the next take's opening. One scene carries one line; lines beyond the scenes stack on
 * the last. A line whose leading silence was measured (`silences[i]`) is laid from its first speech, which lands on the
 * opening (layArgs trims the silence); an unmeasured one is laid from its first sample, FALLBACK_LEAD_S in.
 */
export function lineStarts(takes: readonly { readonly durationS: number }[], lines: number, silences: readonly (number | undefined)[] = []): readonly number[] {
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < lines; i++) {
    starts.push(Math.round((at + (silences[i] === undefined ? FALLBACK_LEAD_S : 0)) * 1000) / 1000);
    at += takes[Math.min(i, takes.length - 1)]?.durationS ?? 0;
  }
  return starts;
}

type LayInput = { readonly video: string; readonly lines: readonly DialogueLine[]; readonly bed?: string; readonly ir?: string; readonly totalS: number; readonly out: string };

/**
 * The ffmpeg lay. With lines: the dialogue mix (lib/cut/dialogueMix.ts) over the picture, no native sound, the bed at
 * SCORE_BED_DB ducked under the voice, loudness from pass 1's measure (one pass without it). A bed alone: the native sound
 * at -5 dB under it, the result limited. No shell. Pure.
 */
export function layArgs(input: LayInput, measured?: LoudnormMeasure): readonly string[] {
  if (input.lines.length > 0) return dialogueMixArgs(dialogueInput(input), measured);
  const inputs = ["-i", input.video, ...(input.bed === undefined ? [] : ["-i", input.bed])];
  const chain = [`[0:a]aresample=48000,aformat=channel_layouts=stereo,${input.bed === undefined ? "" : "volume=-5dB,"}apad[nat]`];
  const mixed = ["[nat]"];
  if (input.bed !== undefined) {
    chain.push(`[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${SCORE_BED_DB}dB[bed]`);
    mixed.push("[bed]");
  }
  chain.push(`${mixed.join("")}amix=inputs=${mixed.length}:duration=first:normalize=0,alimiter=limit=0.89[a]`);
  return ["-v", "error", "-y", ...inputs, "-filter_complex", chain.join(";"), "-map", "0:v", "-map", "[a]", "-t", input.totalS.toFixed(3), "-c:v", "copy", "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-movflags", "+faststart", input.out];
}

function dialogueInput(input: LayInput): Parameters<typeof dialogueMixArgs>[0] {
  if (input.ir === undefined) throw new AppError("internal", "a dialogue lay needs its room impulse");
  return { video: input.video, lines: input.lines, ir: input.ir, ...(input.bed === undefined ? {} : { bed: { file: input.bed, gainDb: SCORE_BED_DB } }), totalS: input.totalS, out: input.out };
}

/** Pass 1 of a dialogue lay: its loudness measured to null (loudnormMeasured reads the stderr). No shell. Pure. */
export const layMeasureArgs = (input: LayInput): readonly string[] => dialogueMeasureArgs(dialogueInput(input));

/* ── the acts ─────────────────────────────────────────────────────────────── */

type StepOut = { readonly blob: BlobRef; readonly durationS: number; readonly note?: string; readonly dry?: true };
const stepOut = (ctx: StepContext, name: string): StepOut | undefined => ctx.outputs.get(name)?.value as StepOut | undefined;
const totalOf = (req: CutRequest): number => req.takes.reduce((a, t) => a + t.durationS, 0);

async function assembleAct(store: Store, e: CutEngines, req: CutRequest, ctx: StepContext): Promise<StepOutcome> {
  const root = process.cwd();
  const total = totalOf(req);
  let dryBlob: BlobRef | undefined;
  if (dryRun(ctx)) {
    const put = await ctx.fx.blob(DRY_CUT, "video/mp4");
    if (!put.ok) throw put.error;
    dryBlob = put.value;
  }
  const dryOut = (): StepOut => {
    if (dryBlob === undefined) throw new AppError("internal", "a dry cut has no stand-in");
    return { blob: dryBlob, durationS: Math.round(total * 100) / 100, dry: true };
  };
  const render = async (): Promise<StepOut> => {
    const dir = await mkdtemp(path.join(tmpdir(), "gt-final-cut-"));
    try {
      const bins = binsFrom(process.env);
      const probe = probeWith(e, bins);
      const blobRoot = blobRootOf(store);
      const folder = await writeFolder(blobRoot, dir, req, async () => {
        if (req.track === undefined) throw new AppError("internal", "no track to measure");
        const f = path.join(dir, `track.${trackExt(req.track.mime)}`);
        return probe(f);
      });
      const out = path.join(dir, "out.mp4");
      const args = scriptArgs(req, root, dir, out);
      const r = await (e.spawn ?? realSpawn)(e.node ?? process.execPath, args, { timeoutMs: SCRIPT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
      if (!r.ok) throw new AppError("unavailable", `${req.format === "trailer" ? TRAILER_SCRIPT : MUSIC_CLIP_SCRIPT}: ${r.error}`);
      const durationS = Math.round((await probe(out)) * 100) / 100;
      fence(ctx);
      const blob = await ctx.fx.blob(new Uint8Array(await readFile(out)), "video/mp4");
      if (!blob.ok) throw blob.error;
      return { blob: blob.value, durationS, ...(folder.trimmed ? { note: "the track runs longer than the picture; the cut stops at the picture's end" } : {}) };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
  try {
    const got = dryRun(ctx)
      ? await meteredCall<StepOut>(ctx, { provider: "ffmpeg", model: req.format, payload: { cut: req.cutId, takes: req.takes.map((t) => t.video.sha256) }, estimate: req.estimates.assemble, stand: dryOut, live: async () => ({ value: await render(), unpriced: "free: a local tool" }) })
      : await render();
    return madePaid(data(got), ctx);
  } catch (x) {
    if (x instanceof AppError && x.code === "conflict") throw x;
    return fatal(x instanceof AppError && x.code === "unavailable" ? "unavailable" : "internal", `the ${req.format} assembly failed: ${errorMessage(x)}`);
  }
}

async function layAct(store: Store, e: CutEngines, req: CutRequest, ctx: StepContext): Promise<StepOutcome> {
  const assembled = stepOut(ctx, ASSEMBLE_STEP);
  if (assembled === undefined) return fatal("internal", "the lay step has no assembled cut");
  if (assembled.dry === true) return madePaid(data({ ...assembled }), ctx);
  const dir = await mkdtemp(path.join(tmpdir(), "gt-final-lay-"));
  try {
    const blobRoot = blobRootOf(store);
    const video = path.join(dir, "in.mp4");
    await writeFile(video, await bytesOf(blobRoot, assembled.blob));
    const bins = binsFrom(process.env);
    const probe = probeWith(e, bins);
    const onset = onsetWith(e, bins);
    const loudness = loudnessWith(e, bins);
    const files: string[] = [];
    const silences: (number | undefined)[] = [];
    for (const [i, l] of req.lines.entries()) {
      const f = path.join(dir, `line-${i}.wav`);
      await writeFile(f, await bytesOf(blobRoot, l.audio));
      files.push(f);
      silences.push(await onset(f));
    }
    const starts = lineStarts(req.takes, req.lines.length, silences);
    const lines = req.lines.map((l, i) => ({ file: files[i] ?? "", startS: starts[i] ?? 0, name: l.name, ...(silences[i] === undefined ? {} : { trimS: silences[i] }), ...(l.x === undefined ? {} : { x: l.x }), ...(l.direction === undefined ? {} : { direction: l.direction }) }));
    const bed = req.bed === undefined ? undefined : path.join(dir, `bed.${trackExt(req.bed.mime)}`);
    if (req.bed !== undefined && bed !== undefined) await writeFile(bed, await bytesOf(blobRoot, req.bed));
    const over: string[] = [];
    const placed: DialogueLine[] = [];
    for (const l of lines) {
      const durS = await probe(l.file);
      if (l.startS + durS - (l.trimS ?? 0) > assembled.durationS) over.push(l.name);
      const lufs = await loudness(l.file, l.trimS ?? 0);
      placed.push({ ...l, durS, ...(lufs === undefined ? {} : { lufs }) });
    }
    const ir = path.join(dir, "room.wav");
    if (placed.length > 0) await writeFile(ir, roomIrWav());
    const out = path.join(dir, "laid.mp4");
    const input = { video, lines: placed, ...(bed === undefined ? {} : { bed }), ir, totalS: assembled.durationS, out };
    const spawn = e.spawn ?? realSpawn;
    const ffmpeg = e.ffmpeg ?? bins.ffmpeg;
    const opts = { timeoutMs: SCRIPT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 };
    const pass1 = placed.length === 0 ? undefined : await spawn(ffmpeg, layMeasureArgs(input), opts);
    const measured = pass1?.ok === true ? loudnormMeasured(pass1.stderr) : undefined;
    const r = await spawn(ffmpeg, layArgs(input, measured), opts);
    if (!r.ok) throw new AppError("unavailable", `ffmpeg: ${r.error}`);
    fence(ctx);
    const blob = await ctx.fx.blob(new Uint8Array(await readFile(out)), "video/mp4");
    if (!blob.ok) throw blob.error;
    const once = placed.length > 0 && measured === undefined ? ["the dialogue's loudness could not be measured; one loudnorm pass set it"] : [];
    const note = [...(assembled.note === undefined ? [] : [assembled.note]), ...(over.length === 0 ? [] : [`${over.join(", ")}'s line runs past the picture's end and was cut there`]), ...once].join("; ");
    return madePaid(data({ blob: blob.value, durationS: assembled.durationS, ...(note === "" ? {} : { note }) } satisfies StepOut), ctx);
  } catch (x) {
    if (x instanceof AppError && x.code === "conflict") throw x;
    return fatal(x instanceof AppError && x.code === "unavailable" ? "unavailable" : "internal", `the dub lay failed: ${errorMessage(x)}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function landAct(store: Store, req: CutRequest, ctx: StepContext): StepOutcome {
  const final = stepOut(ctx, laysAudio(req) ? LAY_STEP : ASSEMBLE_STEP);
  if (final === undefined) return fatal("internal", "the land step has no cut to land");
  fence(ctx);
  const actor = { kind: "machine", id: ctx.job.id } as const;
  const packetId = packetIdOf("final", `${req.productionId}/${req.cutId}`);
  const out = ctx.fx.tx("production.cut", (t) =>
    landCutIn(t, req.productionId, req.cutId, final.dry === true ? { state: "rehearsed", durationS: final.durationS, ...(final.note === undefined ? {} : { note: final.note }) } : { state: "on-board", video: served(final.blob), packetId, durationS: final.durationS, ...(final.note === undefined ? {} : { note: final.note }) }, actor),
  );
  if (!out.ok) throw out.error;
  return { kind: "produced", output: data({ state: out.value.state, ...(final.dry === true ? {} : { packetId }) }), costUsd: 0 };
}

/** The job's ending told to the cut: `failed` settles it with the job's sentence; a stop or an interruption leaves it for a retry. */
async function ended(store: () => Result<Store>, req: CutRequest, job: Job, ending: Ending): Promise<void> {
  if (ending !== "failed" && ending !== "done") return;
  const s = store();
  if (!s.ok) throw s.error;
  const said = ending === "failed" ? (job.error?.message ?? `job ${job.id} failed`) : `job ${job.id} ended without a cut`;
  const r = s.value.tx((t) => landCutIn(t, req.productionId, req.cutId, { state: "failed", error: said }, { kind: "machine", id: job.id }));
  if (!r.ok) throw r.error;
}

export function cutActs(store: () => Result<Store>, e: CutEngines): Pick<CutPorts, "assemble" | "lay" | "land" | "ended"> {
  const live = (): Store => {
    const s = store();
    if (!s.ok) throw s.error;
    return s.value;
  };
  return {
    assemble: (req, ctx) => assembleAct(live(), e, req, ctx),
    lay: (req, ctx) => layAct(live(), e, req, ctx),
    land: async (req, ctx) => landAct(live(), req, ctx),
    ended: (req, job, ending) => ended(store, req, job, ending),
  };
}
