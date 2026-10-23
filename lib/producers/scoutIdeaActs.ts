import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { AppError } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { IdeasPorts, IdeasRequest } from "@gt/producers/scout-ideas/define";

import { ImagingError } from "../imaging/errors.ts";
import { studioCreditsOf } from "../imaging/providers/leonardoStudio.ts";
import type { GeneratedImages, GenerateRequest, ImageRef } from "../imaging/types.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import type { CandidateId, IdeaCandidate } from "../foundry/scout/types.ts";
import { imageFailure } from "./frames.ts";

// THE IDEAS' ACTS - the ports of packages/producers/src/scout-ideas/define.ts over the imaging
// router and the night store.
//
//   idea   one studio still from the idea's prompt (`prefer: leonardo-studio`, prefer-only in the
//          router, so a studio failure is the idea's sentence and never a second vendor's bill),
//          metered - its row's model axis names leonardo-studio, which the night's ceiling does not
//          cap (lib/foundry/scout/budget.ts `capped`); a dry job is answered by `standIdea`, OUR
//          picture, and books a would-call. Written to ideas/<c-NN>.<ext> in the night.
//   ended  a failed job's sentence on every idea of it still pending, verbatim
//
// Every night write is fenced against the job's slot first (the scene and asset acts' `fence`).

export type IdeaEngines = {
  readonly generate: (req: GenerateRequest) => Promise<GeneratedImages>;
};

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const fatal = (code: "not-found" | "unavailable" | "internal", message: string): StepOutcome => ({ kind: "fatal", code, message });

const EXT: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Night-relative: `ideas/c-12.png`. */
export const ideaFile = (cid: CandidateId, mime: string): string => `ideas/${cid}.${EXT[mime] ?? "png"}`;

/* ── The dry stand-in ─────────────────────────────────────────────────────── */

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([len, typed, crc]);
}

/**
 * A dry artboard: a 16:9 ground and horizon with one disc, the disc moved and the ground warmed by
 * the idea's place in the batch so a dry packet's tiles are told apart. OUR picture, drawn here.
 */
export function standIdea(k: number): Buffer {
  const [w, h] = [320, 180];
  const sky = [38 + ((k * 23) % 60), 44, 62];
  const ground = [72, 64 + ((k * 17) % 50), 52];
  const ink = [214, 196, 150];
  const cx = 0.2 + ((k * 0.13) % 0.6);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const disc = (x / w - cx) ** 2 * 3.16 + (y / h - 0.42) ** 2 <= 0.012;
      raw.set(disc ? ink : y / h < 0.62 ? sky : ground, y * (1 + w * 3) + 1 + x * 3);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/* ── The night ────────────────────────────────────────────────────────────── */

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

const isIdea = (cid: string) => (x: { readonly id: string; readonly kind: string }): x is IdeaCandidate => x.id === cid && x.kind === "idea";

/** Write the ideas named by `which` through `fn`, each stamped with this job. */
async function writeIdeas(req: IdeasRequest, jobId: string, which: readonly string[], fn: (c: IdeaCandidate) => IdeaCandidate): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    let m = n;
    for (const cid of which) {
      const c = m.candidates.find(isIdea(cid));
      if (c !== undefined) m = withCandidate(m, { ...fn(c), jobId });
    }
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
}

const failed = (why: string) => (c: IdeaCandidate): IdeaCandidate => ({ ...c, status: "failed", error: why });

/* ── idea ─────────────────────────────────────────────────────────────────── */

async function ideaAct(e: IdeaEngines, req: IdeasRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const ask = req.ideas[k - 1];
  if (ask === undefined) return fatal("internal", `the ideas request has no idea ${k}`);
  const c = (await readNight(req.nightId)).candidates.find(isIdea(ask.candidateId));
  if (c === undefined) return fatal("not-found", `no idea ${ask.candidateId} in night ${req.nightId}`);
  // A drive that died between the picture and the booking: the picture is the idea's.
  if (c.status === "rendered" && c.image !== undefined) return madePaid(data({ idea: c.id, file: c.image, held: true }), ctx);

  const gen: GenerateRequest = { prompt: ask.prompt, aspect: "16:9", count: 1, prefer: "leonardo-studio" };
  let got: { images: ImageRef[]; provenance?: GeneratedImages["provenance"] };
  try {
    got = await meteredCall<{ images: ImageRef[]; provenance?: GeneratedImages["provenance"] }>(ctx, {
      provider: "imaging-router",
      model: "generate",
      payload: { prompt: gen.prompt, aspect: gen.aspect, count: gen.count, prefer: gen.prefer },
      estimate: req.estimates.idea,
      stand: () => ({ images: [{ base64: standIdea(k).toString("base64"), mime: "image/png" }] }),
      live: async () => {
        const out = await e.generate(gen);
        const p = out.provenance;
        const credits = studioCreditsOf(p);
        const unpriced = `${p.provider} bills studio credits, prepaid${credits === undefined ? "" : ` (${credits} for this artboard)`}`;
        return { value: { images: out.images, provenance: p }, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced } : { usd: p.costUsd }) };
      },
    });
  } catch (x) {
    if (!(x instanceof ImagingError) || x.kind === "over-budget") return imageFailure(x);
    fence(ctx);
    if (x.kind === "no-key") {
      // Signed out, not reachable, not configured: every idea not yet drawn would hear the same.
      const left = req.ideas.slice(k - 1).map((i) => i.candidateId);
      const night = await readNight(req.nightId);
      const open = left.filter((cid) => night.candidates.find(isIdea(cid))?.status !== "rendered");
      await writeIdeas(req, ctx.job.id, open, failed(x.message));
      return fatal("unavailable", x.message);
    }
    await writeIdeas(req, ctx.job.id, [c.id], failed(x.message));
    return madePaid(data({ idea: c.id, failed: x.message }), ctx);
  }

  const img = got.images[0];
  fence(ctx);
  if (img === undefined) {
    const why = "the imaging router answered with no image";
    await writeIdeas(req, ctx.job.id, [c.id], failed(why));
    return madePaid(data({ idea: c.id, failed: why }), ctx);
  }
  const rel = ideaFile(c.id, img.mime);
  const abs = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(img.base64, "base64"));
  await writeIdeas(req, ctx.job.id, [c.id], (x) => {
    const { error: _e, ...base } = x;
    return { ...base, status: "rendered", image: rel };
  });
  const p = got.provenance;
  return madePaid(data({ idea: c.id, file: rel, dry: p === undefined, ...(p === undefined ? {} : { provider: p.provider, model: p.model, ...(p.cleanup === undefined ? {} : { cleanup: p.cleanup }) }) }), ctx);
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/** A failed job's sentence on every idea of its request that is still pending and still this job's. */
async function ended(req: IdeasRequest, job: Job, ending: string): Promise<void> {
  if (ending !== "failed") return;
  const why = job.error?.message ?? `job ${job.id} failed`;
  const night = await readNight(req.nightId);
  const open = req.ideas
    .map((i) => night.candidates.find(isIdea(i.candidateId)))
    .filter((c): c is IdeaCandidate => c !== undefined && c.status === "pending" && (c.jobId === undefined || c.jobId === job.id))
    .map((c) => c.id);
  if (open.length > 0) await writeIdeas(req, job.id, open, failed(why));
}

export function ideaActs(e: IdeaEngines): Pick<IdeasPorts, "idea" | "ended"> {
  return {
    idea: async (req, k, ctx) => {
      try {
        return await ideaAct(e, req, k, ctx);
      } catch (x) {
        return imageFailure(x);
      }
    },
    ended,
  };
}
