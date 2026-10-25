import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError, errorMessage } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { PiecePorts, PieceRequest } from "@gt/producers/scout-piece/define";

import { LTX_MODEL } from "../imaging/video/comfyLtx.ts";
import { binsFrom, realSpawn, type Bins, type Spawn } from "../foundry/scout/ingest.ts";
import type { PieceEngines } from "../foundry/scout/piece.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import { CLIP_SECONDS, type CandidateId, type Night, type PieceCandidate, type SceneClip, type StoryboardCandidate } from "../foundry/scout/types.ts";
import { ltxClip } from "./scoutStoryboard.ts";
import { boardClipFile, panelStillOf } from "./scoutStoryboardActs.ts";

// THE PIECE'S ACTS - the ports of packages/producers/src/scout-piece/define.ts over the local LTX client, ffmpeg and
// the night store (spark scout-vision S2).
//
//   clip   one LTX clip of the trial's panel N still, through the trial's own guard (scoutStoryboardActs.ts
//          `panelStillOf`: only that panel's still, never a source), its prompt the panel's and the seed the launch
//          chose for the piece, written to pieces/<c-NN>/clip-N.mp4 and recorded at its index in `clips`. A LOCAL CLIP
//          IS FREE (no spend row, $0); a dry job declares it to the meter and is answered by a stand-in. A clip the
//          engine refused leaves its index null and its sentence in `error` (`clip N: ...`); the step is booked.
//   cut    every kept trial clip copied beside the re-made ones (the piece's night holds all it cuts), then every
//          clip in panel order cut into pieces/<c-NN>/piece.mp4 with the clips' own audio, its length recorded. No
//          clip at all, or a cut ffmpeg refuses, is the job's failure.
//   ended  the candidate told how its job ended (`settledPiece`).
//
// Every night write is fenced against the job's slot first (the storyboard acts' `fence`).

export type PieceActEngines = PieceEngines;

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const fatal = (code: "not-found" | "internal" | "unavailable", message: string): StepOutcome => ({ kind: "fatal", code, message });
const DRY_CLIP = new TextEncoder().encode("dry-run clip stand-in");

/** Night-relative: `pieces/c-07/clip-2.mp4`, and the cut `pieces/c-07/piece.mp4`. */
export const pieceClipFile = (cid: CandidateId, k: number): string => `pieces/${cid}/clip-${k}.mp4`;
export const pieceVideoFile = (cid: CandidateId): string => `pieces/${cid}/piece.mp4`;

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

const isPiece = (cid: string) => (x: { readonly id: string; readonly kind: string }): x is PieceCandidate => x.id === cid && x.kind === "piece";
const isBoard = (cid: string) => (x: { readonly id: string; readonly kind: string }): x is StoryboardCandidate => x.id === cid && x.kind === "storyboard";

async function writePiece(req: PieceRequest, jobId: string, fn: (c: PieceCandidate) => PieceCandidate): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find(isPiece(req.candidateId));
    if (c === undefined) return n;
    const m = withCandidate(n, { ...fn(c), jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
}

/** The piece with clip `k` (1-based) recorded: its clip (null when it could not be made) and a failure's sentence appended. */
export function withPieceClip(c: PieceCandidate, of: number, k: number, clip: SceneClip | null, why?: string): PieceCandidate {
  const clips = Array.from({ length: of }, (_, i) => c.clips[i] ?? null);
  clips[k - 1] = clip;
  const said = `clip ${k}: `;
  const errors = (c.error ?? "").split("; ").filter((e) => e !== "" && !e.startsWith(said));
  if (why !== undefined) errors.push(`${said}${why}`);
  const { error: _e, ...base } = c;
  return { ...base, clips, ...(errors.length === 0 ? {} : { error: errors.join("; ") }) };
}

type Loaded = { readonly piece: PieceCandidate; readonly trialNight: Night; readonly trial: StoryboardCandidate };

async function load(req: PieceRequest): Promise<Loaded | StepOutcome> {
  const piece = (await readNight(req.nightId)).candidates.find(isPiece(req.candidateId));
  if (piece === undefined) return fatal("not-found", `no piece ${req.candidateId} in night ${req.nightId}`);
  const trialNight = await readNight(req.trial.nightId);
  const trial = trialNight.candidates.find(isBoard(req.trial.candidateId));
  if (trial === undefined) return fatal("not-found", `no trial ${req.trial.candidateId} in night ${req.trial.nightId}`);
  return { piece, trialNight, trial };
}

/* ── clip ─────────────────────────────────────────────────────────────────── */

async function clipAct(e: PieceActEngines, req: PieceRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const ask = req.clips.find((c) => c.k === k);
  if (ask === undefined) return fatal("internal", `the piece request has no clip ${k}`);
  const got0 = await load(req);
  if ("kind" in got0) return got0;
  const { piece, trialNight, trial } = got0;
  const held = piece.clips[k - 1];
  if (held !== undefined && held !== null) return madePaid(data({ clip: k, file: held.path, held: true }), ctx);

  const of = req.clips.length;
  const failed = async (why: string): Promise<StepOutcome> => {
    fence(ctx);
    await writePiece(req, ctx.job.id, (p) => withPieceClip(p, of, k, null, why));
    return madePaid(data({ clip: k, failed: why }), ctx);
  };
  // THE GUARD: the trial's own panel still, as its night holds it now - and the one the receipt priced.
  const from = panelStillOf(trialNight, trial, k);
  if (!from.ok) return failed(from.error.message);
  if (from.value !== ask.still) return failed(`${trial.id}: panel ${k} is ${from.value} now, not the ${ask.still ?? "no still"} the receipt priced`);
  const engine = e.clip ?? ((still: Uint8Array, prompt: string, seed: number) => ltxClip(still, prompt, { aspect: req.aspect, seed }));
  let got: { readonly bytes: Uint8Array; readonly durationS: number; readonly model: string };
  try {
    const still = new Uint8Array(await readFile(resolveInNight(req.trial.nightId, from.value)));
    const render = async () => ({ ...(await engine(still, ask.prompt, ask.seed)), model: LTX_MODEL });
    got =
      ctx.job.mode.kind === "live"
        ? await render()
        : await meteredCall<{ bytes: Uint8Array; durationS: number; model: string }>(ctx, {
            provider: "comfyui",
            model: LTX_MODEL,
            payload: { from: `${req.trial.nightId}/${from.value}`, prompt: ask.prompt, aspect: req.aspect, seed: ask.seed },
            estimate: req.estimates.clip,
            stand: () => ({ bytes: DRY_CLIP, durationS: CLIP_SECONDS, model: "dry stand-in" }),
            live: async () => ({ value: await render(), unpriced: "free: a local model" }),
          });
  } catch (x) {
    return failed(errorMessage(x));
  }
  const rel = pieceClipFile(piece.id, k);
  fence(ctx);
  const abs = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, got.bytes);
  const clip: SceneClip = { path: rel, durationS: got.durationS, from: `${req.trial.nightId}/${from.value}`, engine: "ltx-local", usd: 0 };
  await writePiece(req, ctx.job.id, (p) => withPieceClip(p, of, k, clip));
  return madePaid(data({ clip: k, file: rel, seed: ask.seed, provider: "comfyui", model: got.model, dry: got.model === "dry stand-in", costUsd: 0 }), ctx);
}

/* ── cut ──────────────────────────────────────────────────────────────────── */

/** A kept trial clip reused for index `k`: only the trial's own `storyboards/<c-NN>/clip-k.mp4`, as its night records it. */
function reusedOf(trial: StoryboardCandidate, k: number, reuse: string | undefined): SceneClip | string {
  const tc = trial.clips?.[k - 1];
  if (tc === undefined || tc === null) return `${trial.id}: clip ${k} is not on the trial any more`;
  if (reuse === undefined || tc.path !== reuse || tc.path !== boardClipFile(trial.id, k)) return `${trial.id}: clip ${k} is ${tc.path}, not the ${reuse ?? "clip"} the receipt priced`;
  return tc;
}

async function cutAct(e: PieceActEngines, req: PieceRequest, ctx: StepContext): Promise<StepOutcome> {
  const got0 = await load(req);
  if ("kind" in got0) return got0;
  const { trial } = got0;
  const of = req.clips.length;
  // The kept clips first: copied into the piece's night, so the piece holds every file it cuts.
  for (const ask of req.clips) {
    if (ask.remake) continue;
    const now = (await readNight(req.nightId)).candidates.find(isPiece(req.candidateId));
    if (now?.clips[ask.k - 1] !== undefined && now.clips[ask.k - 1] !== null) continue;
    const tc = reusedOf(trial, ask.k, ask.reuse);
    const rel = pieceClipFile(req.candidateId, ask.k);
    fence(ctx);
    if (typeof tc === "string") {
      await writePiece(req, ctx.job.id, (p) => withPieceClip(p, of, ask.k, null, tc));
      continue;
    }
    const abs = resolveInNight(req.nightId, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    try {
      await copyFile(resolveInNight(req.trial.nightId, tc.path), abs);
    } catch (x) {
      await writePiece(req, ctx.job.id, (p) => withPieceClip(p, of, ask.k, null, `${tc.path}: ${errorMessage(x)}`));
      continue;
    }
    const clip: SceneClip = { path: rel, durationS: tc.durationS, from: `${req.trial.nightId}/${tc.from}`, engine: tc.engine ?? "ltx-local", usd: 0 };
    await writePiece(req, ctx.job.id, (p) => withPieceClip(p, of, ask.k, clip));
  }
  // A panel that drew no still has no clip to make or keep.
  for (const ask of req.clips) {
    if (ask.still !== null) continue;
    fence(ctx);
    await writePiece(req, ctx.job.id, (p) => withPieceClip(p, of, ask.k, null, `panel ${ask.k} of ${trial.id} drew no still`));
  }
  const piece = (await readNight(req.nightId)).candidates.find(isPiece(req.candidateId));
  if (piece === undefined) return fatal("not-found", `no piece ${req.candidateId} in night ${req.nightId}`);
  const order = req.clips.map((c) => piece.clips[c.k - 1]).filter((c): c is SceneClip => c !== undefined && c !== null);
  if (order.length === 0) return fatal("unavailable", `piece ${piece.id} has no clip to cut${piece.error === undefined ? "" : `: ${piece.error}`}`);
  const rel = pieceVideoFile(piece.id);
  fence(ctx);
  const out = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(out), { recursive: true });
  const cut = e.cut ?? ffmpegCut();
  let durationS: number;
  try {
    durationS = (await cut(order.map((c) => resolveInNight(req.nightId, c.path)), out)).durationS;
  } catch (x) {
    return fatal("unavailable", `the cut of ${order.length} clip(s) failed: ${errorMessage(x)}`);
  }
  fence(ctx);
  await writePiece(req, ctx.job.id, (p) => ({ ...p, video: rel, durationS }));
  return madePaid(data({ cut: rel, clips: order.length, durationS, provider: "ffmpeg", costUsd: 0 }), ctx);
}

/* ── ffmpeg ───────────────────────────────────────────────────────────────── */

/** What the cut needs to know of one clip: whether it carries audio, and its length (a silent one is given silence). */
export type ClipFacts = { readonly path: string; readonly audio: boolean; readonly durationS: number };

export const PIECE_FPS = 24;

/**
 * The ffmpeg argument list that cuts `clips` in order into `out`: every clip scaled and padded to one frame size, one
 * fps and one pixel format, every audio resampled to 48 kHz stereo and padded or trimmed to its clip's length (a silent
 * clip gets a silent track), so the concat filter never meets two stream shapes. H.264 + AAC, faststart.
 */
export function cutArgs(clips: readonly ClipFacts[], out: string, size: { readonly width: number; readonly height: number }, fps = PIECE_FPS): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const c of clips) args.push("-i", c.path);
  let next = clips.length;
  const audioIn = clips.map((c, i) => {
    if (c.audio) return i;
    args.push("-f", "lavfi", "-t", c.durationS.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    return next++;
  });
  const { width: w, height: h } = size;
  const legs = clips.map(
    (c, i) =>
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}];` +
      `[${audioIn[i] ?? i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${c.durationS.toFixed(3)},asetpts=N/SR/TB[a${i}]`,
  );
  const chain = `${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][a]`;
  args.push("-filter_complex", [...legs, chain].join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
  return args;
}

export const probeArgs = (file: string): string[] => ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file];

/** ffprobe's JSON as the facts the cut needs; a file with no video stream or no length is refused, naming it. */
export function probeFacts(file: string, json: string): ClipFacts & { readonly width: number; readonly height: number } {
  const p = JSON.parse(json) as { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } };
  const video = p.streams?.find((s) => s.codec_type === "video");
  const durationS = Number(p.format?.duration);
  if (video === undefined || typeof video.width !== "number" || typeof video.height !== "number") throw new AppError("invalid", `${path.basename(file)} holds no video stream`);
  if (!Number.isFinite(durationS) || durationS <= 0) throw new AppError("invalid", `${path.basename(file)} has no length`);
  return { path: file, audio: (p.streams ?? []).some((s) => s.codec_type === "audio"), durationS, width: video.width, height: video.height };
}

const even = (x: number): number => Math.max(2, Math.floor(x / 2) * 2);

/** The cut on this box's ffmpeg (ingest.ts's bounded spawn and FFMPEG/FFPROBE): probe, cut, probe the cut's length. */
export function ffmpegCut(deps: { readonly spawn?: Spawn; readonly bins?: Bins } = {}): NonNullable<PieceEngines["cut"]> {
  const spawn = deps.spawn ?? realSpawn;
  const bins = deps.bins ?? binsFrom(process.env);
  const probe = async (file: string) => {
    const r = await spawn(bins.ffprobe, probeArgs(file), { timeoutMs: 30_000, maxBuffer: 1024 * 1024 });
    if (!r.ok) throw new AppError("unavailable", `ffprobe ${path.basename(file)}: ${r.error}`);
    return probeFacts(file, r.stdout.toString("utf8"));
  };
  return async (clips, out) => {
    const facts = [];
    for (const c of clips) facts.push(await probe(c));
    const first = facts[0];
    if (first === undefined) throw new AppError("invalid", "a cut needs at least one clip");
    const r = await spawn(bins.ffmpeg, cutArgs(facts, out, { width: even(first.width), height: even(first.height) }), { timeoutMs: 600_000, maxBuffer: 16 * 1024 * 1024 });
    if (!r.ok) throw new AppError("unavailable", `ffmpeg: ${r.error}`);
    return { durationS: Math.round((await probe(out)).durationS * 100) / 100 };
  };
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/**
 * The piece a finished job leaves, or null when the ending leaves it as it is (an interruption or an operator's stop:
 * the job may yet be retried). Cut: `rendered`, any clip's sentence kept in `error`. Not cut: `failed`, with the job's
 * sentence after the clips'.
 */
export function settledPiece(c: PieceCandidate, ending: string, job: { readonly id: string; readonly error?: { readonly message: string } }): PieceCandidate | null {
  if (ending !== "done" && ending !== "failed") return null;
  const { error: _e, ...base } = c;
  if (ending === "done" && c.video !== undefined) return { ...base, status: "rendered", jobId: job.id, ...(c.error === undefined ? {} : { error: c.error }) };
  const jobSaid = job.error?.message ?? `job ${job.id} cut no piece`;
  return { ...base, status: "failed", jobId: job.id, error: [c.error, jobSaid].filter((s) => s !== undefined && s !== "").join("; ") };
}

async function ended(req: PieceRequest, job: Job, ending: string): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find(isPiece(req.candidateId));
    if (c === undefined || (c.jobId !== undefined && c.jobId !== job.id)) return n;
    const next = settledPiece(c, ending, job);
    if (next === null) return n;
    const m = withCandidate(n, next);
    return m.jobs.includes(job.id) ? m : { ...m, jobs: [...m.jobs, job.id] };
  });
}

/** A thrown act: a night write that lost its slot, a disk that refused the file - the job's. */
const jobFailure = (x: unknown): StepOutcome => ({ kind: "fatal", code: x instanceof AppError ? x.code : "internal", message: errorMessage(x) });

export function pieceActs(e: PieceActEngines): Pick<PiecePorts, "clip" | "cut" | "ended"> {
  return {
    clip: async (req, k, ctx) => {
      try {
        return await clipAct(e, req, k, ctx);
      } catch (x) {
        return jobFailure(x);
      }
    },
    cut: async (req, ctx) => {
      try {
        return await cutAct(e, req, ctx);
      } catch (x) {
        return jobFailure(x);
      }
    },
    ended,
  };
}
