import "server-only";

import { recipeById } from "@gt/catalog/recipes";
import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { finishOpLabel, type AdAspect, type AdFinishData, type ClipView, type CutData, type CutOp, type ExportView, type FinishRow, type PartActKind, type PartActView, type PartVerdict, type TimelineData } from "@gt/domain/partView";

import { compileCut, cutDocumentHash } from "@/lib/cut/cutDocument";
import { deriveTimeline, turnOf, type CutClip, type DerivedCut, type OwnerStep } from "@/lib/cut/deriveTimeline";
import { finishLine } from "@/lib/cut/finishLine";
import { drawnStart, nudgeOffsets, offsetFrom, shownStatus, type Offsets } from "@/lib/cut/offsets";
import { AD_RUNTIME_RANGE, type AdsFinishData, type AdsShotsData } from "@/lib/ads/types";
import { editPoints, musicGaps } from "@/app/_phases/cut/edits";
import { AD_ASPECTS, AD_ASPECT_PX, adFinishChecks, seedFinish, shotRows, superFor } from "@/app/_phases/cut/ads/finish";

import type { Ctx } from "./fixture.ts";
import { engineOf, heldTakes, unitsOf, verdictFor, type ScoreRec } from "./fixtureScoreRecs.ts";
import { explainerCut } from "./fixtureExplainer.ts";
import { asObj, type KCtx, type KindModule, type Obj, type Recs } from "./kinds.ts";
import { keyOfKind } from "./fixtureAlbum.ts";

// THE CUT PART (L40; STEPS-DESIGN §2 cut). The film's lanes over one clock with the score, its
// finish line, the sync bench, and the animatic export; the ad's finish; the explainer's cut over
// its strips and voice. The intelligence is v1's, called: `deriveTimeline` (missing reasons per
// block, the act-two turn), `finishLine` (seven checks, pass/fail/unmeasured, deny sentences
// verbatim), `nudgeOffsets` (a pure step over the previous offsets - the batch bug it fixed
// stays fixed), `editPoints`/`musicGaps`, `compileCut` + `cutDocumentHash` (a deterministic EDL),
// the ads `adFinishChecks` (clips and CTA block; the bed is `unmeasured` without a take, never a
// fail; loudness ±1 LU around -14).
//
// What changed from v1:
//   · the 50-deep SESSION undo of offsets (useCut.ts) is the part's op log: a nudge survives a
//     reload and ⌫ undoes it from any tab;
//   · "export animatic" POSTed data: URLs with no job and no price; it is a part act behind a
//     receipt, its output an mp4 blob, and the export row names the EDL digest it was cut from;
//   · v1's Cut fell back to Glass Harbor's hand-typed cut for one seeded project. There is no
//     fixture fallback: no frames record is an empty cut and an upstream break.

export type ExportRec = { readonly id: string; readonly at: number; readonly mode: "dry" | "live"; readonly label: string; readonly hash: string; readonly blob?: BlobRef; readonly aspect?: AdAspect };
export type CutRec = { readonly offsets: Offsets; readonly exports: readonly ExportRec[]; readonly finish: AdsFinishData | null };

type Face = "timeline" | "explainer" | "finish";
const face = (ctx: Ctx): Face => (ctx.project.discipline === "ads" ? "finish" : recipeById(ctx.project.recipe)?.family === "explainer" ? "explainer" : "timeline");

/* ── the derived cut ──────────────────────────────────────────────────────── */

/** The cut as lib/cut derives it from this project's records - or the explainer's own. */
export function derivedOf(ctx: KCtx): DerivedCut {
  if (face(ctx) === "explainer") return explainerCut(ctx);
  const score = ctx.rec("score");
  const units = unitsOf(ctx.records());
  // The held takes go in as `takes` (cue -> its content address), NOT as `storeTakeIds`: given a
  // store listing, deriveTimeline builds the v1 sound route's URL with a CLIENT function
  // (lib/sound/client.ts takeFileUrl), which throws on the server. A pointer not in hand is then
  // the store's "gone", said in v1's own words.
  const held = heldTakes(score);
  const takes: Record<string, string> = {};
  for (const spot of score.spots ?? []) {
    const t = spot.activeTakeId === undefined ? undefined : score.takes[spot.activeTakeId];
    if (t !== undefined && held.has(t.id)) takes[spot.id] = t.blob === undefined ? `dry:${t.id}` : `sha256:${t.blob.sha256}`;
  }
  const cut = deriveTimeline({
    projectId: ctx.project.id,
    project: ctx.project.targetS === null ? null : { title: ctx.project.title, logline: "", targetS: ctx.project.targetS },
    units,
    spots: score.spots === null ? null : [...score.spots],
    takes,
    storeTakeIds: null,
  });
  return { ...cut, clips: cut.clips.map((c) => (c.why === "sound store not read" ? { ...c, why: "take gone from the store" } : c)) };
}

const OWNER_KIND: Readonly<Record<OwnerStep, string>> = { frames: "frames", score: "score", script: "script" };
/** The part key that clears an owner, if this project plans one (explainer voice is `voice`). */
function ownerKey(ctx: KCtx, owner: OwnerStep | undefined, track?: CutClip["track"]): string | null {
  if (owner === undefined) return null;
  const kind = face(ctx) === "explainer" ? (track === "vo" || owner === "script" ? "voice" : owner === "frames" ? "strips" : OWNER_KIND[owner]) : OWNER_KIND[owner];
  return keyOfKind(ctx, kind);
}

const blobOf = (src: string | undefined): string | undefined => (src?.startsWith("sha256:") === true ? src.slice(7) : undefined);

function takeBlob(score: ScoreRec, cueId: string): string | undefined {
  const spot = score.spots?.find((x) => x.id === cueId);
  const t = spot?.activeTakeId === undefined ? undefined : score.takes[spot.activeTakeId];
  return t?.blob?.sha256;
}

function exportView(e: ExportRec): ExportView {
  return { id: e.id, at: new Date(e.at).toISOString(), mode: e.mode, label: e.label, ...(e.blob === undefined ? {} : { blob: e.blob.sha256, bytes: e.blob.bytes }) };
}

function docHash(ctx: KCtx, cut: DerivedCut, offsets: Offsets): string {
  const score = ctx.rec("score");
  const takes: Record<string, string> = {};
  for (const s of score.spots ?? []) {
    const b = takeBlob(score, s.id);
    if (b !== undefined) takes[s.id] = `sha256:${b}`;
  }
  return cutDocumentHash(compileCut(cut, offsets, takes));
}

/** The explainer plans no score: its finish line holds no music rows. */
function rowsOf(ctx: KCtx, cut: DerivedCut, offsets: Offsets): FinishRow[] {
  const music = face(ctx) !== "explainer";
  return finishLine(cut, offsets)
    .filter((r) => music || (r.id !== "coverage" && r.id !== "takes"))
    .map((r) => ({ id: r.id, label: r.label, value: r.value, target: r.target, verdict: r.verdict, owner: ownerKey(ctx, r.owner), ...(r.deny === undefined ? {} : { deny: r.deny }) }));
}

function timeline(ctx: KCtx, c: CutRec): TimelineData {
  const cut = derivedOf(ctx);
  const score = ctx.rec("score");
  const clips: ClipView[] = cut.clips.map((x) => {
    const blob = x.track === "music" ? takeBlob(score, x.ref) : blobOf(x.src);
    return {
      id: x.id,
      track: x.track,
      label: x.label,
      startS: x.startS,
      drawnS: drawnStart(c.offsets, x),
      durS: x.durS,
      status: shownStatus(c.offsets, x),
      ...(x.why === undefined ? {} : { why: x.why }),
      ...(x.note === undefined ? {} : { note: x.note }),
      owner: ownerKey(ctx, x.owner, x.track),
      offsetMs: offsetFrom(c.offsets, x),
      ...(blob === undefined ? {} : { blob }),
    };
  });
  const pictures = cut.clips.filter((x) => x.track === "video");
  return {
    face: "timeline",
    origin: cut.origin === "project" ? "project" : "empty",
    totalS: cut.totalS,
    targetS: cut.targetS,
    fps: 25,
    music: face(ctx) !== "explainer",
    scenes: cut.scenes.map((s) => ({ id: s.id, index: s.index, label: s.label, mood: s.mood, startS: s.startS, durS: s.durS })),
    clips,
    edits: editPoints(cut, c.offsets),
    gaps: face(ctx) === "explainer" ? [] : musicGaps(cut),
    turn: turnOf(cut.scenes),
    finish: rowsOf(ctx, cut, c.offsets),
    unplaced: cut.unplaced.map((u) => ({ label: u.label, why: u.why, owner: ownerKey(ctx, u.owner) })),
    monitor: Object.fromEntries(
      cut.scenes.map((s) => {
        const f = cut.frames[s.id];
        const pic = pictures.find((p) => p.ref === s.id);
        const blob = blobOf(pic?.src);
        return [s.id, { title: s.label, line: f?.line ?? pic?.note ?? "", kind: f?.kind ?? s.mood, placed: pic !== undefined && pic.status !== "missing", ...(blob === undefined ? {} : { blob }) }];
      }),
    ),
    exports: c.exports.filter((e) => e.aspect === undefined).map(exportView),
    docHash: docHash(ctx, cut, c.offsets),
  };
}

/* ── the ad's finish ──────────────────────────────────────────────────────── */

function adBasis(ctx: KCtx, c: CutRec) {
  const script = ctx.rec("script");
  const scenario = script.scenarios.find((x) => x.id === script.picked) ?? null;
  if (scenario === null) return null;
  const raw = ctx.records().get("ads-shots");
  // The frames part's record through its door (verdict.ts reads it the same way); v1's
  // `shotRows` keys a clip by `clipId`, the server record by `id` - both are carried.
  const shots = raw === undefined ? null : ({ ...raw, shots: Object.fromEntries(Object.entries((raw["shots"] ?? {}) as Record<string, Obj>).map(([k, v]) => [k, { ...v, clips: ((v["clips"] ?? []) as Obj[]).map((x) => ({ clipId: x["id"], ...x })) }])) } as AdsShotsData);
  const tpl = ctx.project.recipe.endsWith("ad-spot-30") ? "ad-spot-30" : "ad-social-15";
  const finish = c.finish ?? seedFinish(scenario, ctx.rec("research").brief, tpl);
  const rows = shotRows(scenario, shots);
  const bed = ctx.rec("score").bed;
  return { scenario, finish, rows, range: AD_RUNTIME_RANGE[tpl], musicTakeId: bed !== null && bed.scenarioId === scenario.id ? bed.activeTakeId : null };
}

function adFinish(ctx: KCtx, c: CutRec): AdFinishData {
  const b = adBasis(ctx, c);
  if (b === null) return { face: "finish", scenario: null, shots: [], endCard: { cta: "", line: "", holdS: 2 }, aspects: [], checks: [], runtimeS: 0, targetS: ctx.project.targetS };
  const checks = adFinishChecks({ rows: b.rows, finish: b.finish, range: b.range, musicTakeId: b.musicTakeId, rendered: null });
  const latest = (a: AdAspect) => c.exports.filter((e) => e.aspect === a).at(-1) ?? null;
  return {
    face: "finish",
    scenario: { id: b.scenario.id, title: b.scenario.title },
    shots: b.rows.map((r) => ({ id: r.spec.id, durationS: r.spec.durationS, image: r.spec.image, clip: r.clipId !== null, super: superFor(b.finish, r.spec) ?? "" })),
    endCard: { cta: b.finish.endCard.cta, line: b.finish.endCard.line ?? "", holdS: b.finish.endCard.holdS },
    aspects: AD_ASPECTS.map((a) => {
      const e = latest(a);
      return { aspect: a, on: b.finish.aspects.includes(a), px: AD_ASPECT_PX[a], export: e === null ? null : exportView(e) };
    }),
    checks: checks.map((x) => ({ id: x.id, label: x.label, value: x.value, verdict: x.verdict, blocking: x.blocks === true, ...(x.deny === undefined ? {} : { deny: x.deny }) })),
    runtimeS: b.rows.reduce((t, r) => t + (r.trimS ?? r.spec.durationS), 0) + b.finish.endCard.holdS,
    targetS: ctx.project.targetS,
  };
}

/* ── ops ──────────────────────────────────────────────────────────────────── */

const no = (m: string): Result<never> => err("invalid", m);
/** v1's bench nudged ±50 ms; a nudge past five seconds is a re-edit, not sync. */
const MAX_NUDGE_MS = 5000;

function apply(ctx: KCtx, c: CutRec, op: CutOp): Result<CutRec> {
  if (op.op === "nudge" || op.op === "snap") {
    if (face(ctx) === "finish") return no(`${op.op} is a timeline op`);
    const clip = derivedOf(ctx).clips.find((x) => x.id === op.clipId);
    if (clip === undefined) return no(`no clip ${op.clipId} on this cut`);
    if (op.op === "snap") return offsetFrom(c.offsets, clip) === 0 ? no(`${clip.label} is on its mark`) : ok({ ...c, offsets: { ...c.offsets, [clip.id]: 0 } });
    if (!Number.isInteger(op.ms) || op.ms === 0 || Math.abs(op.ms) > MAX_NUDGE_MS) return no(`a nudge is a whole number of ms within ±${MAX_NUDGE_MS}`);
    return ok({ ...c, offsets: nudgeOffsets(c.offsets, clip, op.ms) });
  }
  const b = adBasis(ctx, c);
  if (b === null) return no("no scenario picked");
  const f = b.finish;
  switch (op.op) {
    case "super":
      if (!b.scenario.shots.some((x) => x.id === op.shotId)) return no(`no shot ${op.shotId}`);
      return ok({ ...c, finish: { ...f, supers: { ...f.supers, [op.shotId]: op.text.trim() === "" ? null : op.text } } });
    case "end-card":
      return ok({ ...c, finish: { ...f, endCard: { ...f.endCard, [op.field]: op.field === "line" && op.value.trim() === "" ? null : op.value } } });
    case "end-hold":
      return op.holdS >= 0.5 && op.holdS <= 10 ? ok({ ...c, finish: { ...f, endCard: { ...f.endCard, holdS: Math.round(op.holdS * 10) / 10 } } }) : no("an end card holds 0.5-10 s");
    case "aspect": {
      const has = f.aspects.includes(op.aspect);
      if (has === op.on) return no("unchanged");
      const aspects = op.on ? [...f.aspects, op.aspect] : f.aspects.filter((a) => a !== op.aspect);
      return aspects.length === 0 ? no("an ad renders at least one aspect") : ok({ ...c, finish: { ...f, aspects } });
    }
  }
}

/* ── acts ─────────────────────────────────────────────────────────────────── */

function acts(ctx: KCtx, c: CutRec): PartActView[] {
  if (face(ctx) === "finish") return [];
  const cut = derivedOf(ctx);
  return [{ act: "export-animatic", label: c.exports.some((e) => e.aspect === undefined) ? "export again" : "export animatic", needs: cut.scenes.length === 0 ? ["picture on the clock"] : [] }];
}

function units(ctx: KCtx, c: CutRec, act: PartActKind, target?: string): Result<number> {
  if (act === "export-animatic") {
    const a = acts(ctx, c)[0];
    return a === undefined ? no("an ad renders per aspect") : a.needs.length > 0 ? no(`export needs ${a.needs.join(" · ")}`) : ok(1);
  }
  if (act === "render-aspect") {
    const d = adFinish(ctx, c);
    const asp = d.aspects.find((x) => x.aspect === target);
    if (asp === undefined) return no("render names an aspect");
    if (!asp.on) return no(`${asp.aspect} is not chosen`);
    const blocking = d.checks.filter((x) => x.blocking && x.verdict === "fail");
    return blocking.length > 0 ? no(blocking.map((x) => x.deny ?? x.label).join(" · ")) : ok(1);
  }
  return no(`${act} is not a cut act`);
}

function land(ctx: KCtx, c: CutRec, act: PartActKind, at: number, jobId: string, target?: string): Result<CutRec> {
  const n = c.exports.length + 1;
  if (act === "export-animatic") {
    const cut = derivedOf(ctx);
    const e: ExportRec = { id: `export-${n}`, at, mode: engineOf(ctx, "cut", 0).mode, label: `animatic ${n}`, hash: docHash(ctx, cut, c.offsets) };
    void jobId;
    return ok({ ...c, exports: [...c.exports, e] });
  }
  if (act === "render-aspect" && target !== undefined) {
    const aspect = AD_ASPECTS.find((a) => a === target);
    if (aspect === undefined) return no(`no aspect ${target}`);
    const e: ExportRec = { id: `export-${n}`, at, mode: "dry", label: `${aspect} · ${AD_ASPECT_PX[aspect]}`, hash: "", aspect };
    const f = adBasis(ctx, c)?.finish ?? null;
    // The loose record carries the export's mode and label beside v1's three fields.
    const row = { aspect, exportId: e.id, createdAt: at, mode: e.mode, label: e.label };
    return ok({ ...c, exports: [...c.exports, e], finish: f === null ? null : { ...f, exports: [...f.exports, row] } });
  }
  return no(`${act} is not a cut act`);
}

/* ── verdict, records ─────────────────────────────────────────────────────── */

/** The cut's verdict: lib/parts/verdict's rule (READY when the finish line holds nothing; a film
 *  plans no voice part, so its voice row is reported and does not hold), over THIS derived cut -
 *  the explainer's is its own (strips and voice), which lib's cutVerdict does not derive; the ads
 *  face reads ads-finish and stays lib's. */
function verdict(ctx: KCtx, c: CutRec): PartVerdict {
  if (face(ctx) === "finish") return verdictFor(ctx, "cut", heldTakes(ctx.rec("score")));
  const cut = derivedOf(ctx);
  if (cut.scenes.length === 0) return { state: "empty", codes: [{ code: "no-picture", text: "no picture to cut" }] };
  const rows = rowsOf(ctx, cut, c.offsets);
  const plansVoice = recipeById(ctx.project.recipe)?.parts.some((p) => p.kind === "voice") === true;
  const fails = rows.filter((r) => r.verdict === "fail");
  const holds = fails.filter((r) => r.id !== "voice" || plansVoice);
  // What holds the cut first; a row this recipe has no part to clear (a film's voice) after it.
  const codes = [...holds, ...fails.filter((r) => !holds.includes(r))].map((r) => ({ code: `finish-${r.id}`, text: r.deny ?? `${r.label} ${r.value} vs ${r.target}` }));
  return holds.length === 0 ? { state: "ready", codes: [{ code: "finish-line", text: `${rows.filter((r) => r.verdict === "pass").length} of ${rows.length} checks pass` }, ...codes] } : { state: "working", codes };
}

function toRecords(c: CutRec): Record<string, Obj> {
  return { cut: { offsets: c.offsets, exports: c.exports.filter((e) => e.aspect === undefined) }, ...(c.finish === null ? {} : { "ads-finish": asObj(c.finish) }) };
}

function fromRecords(recs: Recs): CutRec {
  const cut = recs.get("cut");
  const fin = recs.get("ads-finish");
  const offsets = (cut?.["offsets"] ?? {}) as Offsets;
  // Both written by `toRecords` through their doors; read back as written.
  const exports = (Array.isArray(cut?.["exports"]) ? cut["exports"] : []) as ExportRec[];
  const finish = fin !== undefined && isFinish(fin) ? fin : null;
  const adExports: ExportRec[] = (finish?.exports ?? []).map((e) => {
    const x = asObj(e);
    return { id: e.exportId, at: typeof e.createdAt === "number" ? e.createdAt : Date.parse(e.createdAt), mode: x["mode"] === "dry" ? "dry" : "live", label: typeof x["label"] === "string" ? x["label"] : e.aspect, hash: "", aspect: e.aspect as AdAspect };
  });
  return { offsets, exports: [...exports, ...adExports], finish };
}

/** The door (ADS_FINISH) checked these fields; the guard lets them be read as v1's type. */
function isFinish(x: Obj): x is Obj & AdsFinishData {
  const e = x["endCard"];
  return typeof x["supers"] === "object" && Array.isArray(x["aspects"]) && Array.isArray(x["exports"]) && typeof e === "object" && e !== null && "cta" in e && "holdS" in e;
}

const ACT_LABELS: Partial<Record<PartActKind, string>> = { "export-animatic": "animatic export", "render-aspect": "aspect render" };

export const CUT_KIND: KindModule<"cut"> = {
  ops: ["nudge", "snap", "super", "end-card", "end-hold", "aspect"],
  seed: () => ({ offsets: {}, exports: [], finish: null }),
  apply: (ctx, c, op) => apply(ctx, c, op),
  label: (op) => finishOpLabel(op),
  verdict,
  acts,
  units,
  land,
  data: (ctx, c): CutData => (face(ctx) === "finish" ? adFinish(ctx, c) : timeline(ctx, c)),
  actLabel: (act) => ACT_LABELS[act] ?? act,
  fromRecords: (recs) => fromRecords(recs),
  toRecords,
};
