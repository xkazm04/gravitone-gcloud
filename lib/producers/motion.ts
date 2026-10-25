import { readFile } from "node:fs/promises";

import type { BlobRef } from "@gt/domain/blob";
import type { FrameClip } from "@/lib/frames/frames";
import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { defineMotion, motionPlan, type MotionView } from "@gt/producers/motion/define";
import { meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit, type UnitPrice } from "@gt/producers/research/partAct";
import { landPart, partSnapshot, projectOf } from "@gt/producers/research/partJob";

import { directMotion, READ_INSTRUCTION, type MotionOutcome } from "@/lib/motion/direction";
import { AD_NATIVE_ASPECT } from "@/lib/ads/types";
import type { PictureUnit } from "@/lib/frames/picture/unit";
import { ImagingError } from "@/lib/imaging/errors";
import type { ImageRef, Recognition, RecognizeRequest } from "@/lib/imaging/types";
import { readClip, startClip } from "@/lib/imaging/video/clips";
import { clipPath } from "@/lib/imaging/video/store";

import { adsShotsFor, imageFailure, LIVE_IMAGING, pickedScenario, unitsOf, type ImagingEngines } from "./frames.ts";
import { adTemplateOf, asData, field, jobBlobRoot, must, partFacts, priceOf, recOf, text, written, type DriveHooks, type PartFacts, type UnitsFn, withRecords, preflightFrom } from "./research.ts";

// THE MOTION PRODUCER, BOUND (Phase 4 wave C, L37) - packages/producers/src/motion's ports over
// v1's engines: the two recognize passes of app/_phases/motion/direction.ts `directMotion` (READ,
// PROPOSE and the code-side filter, called as written - only its `recognize` is the job's,
// metered per pass), and a clip renderer per the part's option: Leonardo image-to-video through
// lib/imaging/video/clips.ts (`startClip`, its own pre-gate hold and record kept), or Wan i2v on
// the GPU, which no app path renders from a plate yet (pipeline/video/render_preset_clips.py
// renders presets only) - so a Wan job runs dry end to end and a LIVE one refuses with that
// sentence instead of pretending.
//
// What changed from v1 (INVENTORY §4): direct was a plain fetch carrying the plate as base64 with
// no price; here the plate is read from the blob store by its content address, the two passes are
// priced on the receipt, a decline lands as the work's sentence on its unit, and a clip exists at
// all (v1 standard motion had no clip generation; `FrameClip.status` was always "not-started").
// The picture clip lands with v1's own status word, "rendered" (lib/studio/projectTypes.ts).

/** The clip a renderer made: its bytes and what the vendor reported. */
export type RenderedClip = { readonly bytes: Uint8Array; readonly mime: string; readonly costUsd?: number; readonly model: string };
export type ClipRequest = { readonly projectId: string; readonly image: ImageRef; readonly motion: string; readonly aspect: "16:9" | "9:16" };

export type MotionEngines = ImagingEngines & {
  /** Leonardo image-to-video (hailuo-03, 5 s), awaited to its terminal state. */
  readonly leonardoClip: (req: ClipRequest) => Promise<RenderedClip>;
};

/** v1's clip pipeline, awaited: start (its pre-gate hold, its record), wait, read the mp4. */
async function leonardoClip(req: ClipRequest): Promise<RenderedClip> {
  const mime = req.image.mime;
  const started = await startClip({ projectId: req.projectId, image: req.image.base64, mime, motion: req.motion, durationS: 5, aspect: req.aspect, model: "hailuo-03" });
  const rec = await started.done;
  if (rec.status !== "done") throw new ImagingError(rec.error ?? `the clip ended ${rec.status}`, rec.status === "refused" ? "refused" : "failed");
  const final = (await readClip(started.clipId)) ?? rec;
  return { bytes: new Uint8Array(await readFile(clipPath(started.clipId))), mime: "video/mp4", model: final.model, ...(typeof final.costUsd === "number" ? { costUsd: final.costUsd } : {}) };
}

export const LIVE_MOTION: MotionEngines = { ...LIVE_IMAGING, leonardoClip };

/** A recognize pass is priced after the call (the router books it; ollama is local and free). */
const READ_PRICE: UnitPrice = { seconds: 40, usd: null, unpricedReason: "two recognize passes, priced after the call by the imaging router", credit: "two recognize passes, priced after the call by the imaging router (a local rung bills nothing)" };
const WAN_LIVE = "no app path renders a Wan i2v clip from a plate yet (pipeline/video/render_preset_clips.py renders presets only)";
/** A few bytes the dry clip stands on: obviously not a video anyone bought. */
const DRY_CLIP = new TextEncoder().encode("dry-run clip stand-in");

/** The dry answers of the two passes: one separable element, one move - shaped for directMotion. */
function standRecognition(req: RecognizeRequest): Recognition {
  const json =
    req.instruction === READ_INSTRUCTION
      ? { scene: "a quiet plate of soft shapes", elements: [{ name: "the drifting shape", where: "centre", separable: true }], grounded: true }
      : { prompt: "The drifting shape eases slowly to the right while the ground holds still.", moves: [{ element: "the drifting shape", verb: "eases right" }], holds_still: ["the ground"] };
  return written<Recognition>({ text: JSON.stringify(json), json, provenance: { provider: "dry", model: "dry stand-in", modelBasis: "requested", durationMs: 0, costBasis: "unpriced" } });
}

function motionView(s: PartSnapshot, f: PartFacts): MotionView {
  if (f.discipline === "ads") {
    const sc = pickedScenario(s);
    const shots = sc === undefined ? {} : adsShotsFor(s, sc.id);
    return {
      face: "ads",
      units: [],
      shots: (sc?.shots ?? []).map((x) => {
        const rec = shots[x.id];
        const clips = Array.isArray(rec?.["clips"]) ? written<{ id: string; status?: string }[]>(rec["clips"]) : [];
        return { id: x.id, adopted: text(rec?.["adoptedImage"]) !== undefined, clipDone: clips.some((c) => c.status === undefined || c.status === "done") };
      }),
    };
  }
  const dir = written<Record<string, { plate?: string }>>(field(recOf(s, "motion-direction")["byFrame"]) ?? {});
  return {
    face: "picture",
    units: (unitsOf(s)?.units ?? []).map((u) => ({ id: u.id, plated: u.plate.state === "ready" && blobOf(u.plate) !== undefined, motion: u.clip.motion.trim() !== "", directed: blobOf(u.plate) !== undefined && dir[u.id]?.plate === blobOf(u.plate)?.sha256, clipDone: u.clip.status === "rendered" })),
    shots: [],
  };
}

// A plate's signature is its blob digest (lib/parts/verdict.ts `plateSigOf`, which is server-only;
// the worker binds this module): a re-drawn plate makes an old direction outcome stale.
/** A plate's blob ref: the record's (frames v3 holds it beside v1's Plate fields). */
const blobOf = (plate: object): BlobRef | undefined => {
  const b = field(written<Record<string, unknown>>(plate)["blob"]);
  return b === undefined ? undefined : written<BlobRef>(b);
};

function motionUnitsOf(s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act" | "target">): Result<ActPlan> {
  return motionPlan(motionView(s, f), { act: ask.act, ...(ask.target === undefined ? {} : { target: ask.target }) }, { read: READ_PRICE, clip: priceOf(f.option) });
}

/** A motion act's units, for its receipt and its job's plan step (one function). */
export const motionUnits: UnitsFn = withRecords(motionUnitsOf);

async function imageOf(blobs: BlobStore, ref: BlobRef): Promise<ImageRef> {
  const bytes = must(await blobs.read(ref));
  const mime = ref.mime === "image/jpeg" || ref.mime === "image/webp" ? ref.mime : "image/png";
  return { base64: Buffer.from(bytes).toString("base64"), mime };
}

async function directUnit(ctx: StepContext, unit: ActUnit, u: PictureUnit, eng: MotionEngines, blobs: BlobStore): Promise<StepOutcome> {
  const blob = blobOf(u.plate);
  if (blob === undefined) return { kind: "fatal", code: "refused", message: `${u.id} has no plate to direct` };
  const image = await imageOf(blobs, blob);
  let paid = false;
  // Each pass is its own declared call: a dry job books two would-calls, a live one two rows.
  const recognize = (req: RecognizeRequest): Promise<Recognition> => {
    paid = paid || ctx.job.mode.kind === "live";
    return meteredCall(ctx, {
      provider: "imaging-router",
      model: "recognize",
      payload: { instruction: req.instruction },
      estimate: unit.estimate,
      stand: () => standRecognition(req),
      live: async () => {
        const r = await eng.recognize(req);
        return { value: r, ...(r.provenance.costUsd === undefined ? { unpriced: `${r.provenance.provider} reported no cost for a recognize pass` } : { usd: r.provenance.costUsd }) };
      },
    });
  };
  const outcome: MotionOutcome = await directMotion(image, recognize, {}, Date.now());
  const out = asData({ unitId: u.id, outcome, plate: blob.sha256 });
  return paid ? madePaid(out, ctx) : madeFree(out);
}

async function clipUnit(ctx: StepContext, unit: ActUnit, req: ClipRequest, extra: Readonly<Record<string, unknown>>, eng: MotionEngines): Promise<StepOutcome> {
  const wan = ctx.job.lane === "gpu.local";
  if (wan && ctx.job.mode.kind === "live") return { kind: "fatal", code: "unavailable", message: WAN_LIVE };
  const clip = await meteredCall(ctx, {
    provider: wan ? "wan" : "leonardo",
    model: wan ? "wan2.2-ti2v-5B" : "hailuo-03",
    payload: { motion: req.motion, aspect: req.aspect, durationS: 5 },
    estimate: unit.estimate,
    stand: (): RenderedClip => ({ bytes: DRY_CLIP, mime: "video/mp4", model: "dry stand-in" }),
    live: async () => {
      const c = await eng.leonardoClip(req);
      return { value: c, ...(c.costUsd === undefined ? { unpriced: "the clip vendor reported no cost" } : { usd: c.costUsd }) };
    },
  });
  const blob = must(await ctx.fx.blob(clip.bytes, clip.mime));
  const out = asData({ ...extra, blob, model: clip.model, motion: req.motion, ...(clip.costUsd === undefined ? {} : { costUsd: clip.costUsd }) });
  return clip.model === "dry stand-in" ? madeFree(out) : madePaid(out, ctx);
}

async function performMotion(ctx: StepContext, unit: ActUnit, eng: MotionEngines, blobs: BlobStore): Promise<StepOutcome> {
  const s = must(partSnapshot(ctx));
  const shotId = text(unit.input["shotId"]);
  if (shotId !== undefined) {
    const f = must(partFacts(ctx));
    const sc = pickedScenario(s);
    const spec = sc?.shots.find((x) => x.id === shotId);
    const take = sc === undefined ? undefined : text(adsShotsFor(s, sc.id)[shotId]?.["adoptedImage"]);
    if (spec === undefined || take === undefined) return { kind: "fatal", code: "refused", message: `${shotId} has no adopted take to animate` };
    const image = await imageOf(blobs, { sha256: take, bytes: 0, mime: "image/png" });
    return clipUnit(ctx, unit, { projectId: projectOf(ctx.job), image, motion: spec.motion, aspect: AD_NATIVE_ASPECT[adTemplateOf(f.plan.project.recipe)] === "9:16" ? "9:16" : "16:9" }, { shotId }, eng);
  }
  const u = unitsOf(s)?.units.find((x) => x.id === unit.input["unitId"]);
  if (u === undefined) return { kind: "fatal", code: "refused", message: `no unit ${String(unit.input["unitId"])}` };
  if (unit.name.startsWith("direct:")) return directUnit(ctx, unit, u, eng, blobs);
  const plate = blobOf(u.plate);
  if (plate === undefined) return { kind: "fatal", code: "refused", message: `${u.id} has no plate to animate` };
  return clipUnit(ctx, unit, { projectId: projectOf(ctx.job), image: await imageOf(blobs, plate), motion: u.clip.motion, aspect: "16:9" }, { unitId: u.id }, eng);
}

function landMotion(plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot): Result<Record<string, unknown>> {
  if (plan.act === "direct-motion") {
    const md = recOf(s, "motion-direction");
    const by = { ...written<Record<string, unknown>>(field(md["byFrame"]) ?? {}) };
    for (const m of made.values()) {
      const id = text(m["unitId"]);
      if (id !== undefined) by[id] = { outcome: m["outcome"], plate: m["plate"] };
    }
    return ok({ "motion-direction": { ...md, byFrame: by } });
  }
  const sc = pickedScenario(s);
  const ads = [...made.values()].some((m) => text(m["shotId"]) !== undefined);
  if (ads) {
    if (sc === undefined) return err("refused", "clips need a picked scenario");
    const shots = { ...adsShotsFor(s, sc.id) };
    for (const m of made.values()) {
      const id = text(m["shotId"]);
      const blob = field(m["blob"]);
      if (id === undefined || blob === undefined) continue;
      const prior = shots[id] ?? {};
      const clips = Array.isArray(prior["clips"]) ? written<Record<string, unknown>[]>(prior["clips"]) : [];
      const clip = { id: String(blob["sha256"]), status: "done", blob, model: m["model"] };
      // v1 AdsMotion: the first finished clip is adopted; another is the operator's pick.
      shots[id] = { ...prior, imageTakes: prior["imageTakes"] ?? [], adoptedImage: prior["adoptedImage"] ?? null, clips: [...clips, clip], adoptedClip: text(prior["adoptedClip"]) ?? clip.id };
    }
    return ok({ "ads-shots": { scenarioId: sc.id, shots } });
  }
  const u = unitsOf(s);
  if (u === null) return err("refused", "no picture units");
  const byUnit = new Map([...made.values()].map((m) => [text(m["unitId"]) ?? "", m]));
  const units = u.units.map((x) => {
    const m = byUnit.get(x.id);
    if (m === undefined) return x;
    const clip: FrameClip = { ...x.clip, status: "rendered", blob: written<BlobRef>(m["blob"]), model: text(m["model"]) };
    return { ...x, clip };
  });
  // Motion GROWS the frames record (v1's Motion wrote clip fields into it; @gt/domain/steps GROWS).
  return ok({ frames: { ...recOf(s, "frames"), units: asData({ u: units })["u"], renderId: u.renderId } });
}

export function motionProducer(lane: ResourceLane = "gpu.local", hooks: DriveHooks = {}, engines: MotionEngines = LIVE_MOTION, blobs?: BlobStore): Producer {
  // The job's own store's blobs (research.ts `jobBlobRoot`), unless a test hands its own.
  const store = (ctx: StepContext): BlobStore => blobs ?? blobStore(jobBlobRoot(ctx));
  return defineMotion(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(motionUnits),
    async plan(_job, ask, ctx) {
      const s = partSnapshot(ctx);
      if (!s.ok) return s;
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return motionUnitsOf(s.value, f.value, ask);
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        return await performMotion(ctx, unit, engines, store(ctx));
      } catch (e) {
        // A refused clip or read is the vendor's sentence on this unit's job, not a retry.
        if (e instanceof ImagingError && e.kind === "refused") return { kind: "fatal", code: "refused", message: e.message };
        return imageFailure(e);
      }
    },
    async land(_job, plan, made, ctx) {
      return landPart(ctx, plan.act, (s) => landMotion(plan, made, s));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
