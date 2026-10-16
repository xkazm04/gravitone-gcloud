import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import { blobStore } from "@gt/kernel/blob";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { storeLocation } from "@gt/kernel/process";
import { defineCut, cutPlan, type CutView } from "@gt/producers/cut/define";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit } from "@gt/producers/research/partAct";
import { landPart, partSnapshot, projectOf } from "@gt/producers/research/partJob";

import { adRenderRequest, seedFinish, shotRows } from "@/app/_phases/cut/ads/finish";
import { adExportFilePath, AdRenderError, REAL_AD_RENDER_DEPS, startAdRender, type AdRenderDeps, type AdRenderReceipt } from "@/lib/adRender";
import type { AdBrief, AdsFinishData, AdsShotsData } from "@/lib/ads/types";
import { compileCut, cutDocumentHash, takePointers, type CutDocument } from "@/lib/cut/cutDocument";
import { deriveTimeline } from "@/lib/cut/deriveTimeline";
import { ExportError, runCutExport, type CutExportResult } from "@/lib/cutExport";
import { OUT_DIRNAME } from "@/lib/fixtures/mode";
import type { PictureUnit } from "@/lib/frames/picture/unit";
import type { Aspect } from "@/lib/imaging/types";
import { exportsRoot } from "@/lib/publish/exports";
import { pictureFromUnits } from "@/lib/score/picture";
import type { ScoreSpot } from "@/lib/score/spots";
import { getTake } from "@/lib/sound/takes";

import { asData, field, must, partFacts, priceOf, recOf, text, withRecords, written, type DriveHooks, type PartFacts, type UnitsFn, preflightFrom } from "./research.ts";
import { pickedScenario } from "./score.ts";

// THE CUT PRODUCER, BOUND (Phase 4 wave C, L37) - packages/producers/src/cut's ports over v1's
// two renders:
//   export-animatic  `deriveTimeline` (the one clock Score shares) -> `compileCut` (the
//                    deterministic EDL; a take outside the sound store compiles as a gap) ->
//                    `runCutExport` (ffmpeg). The mp4 lands as a BLOB on the `cut` record.
//                    SEAM, said: runCutExport resolves a plate from a data: URL or a public path,
//                    and a plate is now a blob ref - so each plate's bytes are read from the blob
//                    store and handed to the call as a data: URL IN MEMORY, for the call only;
//                    nothing with base64 is ever stored (STEPS-DESIGN §0.4). lib/cutExport.ts is
//                    not edited.
//   render-aspect    `adRenderRequest` (refused while a blocking finish check fails) ->
//                    `startAdRender` (ffmpeg + headless Chromium overlays) -> the mp4 as a blob
//                    on `ads-finish.exports`. DROPPED, said: the end card's logo lives in the
//                    browser's uploads store (v1 IndexedDB); the server cannot read it, so a job
//                    renders without one until the logo moves to the blob store.
// Both are LOCAL and free (box.render), and both are DECLARED through the meter anyway: a dry job
// must not spawn ffmpeg, and the would-call is the receipt's evidence of what it would have run.

export type CutEngines = {
  readonly exportCut: (doc: CutDocument, projectId: string) => Promise<{ readonly result: CutExportResult; readonly bytes: Uint8Array }>;
  readonly renderAd: (body: unknown) => Promise<{ readonly receipt: AdRenderReceipt; readonly bytes: Uint8Array }>;
};

const adDeps = (deps: AdRenderDeps): CutEngines["renderAd"] => async (body) => {
  const started = await startAdRender(body, deps);
  const receipt = await started.done;
  if (receipt.status !== "done") throw new AdRenderError(receipt.error ?? `the ${receipt.aspect} render ended ${receipt.status}`, "bad-request");
  return { receipt, bytes: await readFile(adExportFilePath(receipt.exportId)) };
};

const LIVE: CutEngines = {
  exportCut: async (doc, projectId) => {
    const result = await runCutExport({ document: doc, projectId });
    return { result, bytes: await readFile(path.join(exportsRoot(), `${result.id}.mp4`)) };
  },
  renderAd: adDeps(REAL_AD_RENDER_DEPS),
};

const FREE_LOCAL = "ffmpeg on this studio's own box; nobody invoices it";

/** The blob root beside the store this process drives (lib/producers/research.ts `blobRootOf`). */
function blobRoot(): string {
  const at = storeLocation(OUT_DIRNAME);
  return at === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(at), "blobs");
}

const unitsOf = (s: PartSnapshot): PictureUnit[] => {
  const u = recOf(s, "frames")["units"];
  return Array.isArray(u) ? written<PictureUnit[]>(u) : [];
};
const spotsOf = (s: PartSnapshot): ScoreSpot[] | null => {
  const sp = s.records.get("score")?.["spots"];
  return Array.isArray(sp) ? written<ScoreSpot[]>(sp) : null;
};

/** The ads finish as the act reads it, seeded the way v1 seeded it when nobody edited it yet. */
function adsFinish(s: PartSnapshot, f: PartFacts): { finish: AdsFinishData; why?: string; rows: ReturnType<typeof shotRows> } {
  const scenario = pickedScenario(s);
  const briefRec = field(recOf(s, "ads-brief")["brief"]);
  const brief = briefRec === undefined ? null : written<AdBrief>(briefRec);
  const stored = s.records.get("ads-finish");
  if (scenario === undefined) return { finish: stored === undefined ? { supers: {}, endCard: { cta: "", line: null, logoAssetId: null, holdS: 2 }, aspects: [], exports: [] } : written<AdsFinishData>(stored), why: "no scenario picked", rows: [] };
  const finish = stored === undefined ? seedFinish(scenario, brief, written<Parameters<typeof seedFinish>[2]>(f.plan.project.recipe.split("/")[1] ?? null)) : written<AdsFinishData>(stored);
  const shots = s.records.get("ads-shots");
  const rows = shotRows(scenario, shots === undefined ? null : written<AdsShotsData>(shots));
  const missing = rows.filter((r) => r.clipId === null).length;
  if (missing > 0) return { finish, rows, why: `${missing} ${missing === 1 ? "shot" : "shots"} without a clip` };
  if (finish.endCard.cta.trim() === "") return { finish, rows, why: "end card has no call to action" };
  return { finish, rows };
}

export function cutView(s: PartSnapshot, f: PartFacts): CutView {
  if (f.discipline === "ads") {
    const a = adsFinish(s, f);
    return { face: "ads", scenes: a.rows.length, ...(a.why === undefined ? {} : { adsBlocked: a.why }), aspects: a.finish.aspects };
  }
  return { face: "standard", scenes: pictureFromUnits(unitsOf(s), f.targetS ?? 0).scenes.length, aspects: [] };
}

export const cutUnits: UnitsFn = withRecords((s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act" | "target">): Result<ActPlan> => cutPlan(cutView(s, f), ask.act, ask.target, priceOf(f.option)));

/** A local render's failure: a posture refusal or a bad document is the job's sentence; an
 *  ffmpeg that failed may succeed on a retry (the breaker counts it). */
const renderFailure = (e: unknown): StepOutcome =>
  failureOf(e, (x) => (x instanceof ExportError ? (x.code === "bad-request" || x.code === "local-binaries-forbidden" ? "fatal" : "retry") : x instanceof AdRenderError ? "fatal" : undefined));

/** The plates' bytes as data: URLs for the call only (see the header's SEAM). */
async function withPlates(units: readonly PictureUnit[]): Promise<PictureUnit[]> {
  const blobs = blobStore(blobRoot());
  return Promise.all(
    units.map(async (u) => {
      const ref = field(field(u.plate)?.["blob"]);
      if (ref === undefined) return u;
      const bytes = await blobs.read(written<BlobRef>(ref));
      // A plate whose bytes are gone stays "no plate" on the clock, which the export draws as a gap.
      if (!bytes.ok) return u;
      return { ...u, plate: { ...u.plate, src: `data:${String(ref["mime"])};base64,${Buffer.from(bytes.value).toString("base64")}` } };
    }),
  );
}

async function storeHeld(spots: readonly ScoreSpot[] | null): Promise<Set<string>> {
  const held = new Set<string>();
  for (const sp of spots ?? []) {
    if (sp.activeTakeId === undefined) continue;
    // A pointer the store cannot answer is not held: the music lane draws it missing, said.
    const inStore = await getTake(sp.activeTakeId).then(
      () => true,
      () => false,
    );
    if (inStore) held.add(sp.activeTakeId);
  }
  return held;
}

const standBytes = (what: string): Uint8Array => new TextEncoder().encode(`dry stand-in: ${what}`);

async function animaticUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, eng: CutEngines): Promise<StepOutcome> {
  const projectId = projectOf(ctx.job);
  const spots = spotsOf(s);
  const units = await withPlates(unitsOf(s));
  const cut = deriveTimeline({ projectId, project: f.targetS === null ? null : { title: f.plan.project.title, logline: "", targetS: f.targetS }, units, spots, storeTakeIds: await storeHeld(spots) });
  const offsets = field(recOf(s, "cut")["offsets"]) ?? {};
  const doc = compileCut(cut, written<Record<string, number>>(offsets), takePointers(spots));
  const hash = cutDocumentHash(doc);
  const out = await meteredCall<{ result: CutExportResult; bytes: Uint8Array } | null>(ctx, {
    provider: "ffmpeg",
    model: "cut-export",
    // The document's identity, not its bytes: the would-call compares two exports by what they render.
    payload: { document: hash, projectId },
    estimate: unit.estimate,
    stand: () => null,
    live: async () => ({ value: await eng.exportCut(doc, projectId), usd: 0, unpriced: FREE_LOCAL }),
  });
  const bytes = out?.bytes ?? standBytes(`animatic ${hash}`);
  const blob = await ctx.fx.blob(bytes, "video/mp4");
  if (!blob.ok) return { kind: "vendor-failure", message: blob.error.message };
  const body = { blob: blob.value, document: hash, totalS: doc.totalS, exportId: out?.result.id ?? `dry-${hash}`, unreachable: out?.result.unreachable ?? [], mode: ctx.job.mode.kind };
  return (out === null ? madeFree : (o: EventData) => madePaid(o, ctx))(asData(body));
}

async function aspectUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, eng: CutEngines): Promise<StepOutcome> {
  const aspect = written<Aspect>(String(unit.input["aspect"]));
  const a = adsFinish(s, f);
  if (a.why !== undefined) return { kind: "fatal", code: "refused", message: a.why };
  const music = text(recOf(s, "ads-score")["activeTakeId"]) ?? null;
  const body = adRenderRequest({ projectId: projectOf(ctx.job), aspect, rows: a.rows, finish: a.finish, logo: null, musicTakeId: music });
  if (body === null) return { kind: "fatal", code: "refused", message: "a blocking finish check fails" };
  const out = await meteredCall<{ receipt: AdRenderReceipt; bytes: Uint8Array } | null>(ctx, {
    provider: "ffmpeg",
    model: "ad-render",
    payload: body,
    estimate: unit.estimate,
    stand: () => null,
    live: async () => ({ value: await eng.renderAd(body), usd: 0, unpriced: FREE_LOCAL }),
  });
  const id = out?.receipt.exportId ?? `dry-${createHash("sha256").update(`${ctx.job.id}/${aspect}`).digest("hex").slice(0, 16)}`;
  const blob = await ctx.fx.blob(out?.bytes ?? standBytes(`ad ${aspect}`), "video/mp4");
  if (!blob.ok) return { kind: "vendor-failure", message: blob.error.message };
  return (out === null ? madeFree : (o: EventData) => madePaid(o, ctx))(asData({ aspect, exportId: id, blob: blob.value, mode: ctx.job.mode.kind }));
}

function landCut(job: { readonly id: string }, plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot, f: PartFacts, at: string): Result<Record<string, unknown>> {
  if (plan.act === "render-aspect") {
    const a = adsFinish(s, f);
    const exports = [...a.finish.exports, ...plan.units.flatMap((u) => {
      const m = made.get(u.name);
      return m === undefined ? [] : [{ aspect: m["aspect"], exportId: m["exportId"], createdAt: at, blob: m["blob"], jobId: job.id, mode: m["mode"] }];
    })];
    // DEVIATION, reported: v1's `supers` holds `null` as a decision ("no super"); the step door
    // (@gt/domain/steps ADS_FINISH) types supers as strings. A seeded null equals the scenario's
    // own null super, so dropping it reads the same through `superFor`; the schema should widen.
    const supers = Object.fromEntries(Object.entries(a.finish.supers).filter((e): e is [string, string] => e[1] !== null));
    return ok({ "ads-finish": asData({ ...a.finish, supers, exports }) });
  }
  const m = made.get("animatic");
  if (m === undefined) return err("internal", "export-animatic: no render booked");
  const rec = recOf(s, "cut");
  const prior = Array.isArray(rec["exports"]) ? rec["exports"] : [];
  return ok({ cut: { ...rec, offsets: rec["offsets"] ?? {}, exports: [...prior, { blob: m["blob"], document: m["document"], totalS: m["totalS"], exportId: m["exportId"], unreachable: m["unreachable"], at, jobId: job.id, mode: m["mode"] }] } });
}

export function cutProducer(lane: ResourceLane = "box.render", hooks: DriveHooks = {}, engines: Partial<CutEngines> & { readonly adDeps?: AdRenderDeps } = {}): Producer {
  const eng: CutEngines = { ...LIVE, ...(engines.adDeps === undefined ? {} : { renderAd: adDeps(engines.adDeps) }), ...engines };
  return defineCut(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(cutUnits),
    async plan(_job, ask, ctx) {
      const s = partSnapshot(ctx);
      if (!s.ok) return s;
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return cutUnits(s.value, f.value, ask);
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        const s = must(partSnapshot(ctx));
        const f = must(partFacts(ctx));
        if (unit.name === "animatic") return await animaticUnit(ctx, unit, s, f, eng);
        if (unit.name.startsWith("aspect:")) return await aspectUnit(ctx, unit, s, f, eng);
        return { kind: "fatal", code: "invalid", message: `cut: no unit ${unit.name}` };
      } catch (e) {
        return renderFailure(e);
      }
    },
    async land(job, plan, made, ctx) {
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return landPart(ctx, plan.act, (s) => landCut(job, plan, made, s, f.value, new Date().toISOString()));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
