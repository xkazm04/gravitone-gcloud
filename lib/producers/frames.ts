import { recipeById } from "@gt/catalog/recipes";
import type { BlobRef } from "@gt/domain/blob";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import { scriptFaceOf } from "@gt/domain/partView";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { capBatch, defineFrames, framesPlan, type FramesView } from "@gt/producers/frames/define";
import { lookWords, type ProjectLook } from "@gt/producers/frames/look";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit, type UnitPrice } from "@gt/producers/research/partAct";
import { landPart, partSnapshot } from "@gt/producers/research/partJob";

import { AD_NATIVE_ASPECT, type AdScenario } from "@/lib/ads/types";
import { addDirectionSpend } from "@/lib/frames/direction";
import { planFromSpecs } from "@/lib/frames/directionPlan";
import { landDirection } from "@/lib/frames/direction";
import { explainerRender, subjectFor, type Frame, type Plate } from "@/lib/frames/frames";
import { frameOfUnit, framesFromUnits, trailerChain, unitsFromRender, type PictureUnit } from "@/lib/frames/picture/unit";
import { actionOfUnit } from "@/lib/frames/shotPrompt";
import { SCENE_SCHEMA } from "@/lib/frames/sceneSpec";
import { budgetQuote, earliestExpiry } from "@/lib/imaging/budgetForecast";
import { ImagingError } from "@/lib/imaging/errors";
import { generate, recognize } from "@/lib/imaging/router";
import type { GenerateRequest, GeneratedImages, ImageRef } from "@/lib/imaging/types";
import type { Fact } from "@/lib/notebook/types";
import type { ScriptRender } from "@/lib/script/types";
import type { TrailerCut } from "@/lib/script/trailer/types";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";
import type { TextRequest } from "@/lib/text/types";
import { FRAMES_SPEC, type FramesResult } from "@/lib/turns/kinds/frames";

import { activeSourceOf, adTemplateOf, asData, engineView, field, jobBlobRoot, meteredText, must, partFacts, priceOf, recOf, TEXT_SEAT, text, textFailure, written, enginesOf, type DriveHooks, type Engines, type PartFacts, type UnitsFn, withRecords, preflightFrom } from "./research.ts";

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
// that a reload forgot).
//
// THE PROJECT'S STYLE (Phase 5, L56). Phase 4 kept a v1 gap here: the theme lived in the
// browser's IndexedDB, so every plate was drawn in `PRESETS[0]` with no references and nothing
// said so. Now the project's binding resolves through the Style store (@gt/producers/frames/look,
// read with the part's facts): its block is compiled into every image prompt, restated in full
// each call (registry visual-style-locking / style-block-restated-every-call), and its approved
// proofs ride along as references (`styleRefs`: founding approvals pinned, newest rolling, four
// sent - v1 lib/themes.ts `styleRefs`, which the server could never call). A project with no
// usable style is drawn in a NAMED default and the receipt says which miss it covers. The
// receipt's line carries the look, and so does its token: a look that moved between the receipt
// and the confirm makes the confirm stale (hitl-approval / resume-after-decision).

/* ── the imaging glue (motion and still use it too) ───────────────────────── */

export type ImagingEngines = { readonly generate: (req: GenerateRequest) => Promise<GeneratedImages>; readonly recognize: typeof recognize };
export const LIVE_IMAGING: ImagingEngines = { generate, recognize };

/** A 1x1 PNG: a valid picture that is obviously not one anyone bought (lib/sound/mv/standIns.ts). */
export const PIXEL: ImageRef = { base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", mime: "image/png" };

/** One image call through the meter. Dry: the pixel stand-in, `provenance` undefined. `refs` are
 *  the references' blob refs, booked by digest (a would-call names what it would have sent). */
export function meteredImages(ctx: StepContext, unit: ActUnit, req: GenerateRequest, eng: ImagingEngines, refs: readonly BlobRef[] = []): Promise<{ images: ImageRef[]; provenance?: GeneratedImages["provenance"] }> {
  return meteredCall(ctx, {
    provider: "imaging-router",
    model: "generate",
    payload: { prompt: req.prompt, negativePrompt: req.negativePrompt ?? null, aspect: req.aspect, count: req.count ?? 1, ...(refs.length === 0 ? {} : { references: refs.map((r) => r.sha256) }) },
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

/** The look's references as the router takes them (bytes read once per call, from the blob store
 *  the proofs were landed in). A reference whose bytes are gone fails the unit loudly: drawing
 *  without it would be the silent stand-in this module exists to end. */
export async function lookImages(look: ProjectLook, blobs: () => BlobStore): Promise<ImageRef[]> {
  if (look.refs.length === 0) return [];
  const store = blobs();
  const out: ImageRef[] = [];
  for (const ref of look.refs) {
    const bytes = must(await store.read(ref));
    out.push({ base64: Buffer.from(bytes).toString("base64"), mime: ref.mime === "image/jpeg" || ref.mime === "image/webp" ? ref.mime : "image/png" });
  }
  return out;
}

/** The blobs of the store the job runs on (research.ts `jobBlobRoot`), opened only when a reference is actually read. */
export const jobBlobs = (ctx: StepContext): BlobStore => blobStore(jobBlobRoot(ctx));

/** What an image call is drawn under: the look's block in the prompt, its references attached. */
export type Drawn = { readonly look: ProjectLook; readonly images: readonly ImageRef[] };

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

const isTrailerFace = (s: PartSnapshot, f: PartFacts): boolean => scriptFaceOf(f.discipline, recOf(s, "research-beats")["mode"] === "facts" ? "notebook" : "beats") === "trailer";

/** A trailer's units: its composed spine's shots, by the same chain derivation the fixture port
 *  reads (lib/frames/picture/unit.ts `trailerChain`). null before a spine is composed. */
function trailerUnitsOf(s: PartSnapshot, f: PartFacts): { units: PictureUnit[]; renderId: string } | null {
  const cut = field(recOf(s, "script-trailer")["cut"]);
  if (cut === undefined) return null;
  const chain = trailerChain(written<TrailerCut>(cut), { template: recipeById(f.plan.project.recipe)?.template ?? "trailer", durationS: f.targetS ?? 120 });
  return { units: chain.units, renderId: chain.id };
}

/** The picture units: the record's, else derived from the chain Script adopted - a trailer's
 *  composed spine (its shots), or the adopted explainer candidate (v1 useFrames derived them on
 *  load). `f` is the project's facts; without it only the explainer chain can be derived. */
export function unitsOf(s: PartSnapshot, f?: PartFacts): { units: PictureUnit[]; renderId: string } | null {
  const rec = s.records.get("frames");
  if (rec !== undefined && Array.isArray(rec["units"])) return { units: written<PictureUnit[]>(rec["units"]), renderId: text(rec["renderId"]) ?? "" };
  if (f !== undefined && isTrailerFace(s, f)) return trailerUnitsOf(s, f);
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
  const u = unitsOf(s, f);
  return { face: "picture", units: (u?.units ?? []).map((x) => ({ id: x.id, plate: x.plate.state, stale: isStale(x.plate) })), shots: [] };
}

function framesUnitsOf(s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act" | "target">): Result<ActPlan> {
  // The direction pass reads BEAT units; a trailer's shot units (derived by `unitsOf`) are not its input.
  if (ask.act === "direct-cut" && f.discipline !== "ads" && !(unitsOf(s, f)?.units ?? []).some((x) => x.kind === "beat")) return err("refused", "direct the cut needs picture units");
  const plan = framesPlan(framesView(s, f), { act: ask.act, ...(ask.target === undefined ? {} : { target: ask.target }) }, { image: priceOf(f.option), turn: TURN_PRICE });
  // Every frames act is drawn (or directed) under the project's look: the receipt names it.
  return plan.ok ? ok({ ...plan.value, about: lookWords(f.look) }) : plan;
}

/** A frames act's units, for its receipt and its job's plan step (one function). */
export const framesUnits: UnitsFn = withRecords(framesUnitsOf);

const factsOf = (s: PartSnapshot): Fact[] => activeSourceOf(s)?.notebook.facts ?? [];

/** The body v1's Frames sent /api/frames (useFrames `directionInput`). */
function directionInput(s: PartSnapshot, f: PartFacts, frames: Frame[]) {
  return {
    title: f.plan.project.title,
    schema: SCENE_SCHEMA,
    style: f.look.block,
    template: f.plan.project.recipe.split("/")[1],
    targetS: f.targetS,
    facts: factsOf(s).map((x) => ({ id: x.id, claim: x.claim, confidence: x.confidence, loadBearing: x.loadBearing })),
    beats: frames.map((x) => ({ at: x.at, kind: x.kind, label: x.title, text: x.line, ...(x.device === undefined ? {} : { device: x.device }) })),
  };
}

/** The dry direction answer: one scene per beat that passes reviewSceneSpecs' rules. */
const dryScenes = (frames: Frame[]): string =>
  JSON.stringify({ scenes: frames.map((x) => ({ beatAt: x.at, subject: "a wide quiet plate of soft shapes in even light, nothing in focus", motion: "a slow drift of the shapes toward the right edge", rationale: "dry run: no model was asked", elements: [], texts: [] })) });

async function directionUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, engine: Engines): Promise<StepOutcome> {
  const u = unitsOf(s);
  if (u === null) return { kind: "fatal", code: "refused", message: "direct the cut needs picture units" };
  const frames = framesFromUnits(u.units);
  const prep = await FRAMES_SPEC.prepare(directionInput(s, f, frames));
  const req: TextRequest = { prompt: prep.prompt, turn: "scene-direction" };
  const out = await meteredText<FramesResult | null>(ctx, unit, req, () => null, async () => {
    const served = await engine.reason(req);
    return { value: await FRAMES_SPEC.settle(served, prep.input), provenance: served.provenance };
  });
  if (out === null) return madeFree(asData({ raw: dryScenes(frames), engine: engineView(ctx.job, undefined, DRY), bill: {} }));
  return madePaid(asData({ raw: out.raw, engine: { provider: out.engine.provider, model: out.engine.model, usd: out.engine.costUsd ?? null, seconds: (out.engine.durationMs ?? 0) / 1000, mode: ctx.job.mode.kind }, bill: { costUsd: out.engine.costUsd, durationMs: out.engine.durationMs } }), ctx);
}

/** One plate, alternative or take: the image, its blob, or the vendor's refusal on the unit. The
 *  booked output names the look it was drawn under (style id, block digest, references sent). */
async function imageUnit(ctx: StepContext, unit: ActUnit, req: GenerateRequest, eng: ImagingEngines, drawn: Drawn, extra: Readonly<Record<string, unknown>>): Promise<StepOutcome> {
  try {
    const got = await meteredImages(ctx, unit, { ...req, ...(drawn.images.length === 0 ? {} : { references: [...drawn.images] }) }, eng, drawn.look.refs);
    const img = got.images[0];
    if (img === undefined) return { kind: "vendor-failure", message: "the imaging router answered with no image" };
    const blob = await putImage(ctx, img);
    const p = got.provenance;
    const look = { ...(drawn.look.style === undefined ? {} : { styleId: drawn.look.style.id }), digest: drawn.look.digest, refs: drawn.look.refs.length, ...(drawn.look.miss === undefined ? {} : { miss: drawn.look.miss }) };
    const out = asData({ ...extra, state: "ready", blob, look, ...(p === undefined ? { model: "dry stand-in" } : { model: p.model, ...(p.costUsd === undefined ? {} : { costUsd: p.costUsd }) }) });
    return p === undefined ? madeFree(out) : madePaid(out, ctx);
  } catch (e) {
    // A single refusal lands on its unit and the batch goes on (v1 renderPlan `continue`).
    if (e instanceof ImagingError && e.kind === "refused") return madeFree(asData({ ...extra, state: "refused", note: e.message }));
    return imageFailure(e, () => earliestExpiry());
  }
}

function plateRequest(u: PictureUnit, look: ProjectLook): { req: GenerateRequest; subject: string } {
  const subject = u.plate.subject?.trim() || actionOfUnit(u) || subjectFor(frameOfUnit(u));
  return { subject, req: { prompt: compilePrompt(look.block, subject), negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 } };
}

async function performFrames(ctx: StepContext, unit: ActUnit, eng: ImagingEngines, blobs: (ctx: StepContext) => BlobStore, turns: Engines): Promise<StepOutcome> {
  const s = must(partSnapshot(ctx));
  // The look is read at the unit, from the store as it is now: a lock is frozen, so a locked
  // style draws exactly what the receipt named; an unlocked one draws its current block.
  const f = must(partFacts(ctx));
  if (unit.name === "direction") return directionUnit(ctx, unit, s, f, turns);
  const drawn: Drawn = { look: f.look, images: await lookImages(f.look, () => blobs(ctx)) };
  if (unit.name.startsWith("take:")) {
    const shot = pickedScenario(s)?.shots.find((x) => x.id === unit.input["shotId"]);
    if (shot === undefined) return { kind: "fatal", code: "refused", message: `shot ${String(unit.input["shotId"])} is not in the picked scenario` };
    return imageUnit(ctx, unit, { prompt: compilePrompt(f.look.block, shot.image), negativePrompt: NEGATIVE_PROMPT, aspect: AD_NATIVE_ASPECT[adTemplateOf(f.plan.project.recipe)], count: 1 }, eng, drawn, { shotId: shot.id });
  }
  const u = unitsOf(s, f)?.units.find((x) => x.id === unit.input["unitId"]);
  if (u === undefined) return { kind: "fatal", code: "refused", message: `no unit ${String(unit.input["unitId"])}` };
  const { req, subject } = plateRequest(u, f.look);
  return imageUnit(ctx, unit, req, eng, drawn, { unitId: u.id, subject });
}

function landFrames(plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot, at: number, f?: PartFacts): Result<Record<string, unknown>> {
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
  const u = unitsOf(s, f);
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
      return ok({ frames: { ...rec, units: u.units, renderId: u.renderId, direction, notice: `The engine returned direction this app cannot use: ${errorMessage(e)} Nothing was changed.` } });
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

/** `blobs`: where the look's references are read (default: the blobs of the store the job runs on, opened lazily). */
export function framesProducer(lane: ResourceLane = "cloud.google", hooks: DriveHooks = {}, engines: ImagingEngines = LIVE_IMAGING, blobs: (ctx: StepContext) => BlobStore = jobBlobs): Producer {
  // The direction turn's engine: the drive's own when it hands one (a test's fake vendor), else the router.
  const turns = enginesOf(hooks);
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
        return await performFrames(ctx, unit, engines, blobs, turns);
      } catch (e) {
        return e instanceof ImagingError ? imageFailure(e, () => earliestExpiry()) : textFailure(e);
      }
    },
    async land(_job, plan, made, ctx) {
      const f = partFacts(ctx);
      return landPart(ctx, plan.act, (s) => landFrames(plan, made, s, Date.now(), f.ok ? f.value : undefined));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
