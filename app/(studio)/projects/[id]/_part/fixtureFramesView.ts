import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import type { AdShotTakes, FactOption, FramesData, LayerView, PartVerdict, PlateView, ProposalRow, ShotReviewView, UnitView } from "@gt/domain/partView";
import { STEP_RECORDS } from "@gt/domain/steps/registry";
import { shotsFromRender, type Shot } from "@/lib/frames/shots";
import { promptsForShots } from "@/lib/frames/shotPrompt";
import { trailerRender } from "@/lib/frames/frames";
import { recipeById } from "@gt/catalog/recipes";
import { derive } from "@/lib/script/trailer/ops";
import type { AdScenario } from "@/lib/ads/types";
import { NOT_CHECKED, reviewShotList } from "@/app/_phases/frames/shotReview";
import { blobRouteUrl } from "@/lib/parts/gates";
import { partVerdict } from "@/lib/parts/verdict";

import { cardsOf } from "./fixtureResearch.ts";
import { chainOf, subjectOf, unitsOf, type FramesRec, type UnitRec } from "./fixtureFrames.ts";
import type { KCtx, Obj } from "./kinds.ts";

// What the frames editor DRAWS, from the working record (./fixtureFrames.ts) and the v1 functions
// that compute each number: the ledger's pips, a plate's staleness (isStalePlate's rule), the
// proposal's rows (plan.ts), the trailer's shot review (reviewShotList over shotsFromRender, with
// the prompts built by promptsForShots so the four prompt rules engage), and the verdict - one
// implementation, lib/parts/verdict.ts, over the same step records the real side stores.

/* ── shared with motion ───────────────────────────────────────────────────── */

export const isAds = (ctx: KCtx): boolean => ctx.project.discipline === "ads";

/** The picked scenario of an ads project (Script's pick), or null. */
export function pickedScenario(ctx: KCtx): AdScenario | null {
  const s = ctx.rec("script");
  return s.scenarios.find((x) => x.id === s.picked) ?? null;
}

const DRY = "dry stand-in";
/** Where a plate's pixels are fetched: a kernel blob through /api/blob, a public path as is. */
export const plateUrl = (p: { readonly blob?: BlobRef; readonly src?: string }): string | null => (p.blob !== undefined ? blobRouteUrl(p.blob) : p.src !== undefined && p.src.startsWith("/") ? p.src : null);

/** A take id as an ads shot stores it: a blob (imageBlobs), a dry stand-in, or an asset id the
 *  server cannot draw (v1's browser uploads store). */
export function takeUrl(id: string, blobs: Readonly<Record<string, BlobRef>> | undefined): string | null {
  const b = blobs?.[id];
  if (b !== undefined) return blobRouteUrl(b);
  const m = /^dry:.*:(\d+)$/.exec(id);
  return m === null ? null : `/clips/presets/${["signal-ledger", "blueprint", "newsprint-cutout", "paper-relief", "data-neon", "chalk-argument"][Number(m[1]) % 6] ?? "signal-ledger"}.jpg`;
}

export function plateView(u: UnitRec): PlateView {
  const p = u.plate;
  const stale = p.state === "ready" && p.renderedSubject !== undefined && p.subject !== undefined && p.subject.trim() !== p.renderedSubject.trim();
  return {
    state: p.rejected !== undefined ? "rejected" : p.state,
    url: p.state === "ready" ? plateUrl(p) : null,
    subject: subjectOf(u),
    stale,
    ...(p.model === undefined ? {} : { model: p.model }),
    ...(p.costUsd === undefined ? {} : { usd: p.costUsd }),
    ...(p.rejected === undefined ? {} : { rejectedBy: p.rejected.packetId }),
    dry: p.model === DRY,
  };
}

/** The step records a verdict reads, stamped at their versions (lib/parts/verdict decodes them). */
export function stepRecords(ctx: KCtx, f: FramesRec, extra: Readonly<Record<string, Obj>> = {}): Map<string, Obj> {
  const s = ctx.rec("script");
  const stamp = (key: keyof typeof STEP_RECORDS, data: Obj): [string, Obj] => [key, { ...data, v: STEP_RECORDS[key].version }];
  return new Map([
    stamp("frames", { units: unitsOf(ctx, f), renderId: f.renderId ?? chainOf(ctx)?.id ?? "" }),
    stamp("ads-scenarios", { ideaId: s.scenariosIdea, options: s.scenarios, pickedId: s.picked }),
    stamp("ads-shots", { scenarioId: f.adsScenario, shots: f.adsShots }),
    ...Object.entries(extra).map(([k, v]) => stamp(k as keyof typeof STEP_RECORDS, v)),
  ]);
}

export function verdictInputOf(ctx: KCtx, records: Map<string, Obj>) {
  return { projectId: ctx.project.id, title: ctx.project.title, discipline: ctx.project.discipline, targetS: ctx.project.targetS, plansVoice: false, records };
}

export const framesVerdict = (ctx: KCtx, f: FramesRec): PartVerdict => partVerdict("frames", verdictInputOf(ctx, stepRecords(ctx, f)));

/* ── the board ────────────────────────────────────────────────────────────── */

function layersOf(u: UnitRec): LayerView[] {
  const els: LayerView[] = u.elements.map((e) => ({
    id: e.id,
    layer: "element",
    role: e.kind,
    label: e.label,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
    ...(e.accent === true ? { accent: true } : {}),
    hidden: e.hidden === true,
    by: e.by ?? "seed",
    ...(e.factId === undefined ? {} : { factId: e.factId }),
    unsourced: false,
  }));
  const txs: LayerView[] = u.texts.map((t) => ({
    id: t.id,
    layer: "text",
    role: t.role,
    label: t.value,
    x: t.x,
    y: t.y,
    hidden: t.hidden === true,
    by: t.by ?? "seed",
    ...(t.factId === undefined ? {} : { factId: t.factId }),
    unsourced: t.role === "figure" && t.factId === undefined,
  }));
  return [...els, ...txs];
}

const OP_WORDS: Readonly<Record<string, string>> = { setSubject: "subject", setMotion: "motion", setRationale: "rationale", replaceElements: "elements", upsertText: "text", removeText: "− text" };

function proposalRow(f: FramesRec, u: UnitRec): ProposalRow | undefined {
  const row = f.proposal?.units.find((x) => x.at === u.beatRef.at);
  if (row === undefined) return undefined;
  const subject = row.ops.find((o) => o.type === "setSubject");
  return {
    ops: [...new Set(row.ops.map((o) => OP_WORDS[o.type] ?? o.type))],
    ...(subject !== undefined && subject.type === "setSubject" ? { subject: subject.subject } : {}),
    conflicts: row.conflicts.reduce((n, c) => n + c.ids.length, 0),
    ...(row.rejected === undefined ? {} : { rejected: row.rejected }),
  };
}

function unitView(ctx: KCtx, f: FramesRec, u: UnitRec, motion: string | undefined): UnitView {
  const alts = f.alts[u.id];
  const layers = layersOf(u);
  const p = proposalRow(f, u);
  return {
    id: u.id,
    at: u.beatRef.at,
    startS: u.startS,
    holdS: u.holdS,
    grain: u.kind,
    beatKind: u.beatKind,
    title: u.title,
    line: u.line,
    ...(u.device === undefined ? {} : { device: u.device }),
    ...(u.rationale === undefined ? {} : { rationale: u.rationale }),
    plate: plateView(u),
    clip: { status: u.clip.status, motion: motion ?? u.clip.motion, url: null },
    layers,
    pips: { elements: u.elements.length, texts: u.texts.length, unsourced: layers.filter((l) => l.unsourced).length },
    ...(u.staging === undefined
      ? {}
      : { staging: { role: u.staging.role ?? "", size: u.staging.size ?? "", angle: u.staging.angle ?? "", pace: u.staging.pace ?? "", direction: u.staging.direction ?? "", placement: u.staging.placement ?? "" } }),
    alts: (alts?.alts ?? []).map((a) => ({ id: a.id, url: plateUrl(a.plate), active: a.id === alts?.activeId, dry: a.plate.model === DRY })),
    ...(p === undefined ? {} : { proposal: p }),
  };
}

/** The trailer lane's shot list review (reviewShotList, 13 rules), with prompts built so the
 *  prompt rules engage, and NOT_CHECKED - the list a reader sizes the green by. */
function shotReview(ctx: KCtx): ShotReviewView | undefined {
  const s = ctx.rec("script");
  if (s.cut === null) return undefined;
  const template = recipeById(ctx.project.recipe)?.template ?? "trailer";
  const shots: Shot[] = shotsFromRender(trailerRender(derive(s.cut).cut, { template, durationS: ctx.project.targetS ?? 120 }));
  const block = ctx.look.block;
  const report = reviewShotList(shots, promptsForShots(shots, block), block);
  const findings = report.checks.map((c) => ({ rule: c.rule, subject: c.shots.length === 0 ? "cut" : c.shots.slice(0, 3).join(", "), verdict: c.verdict, detail: c.detail }));
  const count = (v: string) => report.checks.filter((c) => c.verdict === v).length;
  return { checks: report.checks.length, violations: count("violation"), unmeasured: count("unmeasured"), notEngaged: count("not-engaged"), findings, notChecked: NOT_CHECKED };
}

function facts(ctx: KCtx): FactOption[] {
  return (cardsOf(ctx.rec("research"))?.cards ?? []).filter((c) => c.kind === "fact").map((c) => ({ id: c.id, title: c.title, ...(c.confidence === undefined ? {} : { confidence: c.confidence }) }));
}

function adsTakes(ctx: KCtx, f: FramesRec): FramesData {
  const picked = pickedScenario(ctx);
  const moved = picked !== null && f.adsScenario !== null && f.adsScenario !== picked.id;
  const platform = ctx.rec("research").brief.platform;
  const shots: AdShotTakes[] = (picked?.shots ?? []).map((s) => {
    const rec = moved ? undefined : f.adsShots[s.id];
    const adopted = rec?.adoptedImage ?? null;
    return {
      id: s.id,
      durationS: s.durationS,
      brief: s.image,
      super: s.super,
      adopted,
      takes: (rec?.imageTakes ?? []).map((t) => ({ id: t, url: takeUrl(t, rec?.imageBlobs), adopted: t === adopted, dry: t.startsWith("dry:") })),
    };
  });
  return { face: "takes", scenario: picked === null ? null : { id: picked.id, title: picked.title }, scenarioMoved: moved, aspect: /reel|tiktok|short|story|vertical|9:16/i.test(platform) ? "9:16" : "16:9", shots };
}

export function framesData(ctx: KCtx, f: FramesRec): FramesData {
  if (isAds(ctx)) return adsTakes(ctx, f);
  const chain = chainOf(ctx);
  const all = unitsOf(ctx, f);
  const accepted = ctx.rec("motion").accepted;
  const units = all.map((u) => unitView(ctx, f, u, accepted[u.id]));
  const trailer = chain?.lane === "trailer" || all.some((u) => u.kind === "shot");
  const review = trailer ? shotReview(ctx) : undefined;
  return {
    face: trailer ? "shots" : "assembly",
    source: chain === null ? null : { id: chain.id, title: chain.title },
    sourceMoved: chain !== null && f.renderId !== null && f.renderId !== chain.id,
    units,
    tally: {
      total: all.length,
      composed: all.filter((u) => u.plate.state === "ready").length,
      stale: units.filter((u) => u.plate.stale).length,
      rejected: units.filter((u) => u.plate.state === "rejected").length,
      unsourced: units.reduce((n, u) => n + u.pips.unsourced, 0),
      clips: units.filter((u) => u.clip.motion.trim() !== "").length,
    },
    // The project's look (the frames producer draws in the same one): its style and the
    // references it sends, or the named default and the miss it covers.
    style: { name: ctx.look.name, fallback: ctx.look.miss !== undefined, refs: ctx.look.refs.length, ...(ctx.look.miss === undefined ? {} : { miss: ctx.look.miss }) },
    facts: facts(ctx),
    proposal:
      f.proposal === null
        ? null
        : {
            rows: f.proposal.units.filter((x) => x.ops.length > 0).length,
            conflicts: f.proposal.units.reduce((n, x) => n + x.conflicts.length, 0),
            rejected: f.proposal.units.filter((x) => x.rejected !== undefined).length,
            missing: f.proposal.missing,
          },
    checkpoint: f.checkpoint !== null,
    direction: { runs: f.direction.runs, usd: f.direction.costUsd, unpriced: f.direction.unpriced },
    ...(review === undefined ? {} : { review }),
  };
}
