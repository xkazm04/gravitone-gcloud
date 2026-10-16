import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { capBatch, defineFrames, framesPlan, type FramesView } from "@gt/producers/frames/define";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit, type UnitPrice } from "@gt/producers/research/partAct";
import { landPart, partSnapshot } from "@gt/producers/research/partJob";

import { PRESETS } from "@gt/catalog/presets";
import { AD_NATIVE_ASPECT, type AdScenario } from "@/lib/ads/types";
import { addDirectionSpend } from "@/lib/frames/direction";
import { planFromSpecs } from "@/lib/frames/directionPlan";
import { landDirection } from "@/lib/frames/direction";
import { explainerRender, subjectFor, type Frame, type Plate } from "@/lib/frames/frames";
import { frameOfUnit, framesFromUnits, unitsFromRender, type PictureUnit } from "@/lib/frames/picture/unit";
import { SCENE_SCHEMA } from "@/lib/frames/sceneSpec";
import { budgetQuote, earliestExpiry } from "@/lib/imaging/budgetForecast";
import { ImagingError } from "@/lib/imaging/errors";
import { generate, recognize } from "@/lib/imaging/router";
import type { GenerateRequest, GeneratedImages, ImageRef } from "@/lib/imaging/types";
import type { Fact } from "@/lib/notebook/types";
import type { ScriptRender } from "@/lib/script/types";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";
import { reason } from "@/lib/text/router";
import type { TextRequest } from "@/lib/text/types";
import { FRAMES_SPEC, type FramesResult } from "@/lib/turns/kinds/frames";

import { activeSourceOf, adTemplateOf, asData, engineView, field, meteredText, must, partFacts, priceOf, recOf, TEXT_SEAT, text, textFailure, written, type DriveHooks, type PartFacts, type UnitsFn, withRecords, preflightFrom } from "./research.ts";

// THE FRAMES PRODUCER, BOUND (Phase 4 wave C, L37) - packages/producers/src/frames's ports over
// v1's engines: the imaging router (`generate`: a plate, an alternative, an ads take), the
// scene-direction turn (lib/turns/kinds/frames.ts) and its landing (lib/frames/direction.ts
// `landDirection`: spend counted before the parse, every per-beat rejection kept as the work's
// sentence) turned into a PROPOSAL (app/_phases/frames/direction/plan.ts `planFromSpecs`, which v1
// wrote and never wired). Also THE IMAGING GLUE the motion and still bindings share.
//
// What changed from v1 (INVENTORY §3): plates are BLOBS (v1 kept base64 data: URLs, twice, ~5 MB
// a cut); a single plate and an alternative are priced on the receipt (v1 showed neither); the
// batch's budget cap is read at the job's plan step (v1 renderPlan.ts over /api/imaging/budget)
// and a 402 mid-batch stops the job for money with the window's resume time - nothing rendered is
// lost, and a retry after the window renders only what is still missing (v1 paused a browser loop
// that a reload forgot). KEPT v1 GAP, said: the project's style theme lives in IndexedDB (lib/
// themes), which a server job cannot read, so plates are drawn in the fallback preset
// (`PRESETS[0]`, exactly useFrames' fallback) and no reference images ride along.

/* ── the imaging glue (motion and still use it too) ───────────────────────── */

export type ImagingEngines = { readonly generate: (req: GenerateRequest) => Promise<GeneratedImages>; readonly recognize: typeof recognize };
export const LIVE_IMAGING: ImagingEngines = { generate, recognize };

/** A 1x1 PNG: a valid picture that is obviously not one anyone bought (lib/sound/mv/standIns.ts). */
export const PIXEL: ImageRef = { base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", mime: "image/png" };

/** The style a server job can read: the fallback preset (themes live in the browser). */
export function fallbackBlock(): (typeof PRESETS)[number]["block"] {
  const first = PRESETS[0];
  if (first === undefined) throw new Error("the style catalog holds no preset");
  return first.block;
}

/** One image call through the meter. Dry: the pixel stand-in, `provenance` undefined. */
export function meteredImages(ctx: StepContext, unit: ActUnit, req: GenerateRequest, eng: ImagingEngines): Promise<{ images: ImageRef[]; provenance?: GeneratedImages["provenance"] }> {
  return meteredCall(ctx, {
    provider: "imaging-router",
    model: "generate",
    payload: { prompt: req.prompt, negativePrompt: req.negativePrompt ?? null, aspect: req.aspect, count: req.count ?? 1 },
    estimate: unit.estimate,
    stand: () => ({ images: Array.from({ length: req.count ?? 1 }, () => PIXEL) }),
    live: async () => {
      const out = await eng.generate(req);
      const p = out.provenance;
      return { value: { images: out.images, provenance: p }, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the image` } : { usd: p.costUsd }) };
    },
  });
}

/** The imaging failure, classed (v1 renderPlan `afterOutcome`): over budget is a money stop that
 *  names when the window frees (v1's "pause until retryAt"); a vendor that may answer next time
 *  feeds the breaker; a missing key or an unusable request is the job's sentence. A refusal is
 *  not here - the caller lands it on the unit (v1: "continue on a single refusal"). */
export function imageFailure(e: unknown, resumeAt?: () => number): StepOutcome {
  if (e instanceof ImagingError && e.kind === "over-budget") return { kind: "money-stop", message: resumeAt === undefined ? e.message : `${e.message} Resumes ${new Date(resumeAt()).toISOString()}.` };
  return failureOf(e, (x) => {
    if (!(x instanceof ImagingError)) return undefined;
    return x.kind === "rate-limited" || x.kind === "timeout" || x.kind === "failed" || x.kind === "bad-response" ? "retry" : "fatal";
  });
}

/** The pixels into the blob store; the record keeps only the ref. */
export async function putImage(ctx: StepContext, img: ImageRef): Promise<BlobRef> {
  return must(await ctx.fx.blob(new Uint8Array(Buffer.from(img.base64, "base64")), img.mime));
}

/* ── frames ───────────────────────────────────────────────────────────────── */

const DRY = { provider: "dry", model: "stand-in" };
/** A direction turn bills the text seat or a reported cost after it - never priced before. */
const TURN_PRICE: UnitPrice = { seconds: 60, usd: null, unpricedReason: TEXT_SEAT, credit: TEXT_SEAT };

/** The adopted explainer candidate, when the script part has one. */
function adoptedOf(s: PartSnapshot): ScriptRender | undefined {
  const id = text(recOf(s, "script-adopted")["renderId"]);
  const cands = recOf(s, "script-versions")["candidates"];
  return id === undefined || !Array.isArray(cands) ? undefined : written<ScriptRender[]>(cands).find((c) => c.id === id);
}

/** The picture units: the record's, else derived from the adopted explainer chain (v1 useFrames
 *  derived them on load; the trailer lane's shots come from its own record). */
export function unitsOf(s: PartSnapshot): { units: PictureUnit[]; renderId: string } | null {
  const rec = s.records.get("frames");
  if (rec !== undefined && Array.isArray(rec["units"])) return { units: written<PictureUnit[]>(rec["units"]), renderId: text(rec["renderId"]) ?? "" };
  const adopted = adoptedOf(s);
  return adopted === undefined ? null : { units: unitsFromRender(explainerRender(adopted), adopted), renderId: adopted.id };
}

const isStale = (p: Plate): boolean => p.state === "ready" && p.renderedSubject !== undefined && p.subject !== undefined && p.subject.trim() !== p.renderedSubject.trim();

export function pickedScenario(s: PartSnapshot): AdScenario | undefined {
  const sc = recOf(s, "ads-scenarios");
  const id = text(sc["pickedId"]);
  return Array.isArray(sc["options"]) ? written<AdScenario[]>(sc["options"]).find((o) => o.id === id) : undefined;
}

/** The ads per-shot record, if made for `scenarioId` (a record for another scenario is stale). */
export function adsShotsFor(s: PartSnapshot, scenarioId: string): Record<string, Record<string, unknown>> {
  const r = recOf(s, "ads-shots");
  return r["scenarioId"] === scenarioId ? written<Record<string, Record<string, unknown>>>(field(r["shots"]) ?? {}) : {};
}

export function framesView(s: PartSnapshot, f: PartFacts): FramesView {
  if (f.discipline === "ads") {
    const sc = pickedScenario(s);
    const shots = sc === undefined ? {} : adsShotsFor(s, sc.id);
    return { face: "ads", units: [], shots: (sc?.shots ?? []).map((x) => ({ id: x.id, takes: Array.isArray(shots[x.id]?.["imageTakes"]) ? (shots[x.id]?.["imageTakes"] as unknown[]).length : 0 })) };
  }
  const u = unitsOf(s);
  return { face: "picture", units: (u?.units ?? []).map((x) => ({ id: x.id, plate: x.plate.state, stale: isStale(x.plate) })), shots: [] };
}

function framesUnitsOf(s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act" | "target">): Result<ActPlan> {
  return framesPlan(framesView(s, f), { act: ask.act, ...(ask.target === undefined ? {} : { target: ask.target }) }, { image: priceOf(f.option), turn: TURN_PRICE });
}

/** A frames act's units, for its receipt and its job's plan step (one function). */
export const framesUnits: UnitsFn = withRecords(framesUnitsOf);

const factsOf = (s: PartSnapshot): Fact[] => activeSourceOf(s)?.notebook.facts ?? [];

/** The body v1's Frames sent /api/frames (useFrames `directionInput`). */
function directionInput(s: PartSnapshot, f: PartFacts, frames: Frame[]) {
  return {
    title: f.plan.project.title,
    schema: SCENE_SCHEMA,
    style: fallbackBlock(),
    template: f.plan.project.recipe.split("/")[1],
    targetS: f.targetS,
    facts: factsOf(s).map((x) => ({ id: x.id, claim: x.claim, confidence: x.confidence, loadBearing: x.loadBearing })),
    beats: frames.map((x) => ({ at: x.at, kind: x.kind, label: x.title, text: x.line, ...(x.device === undefined ? {} : { device: x.device }) })),
  };
}

/** The dry direction answer: one scene per beat that passes reviewSceneSpecs' rules. */
const dryScenes = (frames: Frame[]): string =>
  JSON.stringify({ scenes: frames.map((x) => ({ beatAt: x.at, subject: "a wide quiet plate of soft shapes in even light, nothing in focus", motion: "a slow drift of the shapes toward the right edge", rationale: "dry run: no model was asked", elements: [], texts: [] })) });

async function directionUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts): Promise<StepOutcome> {
  const u = unitsOf(s);
  if (u === null) return { kind: "fatal", code: "refused", message: "direct the cut needs picture units" };
  const frames = framesFromUnits(u.units);
  const prep = await FRAMES_SPEC.prepare(directionInput(s, f, frames));
  const req: TextRequest = { prompt: prep.prompt, turn: "scene-direction" };
  const out = await meteredText<FramesResult | null>(ctx, unit, req, () => null, async () => {
    const served = await reason(req);
    return { value: await FRAMES_SPEC.settle(served, prep.input), provenance: served.provenance };
  });
  if (out === null) return madeFree(asData({ raw: dryScenes(frames), engine: engineView(ctx.job, undefined, DRY), bill: {} }));
  return madePaid(asData({ raw: out.raw, engine: { provider: out.engine.provider, model: out.engine.model, usd: out.engine.costUsd ?? null, seconds: (out.engine.durationMs ?? 0) / 1000, mode: ctx.job.mode.kind }, bill: { costUsd: out.engine.costUsd, durationMs: out.engine.durationMs } }), ctx);
}

/** One plate, alternative or take: the image, its blob, or the vendor's refusal on the unit. */
async function imageUnit(ctx: StepContext, unit: ActUnit, req: GenerateRequest, eng: ImagingEngines, extra: Readonly<Record<string, unknown>>): Promise<StepOutcome> {
  try {
    const got = await meteredImages(ctx, unit, req, eng);
    const img = got.images[0];
    if (img === undefined) return { kind: "vendor-failure", message: "the imaging router answered with no image" };
    const blob = await putImage(ctx, img);
    const p = got.provenance;
    const out = asData({ ...extra, state: "ready", blob, ...(p === undefined ? { model: "dry stand-in" } : { model: p.model, ...(p.costUsd === undefined ? {} : { costUsd: p.costUsd }) }) });
    return p === undefined ? madeFree(out) : madePaid(out, ctx);
  } catch (e) {
    // A single refusal lands on its unit and the batch goes on (v1 renderPlan `continue`).
    if (e instanceof ImagingError && e.kind === "refused") return madeFree(asData({ ...extra, state: "refused", note: e.message }));
    return imageFailure(e, () => earliestExpiry());
  }
}

function plateRequest(u: PictureUnit): { req: GenerateRequest; subject: string } {
  const subject = u.plate.subject?.trim() || subjectFor(frameOfUnit(u));
  return { subject, req: { prompt: compilePrompt(fallbackBlock(), subject), negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 } };
}

async function performFrames(ctx: StepContext, unit: ActUnit, eng: ImagingEngines): Promise<StepOutcome> {
  const s = must(partSnapshot(ctx));
  if (unit.name === "direction") return directionUnit(ctx, unit, s, must(partFacts(ctx)));
  if (unit.name.startsWith("take:")) {
    const f = must(partFacts(ctx));
    const shot = pickedScenario(s)?.shots.find((x) => x.id === unit.input["shotId"]);
    if (shot === undefined) return { kind: "fatal", code: "refused", message: `shot ${String(unit.input["shotId"])} is not in the picked scenario` };
    return imageUnit(ctx, unit, { prompt: compilePrompt(fallbackBlock(), shot.image), negativePrompt: NEGATIVE_PROMPT, aspect: AD_NATIVE_ASPECT[adTemplateOf(f.plan.project.recipe)], count: 1 }, eng, { shotId: shot.id });
  }
  const u = unitsOf(s)?.units.find((x) => x.id === unit.input["unitId"]);
  if (u === undefined) return { kind: "fatal", code: "refused", message: `no unit ${String(unit.input["unitId"])}` };
  const { req, subject } = plateRequest(u);
  return imageUnit(ctx, unit, req, eng, { unitId: u.id, subject });
}

function landFrames(plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot, at: number): Result<Record<string, unknown>> {
  if (plan.act === "image-takes") {
    const sc = pickedScenario(s);
    if (sc === undefined) return err("refused", "image takes need a picked scenario");
    const shots = { ...adsShotsFor(s, sc.id) };
    for (const [, m] of made) {
      const id = text(m["shotId"]);
      const blob = field(m["blob"]);
      if (id === undefined || blob === undefined || m["state"] !== "ready") continue;
      const prior = shots[id] ?? {};
      const takes = Array.isArray(prior["imageTakes"]) ? written<string[]>(prior["imageTakes"]) : [];
      shots[id] = { ...prior, imageTakes: [...takes, String(blob["sha256"])], adoptedImage: prior["adoptedImage"] ?? null, clips: prior["clips"] ?? [], adoptedClip: prior["adoptedClip"] ?? null };
    }
    return ok({ "ads-shots": { scenarioId: sc.id, shots } });
  }
  const u = unitsOf(s);
  if (u === null) return err("refused", "no picture units");
  const rec = s.records.get("frames") ?? {};
  if (plan.act === "direct-cut") {
    const m = made.get("direction");
    if (m === undefined) return err("internal", "direct-cut: no answer booked");
    const frames = framesFromUnits(u.units);
    // The bill before the parse: a pass this app cannot use was still paid for.
    const direction = addDirectionSpend(written<Parameters<typeof addDirectionSpend>[0]>(field(rec["direction"]) ?? null), written<Parameters<typeof addDirectionSpend>[1]>(field(m["bill"]) ?? {}), at);
    try {
      const landing = landDirection(String(m["raw"] ?? ""), frames, factsOf(s));
      const rejected = Object.entries(landing.rejections).map(([beatAt, reason]) => ({ beatAt, reason }));
      return ok({ frames: { ...rec, units: u.units, renderId: u.renderId, direction, proposal: asData(planFromSpecs(frames, landing.specs, rejected, at)), ...(landing.notice === null ? {} : { notice: landing.notice }) } });
    } catch (e) {
      // The engine's answer could not be used at all: the spend lands, the sentence with it.
      return ok({ frames: { ...rec, units: u.units, renderId: u.renderId, direction, notice: `The engine returned direction this app cannot use: ${e instanceof Error ? e.message : String(e)} Nothing was changed.` } });
    }
  }
  if (plan.act === "render-alternative") {
    const m = [...made.values()][0];
    const unitId = text(m?.["unitId"]);
    if (m === undefined || unitId === undefined) return err("internal", "render-alternative: no answer booked");
    if (m["state"] !== "ready") return ok({});
    const alts = recOf(s, "frames-alts");
    const by = written<Record<string, { activeId?: string | null; alts: unknown[] }>>(field(alts["byFrame"]) ?? {});
    const col = by[unitId] ?? { activeId: null, alts: [] };
    const blob = written<BlobRef>(m["blob"]);
    const alt = { id: `alt-${unitId}-${blob.sha256.slice(0, 12)}`, plate: { state: "ready", blob, subject: m["subject"], renderedSubject: m["subject"], model: m["model"], ...(m["costUsd"] === undefined ? {} : { costUsd: m["costUsd"] }) }, createdAt: at };
    return ok({ "frames-alts": { ...alts, byFrame: { ...by, [unitId]: { ...col, alts: [...col.alts, alt] } } } });
  }
  // render-plates / render-plate: each booked unit onto its plate.
  const byUnit = new Map([...made.values()].map((m) => [text(m["unitId"]) ?? "", m]));
  const units = u.units.map((x): PictureUnit => {
    const m = byUnit.get(x.id);
    if (m === undefined) return x;
    if (m["state"] === "refused") return { ...x, plate: { ...x.plate, state: "refused", ...(text(m["note"]) === undefined ? {} : { note: text(m["note"]) }) } };
    const { src: _src, receipt: _receipt, note: _note, ...plate } = x.plate;
    return { ...x, plate: written<Plate>({ ...plate, state: "ready", blob: m["blob"], subject: m["subject"], renderedSubject: m["subject"], model: m["model"], ...(m["costUsd"] === undefined ? {} : { costUsd: m["costUsd"] }) }) };
  });
  return ok({ frames: { ...rec, units: asData({ u: units })["u"], renderId: u.renderId } });
}

export function framesProducer(lane: ResourceLane = "cloud.google", hooks: DriveHooks = {}, engines: ImagingEngines = LIVE_IMAGING): Producer {
  return defineFrames(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(framesUnits),
    async plan(_job, ask, ctx) {
      const s = partSnapshot(ctx);
      if (!s.ok) return s;
      const f = partFacts(ctx);
      if (!f.ok) return f;
      const plan = framesUnitsOf(s.value, f.value, ask);
      // The batch fits the imaging window (v1 renderPlan over /api/imaging/budget); a dry job
      // spends nothing and reads no window.
      if (!plan.ok || plan.value.act !== "render-plates" || ctx.job.mode.kind === "dry") return plan;
      const q = await budgetQuote({ images: plan.value.units.length });
      return capBatch(plan.value, { verdict: q.verdict, affordable: q.affordableImages, resumeAt: q.resumeAt });
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        return await performFrames(ctx, unit, engines);
      } catch (e) {
        return e instanceof ImagingError ? imageFailure(e, () => earliestExpiry()) : textFailure(e);
      }
    },
    async land(_job, plan, made, ctx) {
      return landPart(ctx, plan.act, (s) => landFrames(plan, made, s, Date.now()));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
