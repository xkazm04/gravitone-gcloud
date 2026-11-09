import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { blobStore } from "@gt/kernel/blob";
import type { BlobRef } from "@gt/domain/blob";
import { AppError, errorMessage, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { Ending, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { TakePorts, TakeRequest } from "@gt/producers/production-take/define";
import type { Store } from "@gt/kernel/store";
import { settleTake, type TakeOutcome } from "@gt/kernel/productions/store";

import { blobRoute } from "../library/media.ts";
import { H3_ENGINE, H3_SECONDS, renderH3Clip, type H3Still } from "../imaging/video/comfyH3.ts";
import { blobRootOf } from "../kernelProcess.ts";
import { ffmpegCut } from "./scoutPieceActs.ts";

// A TAKE'S ACTS - the ports of packages/producers/src/production-take/define.ts over the H3 client, ffmpeg and the blob
// store (spark concept-casting-stages S1).
//
//   clip   one H3 clip from the panel(s) the request names. Live: rendered and timed around the call (that wall time is
//          the take's GPU seconds). Dry: declared to the meter and answered by a stand-in, booked as a would-call; the
//          card is never touched. A hero's clip IS the take, so it settles the record; a rough clip failing is that
//          clip's alone.
//   cut    a rough cut: every clip that landed, in beat order, cut with ffmpeg into one video. No clip at all fails it.
//   ended  a job that failed settles the take with the job's sentence; a stop or an interruption leaves it to a retry.
//
// Every write is fenced against the job's slot first (the piece acts' `fence`).

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const DRY_CLIP = new TextEncoder().encode("dry-run take stand-in");

/** The clip render a test can replace; live it is the H3 client. */
export type TakeEngines = {
  readonly clip?: (input: { readonly first: H3Still; readonly last?: H3Still; readonly prompt: string; readonly seed: number; readonly width: number; readonly height: number }) => Promise<{ readonly bytes: Uint8Array; readonly durationS: number }>;
  readonly cut?: (clips: readonly string[], out: string) => Promise<{ readonly durationS: number }>;
};

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; the take is not written`);
  const r = ctx.fx.tx("production.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

const served = (ref: BlobRef): string => blobRoute(ref.sha256, ref.mime) ?? `/api/blob/${ref.sha256}`;

type StillBytes = H3Still;

async function stillOf(root: string, ref: BlobRef): Promise<StillBytes> {
  const r = await blobStore(root).read(ref);
  if (!r.ok) throw r.error;
  return { bytes: r.value, mime: ref.mime === "image/jpeg" ? "image/jpeg" : ref.mime === "image/webp" ? "image/webp" : "image/png" };
}

/** Where a live clip is measured and where its seconds come from: one number, written with the take. */
type ClipOut = { readonly clip: number; readonly blob?: BlobRef; readonly durationS?: number; readonly gpuSeconds?: number; readonly failed?: string };

const widthHeight = (aspect: TakeRequest["aspect"]): { readonly width: number; readonly height: number } => (aspect === "9:16" ? { width: 704, height: 1280 } : { width: 1280, height: 704 });

function posterOf(req: TakeRequest): string | undefined {
  const f = req.clips[0]?.first;
  return f === undefined ? undefined : served(f);
}

function settled(ctx: StepContext, req: TakeRequest, o: TakeOutcome): void {
  fence(ctx);
  const r: Result<unknown> = ctx.fx.tx("production.settle", (t) => settleTake(t, req.productionId, req.takeId, o, { kind: "machine", id: ctx.job.id }));
  if (!r.ok) throw r.error;
}

const dryRun = (ctx: StepContext): boolean => ctx.job.mode.kind !== "live";

async function clipAct(e: TakeEngines, root: string, req: TakeRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const ask = req.clips.find((c) => c.k === k);
  if (ask === undefined) return { kind: "fatal", code: "internal", message: `the take request has no clip ${k}` };
  const size = widthHeight(req.aspect);
  try {
    const first = await stillOf(root, ask.first);
    const last = ask.last === undefined ? undefined : await stillOf(root, ask.last);
    const render = async (): Promise<{ bytes: Uint8Array; durationS: number; model: string; wallS: number }> => {
      const t0 = Date.now();
      const input = { first, ...(last === undefined ? {} : { last }), prompt: ask.prompt, seed: req.seed, ...size };
      const got = e.clip === undefined ? await renderH3Clip(input) : await e.clip(input);
      return { bytes: got.bytes, durationS: got.durationS, model: H3_ENGINE, wallS: (Date.now() - t0) / 1000 };
    };
    const got = dryRun(ctx)
      ? await meteredCall<{ bytes: Uint8Array; durationS: number; model: string; wallS: number }>(ctx, {
          provider: "comfyui",
          model: H3_ENGINE,
          payload: { first: ask.first.sha256, ...(ask.last === undefined ? {} : { last: ask.last.sha256 }), prompt: ask.prompt, seed: req.seed, ...size },
          estimate: req.estimates.clip,
          stand: () => ({ bytes: DRY_CLIP, durationS: Math.round(H3_SECONDS * 100) / 100, model: "dry stand-in", wallS: 0 }),
          live: async () => ({ value: await render(), unpriced: "free: a local model" }),
        })
      : await render();
    fence(ctx);
    const blob = await ctx.fx.blob(got.bytes, "video/mp4");
    if (!blob.ok) throw blob.error;
    const out: ClipOut = { clip: k, blob: blob.value, durationS: got.durationS, gpuSeconds: Math.round(got.wallS) };
    if (req.kind === "hero") settled(ctx, req, { state: "ready", video: served(blob.value), ...(posterOf(req) === undefined ? {} : { poster: posterOf(req) as string }), durationS: got.durationS, gpuSeconds: out.gpuSeconds ?? 0 });
    return madePaid(data({ ...out, seed: req.seed, provider: "comfyui", model: got.model, dry: got.model === "dry stand-in", costUsd: 0 }), ctx);
  } catch (x) {
    if (x instanceof AppError && x.code === "conflict") throw x;
    const why = errorMessage(x);
    if (req.kind === "hero") return { kind: "fatal", code: x instanceof AppError ? x.code : "internal", message: why };
    return madePaid(data({ clip: k, failed: why } satisfies ClipOut), ctx);
  }
}

async function cutAct(e: TakeEngines, req: TakeRequest, root: string, ctx: StepContext): Promise<StepOutcome> {
  const landed: { readonly k: number; readonly ref: BlobRef; readonly durationS: number; readonly gpuSeconds: number }[] = [];
  const failures: string[] = [];
  for (const ask of req.clips) {
    const out = ctx.outputs.get(`clip:${ask.k}`)?.value as ClipOut | undefined;
    if (out?.blob === undefined) failures.push(`clip ${ask.k}: ${out?.failed ?? "no output"}`);
    else landed.push({ k: ask.k, ref: out.blob, durationS: out.durationS ?? 0, gpuSeconds: out.gpuSeconds ?? 0 });
  }
  const gpuSeconds = landed.reduce((a, c) => a + c.gpuSeconds, 0);
  if (landed.length === 0) return { kind: "fatal", code: "unavailable", message: `the rough cut has no clip to cut: ${failures.join("; ")}` };
  const totalDuration = landed.reduce((a, c) => a + c.durationS, 0);
  let bytes: Uint8Array;
  let durationS = totalDuration;
  if (dryRun(ctx)) {
    bytes = DRY_CLIP;
  } else {
    const dir = await mkdtemp(path.join(tmpdir(), "gt-production-cut-"));
    try {
      const store = blobStore(root);
      const files: string[] = [];
      for (const clip of landed) {
        const read = await store.read(clip.ref);
        if (!read.ok) throw read.error;
        const file = path.join(dir, `clip-${clip.k}.mp4`);
        await writeFile(file, read.value);
        files.push(file);
      }
      const out = path.join(dir, "rough.mp4");
      const cut = e.cut ?? ffmpegCut();
      durationS = (await cut(files, out)).durationS;
      bytes = new Uint8Array(await readFile(out));
    } catch (x) {
      return { kind: "fatal", code: "unavailable", message: `the cut of ${landed.length} clip(s) failed: ${errorMessage(x)}` };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  fence(ctx);
  const blob = await ctx.fx.blob(bytes, "video/mp4");
  if (!blob.ok) throw blob.error;
  settled(ctx, req, { state: "ready", video: served(blob.value), ...(posterOf(req) === undefined ? {} : { poster: posterOf(req) as string }), durationS, gpuSeconds });
  return madePaid(data({ cut: blob.value, clips: landed.length, durationS, failures, provider: "ffmpeg", costUsd: 0 }), ctx);
}

/** The job's ending told to the take: `failed` settles it with the job's sentence; a stopped or interrupted job is left rendering for its retry. */
async function ended(store: () => Result<Store>, req: TakeRequest, job: Job, ending: Ending): Promise<void> {
  if (ending !== "failed" && ending !== "done") return;
  const s = store();
  if (!s.ok) throw s.error;
  const said = ending === "failed" ? (job.error?.message ?? `job ${job.id} failed`) : `job ${job.id} ended without a video`;
  const r = s.value.tx((t) => settleTake(t, req.productionId, req.takeId, { state: "failed", error: said }, { kind: "machine", id: job.id }));
  if (!r.ok) throw r.error;
}

/** A thrown act (a store write that lost its slot, a disk that refused the file): the job's. */
const jobFailure = (x: unknown): StepOutcome => ({ kind: "fatal", code: x instanceof AppError ? x.code : "internal", message: errorMessage(x) });

export function takeActs(store: () => Result<Store>, e: TakeEngines): Pick<TakePorts, "clip" | "cut" | "ended"> {
  const rootOf = (): string => {
    const s = store();
    if (!s.ok) throw s.error;
    return blobRootOf(s.value);
  };
  return {
    clip: async (req, k, ctx) => {
      try {
        return await clipAct(e, rootOf(), req, k, ctx);
      } catch (x) {
        return jobFailure(x);
      }
    },
    cut: async (req, ctx) => {
      try {
        return await cutAct(e, req, rootOf(), ctx);
      } catch (x) {
        return jobFailure(x);
      }
    },
    ended: (req, job, ending) => ended(store, req, job, ending),
  };
}
