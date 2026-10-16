import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import { finishOpLabel, type BedData, type PartActKind, type PartActView, type ScoreData, type ScoreOp, type SpottingData } from "@gt/domain/partView";

import { coveredS } from "@/lib/cut/finishLine";
import { proposeSpots, toCueSpots, type ScoreSpot } from "@/lib/score/spots";
import { derive } from "@/lib/script/trailer/ops";
import { cuesFrom } from "@/lib/studio/score";
import { activateTake, adoptTake, bindTake } from "@/app/_phases/score/takes";
import { gapRuns } from "@/app/_phases/score/gaps";
import { BPM_RANGE, DEFAULT_HOLD_S, bedRuntimeS } from "@/app/_phases/score/ads/bed";

import type { Ctx } from "./fixture.ts";
import { engineOf, heldTakes, pictureOf, scoreFromRecords, scoreToRecords, takeView, verdictFor, type BedRec, type Picture, type ScoreRec, type TakeRec } from "./fixtureScoreRecs.ts";
import type { KCtx, KindModule } from "./kinds.ts";

// THE SCORE PART (L40; STEPS-DESIGN §2 score). The spotting session over this project's own
// picture, and the ad's bed. The intelligence is v1's, called: `proposeSpots` (a movement is a
// cue, a half-open scene partition, never an invented tempo, an unplaced movement carries its
// reason), `pictureFromUnits` + `sceneClock` + `cuesFrom` (one clock with the Cut), `gapRuns`,
// `bindTake`/`activateTake`/`adoptTake` (a second render never steals the active slot), the bed's
// runtime by construction (`bedRuntimeS`), and the verdict lib/parts/verdict already ports.
//
// What changed from v1:
//   · v1 seeded the session in the browser (useSpots.ts `seedSession`): no record -> the
//     proposals. Kept, and made a record fact: with no `score` record the view shows the
//     proposals marked pending, and the FIRST edit keeps them (any edit clears `proposed` on
//     the cue it touches, as v1 did). A proposal is never saved by being looked at.
//   · v1 kept a take's keep/reject on the sound store and its bytes there; here a take's
//     metadata rides on its spot (`takeMeta`) and its bytes are a blob ref (`takeBlobs`, the
//     field the score gate's candidates read - lib/parts/gates.ts, L39).
//   · Score never priced or launched a job in v1 (it fetched /api/sound/generate). A render is
//     a part act behind a receipt; single-flight per cue is the job key (L37 `enqueueActIn`).

/* ── the session ──────────────────────────────────────────────────────────── */

const face = (ctx: Ctx): "spotting" | "bed" => (ctx.project.discipline === "ads" ? "bed" : "spotting");

function proposal(ctx: KCtx, pic: Picture | null): { spots: ScoreSpot[]; unplaced: { label: string; why: string }[] } {
  const log = ctx.rec("script").cut;
  if (log === null || pic === null) return { spots: [], unplaced: [] };
  const p = proposeSpots(derive(log).cut, pic.scenes);
  return { spots: p.spots, unplaced: p.unplaced.map((u) => ({ label: u.movement.label, why: u.why })) };
}

/** The spots in effect: the saved session, else the proposal. */
const spotsOf = (ctx: KCtx, s: ScoreRec, pic: Picture | null): ScoreSpot[] => (s.spots === null ? proposal(ctx, pic).spots : [...s.spots]);

function pickedScenario(ctx: KCtx) {
  const sc = ctx.rec("script");
  return sc.scenarios.find((x) => x.id === sc.picked) ?? null;
}

const holdOf = (ctx: KCtx): number => ctx.rec("cut").finish?.endCard.holdS ?? DEFAULT_HOLD_S;

function spotting(ctx: KCtx, s: ScoreRec): SpottingData {
  const pic = pictureOf(ctx);
  const prop = proposal(ctx, pic);
  const spots = s.spots === null ? prop.spots : [...s.spots];
  const { cues } = cuesFrom(toCueSpots(spots), pic?.scenes ?? [], { title: ctx.project.title, logline: "" });
  const byId = new Map(spots.map((x) => [x.id, x]));
  const covered = new Set(spots.flatMap((x) => x.sceneIds));
  const totalS = pic?.totalS ?? 0;
  const turn = pic?.clock.find((c) => /turn/i.test(c.scene.mood));
  return {
    face: "spotting",
    totalS,
    targetS: ctx.project.targetS,
    scenes: (pic?.clock ?? []).map(({ scene, startS }) => ({ id: scene.id, index: scene.index, label: scene.slug, mood: scene.mood, startS, durS: scene.targetS })),
    cues: cues.map((c) => {
      const spot = byId.get(c.id);
      const active = spot?.activeTakeId ?? null;
      return {
        id: c.id,
        title: c.title,
        sceneIds: spot?.sceneIds ?? [],
        startS: c.startS,
        durS: c.durS,
        note: c.note,
        bpm: spot?.bpm ?? null,
        proposed: spot?.proposed === true,
        takes: (spot?.takeIds ?? []).map((id) => takeView(s.takes[id], id, id === active)),
        activeTakeId: active,
      };
    }),
    proposal: { pending: s.spots === null && prop.spots.length > 0, unplaced: prop.unplaced },
    gaps: gapRuns(pic?.scenes ?? [], covered),
    coveredS: coveredS(cues, totalS),
    turn: turn === undefined ? null : { atS: turn.startS, label: turn.scene.slug },
    lab: [],
  };
}

function bed(ctx: KCtx, s: ScoreRec): BedData {
  const sc = pickedScenario(ctx);
  const hold = holdOf(ctx);
  const b = s.bed;
  return {
    face: "bed",
    scenario: sc === null ? null : { id: sc.id, title: sc.title, musicMood: sc.musicMood },
    stale: sc !== null && b !== null && b.takeIds.length > 0 && b.scenarioId !== sc.id,
    shots: (sc?.shots ?? []).map((x) => ({ id: x.id, durationS: x.durationS, label: x.super ?? x.image })),
    endCardS: hold,
    runtimeS: sc === null ? 0 : bedRuntimeS(sc, hold),
    bpm: b?.bpm ?? null,
    takes: (b?.takeIds ?? []).map((id) => takeView(s.takes[id], id, id === b?.activeTakeId)),
    activeTakeId: b?.activeTakeId ?? null,
  };
}

/* ── ops ──────────────────────────────────────────────────────────────────── */

const no = (m: string): Result<never> => err("invalid", m);
/** v1 useSpots: any edit to a proposed cue makes it the creator's. */
const touched = (x: ScoreSpot): ScoreSpot => {
  const { proposed: _p, ...rest } = x;
  void _p;
  return rest;
};

function spanOf(pic: Picture | null, first: string, last: string): Result<string[]> {
  const ids = (pic?.scenes ?? []).map((x) => x.id);
  const a = ids.indexOf(first);
  const b = ids.indexOf(last);
  if (a < 0 || b < 0) return no(`no scene ${a < 0 ? first : last} on this picture`);
  return ok(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
}

function bpmOk(bpm: number | null): boolean {
  return bpm === null || (Number.isFinite(bpm) && bpm >= BPM_RANGE[0] && bpm <= BPM_RANGE[1]);
}

function applyBed(ctx: KCtx, s: ScoreRec, op: ScoreOp): Result<ScoreRec> {
  const sc = pickedScenario(ctx);
  if (sc === null) return no("no scenario picked");
  const b: BedRec = s.bed ?? { scenarioId: sc.id, bpm: null, takeIds: [], activeTakeId: null };
  if (op.op === "cue-bpm") return bpmOk(op.bpm) ? ok({ ...s, bed: { ...b, bpm: op.bpm } }) : no(`a tempo is ${BPM_RANGE[0]}-${BPM_RANGE[1]} bpm`);
  if (op.op === "take-use") return b.takeIds.includes(op.takeId) ? ok({ ...s, bed: { ...b, activeTakeId: op.takeId } }) : no(`no take ${op.takeId} on the bed`);
  return applyTake(s, b.takeIds, op);
}

/** keep / reject / a section note: facts about one take, wherever it is bound. */
function applyTake(s: ScoreRec, ids: readonly string[], op: ScoreOp): Result<ScoreRec> {
  if (op.op !== "take-mark" && op.op !== "take-note") return no(`${op.op} is not a bed op`);
  const t = s.takes[op.takeId];
  if (t === undefined || !ids.includes(op.takeId)) return no(`no take ${op.takeId} here`);
  if (op.op === "take-mark") return t.mark === op.mark ? no("unchanged") : ok({ ...s, takes: { ...s.takes, [t.id]: { ...t, mark: op.mark } } });
  if (t.sections[op.section] === undefined) return no(`${t.label} has no section ${op.section + 1}`);
  const note = op.note.trim();
  const { revision: _r, ...rest } = t;
  void _r;
  return ok({ ...s, takes: { ...s.takes, [t.id]: note === "" ? rest : { ...t, revision: { section: op.section, note } } } });
}

function apply(ctx: KCtx, s: ScoreRec, op: ScoreOp, at: number): Result<ScoreRec> {
  if (face(ctx) === "bed") return applyBed(ctx, s, op);
  const pic = pictureOf(ctx);
  const spots = spotsOf(ctx, s, pic);
  const at_ = spots.findIndex((x) => "cueId" in op && x.id === op.cueId);
  const spot = spots[at_];
  const put = (next: ScoreSpot): Result<ScoreRec> => ok({ ...s, spots: spots.map((x, i) => (i === at_ ? next : x)) });
  switch (op.op) {
    case "cue-add": {
      const gap = gapRuns(pic?.scenes ?? [], new Set(spots.flatMap((x) => x.sceneIds)))[0];
      const span = op.first !== undefined && op.last !== undefined ? spanOf(pic, op.first, op.last) : gap === undefined ? no("every scene has a cue") : ok(gap);
      if (!span.ok) return span;
      const taken = new Set(spots.map((x) => x.id));
      let id = `spot-${at.toString(36)}`;
      for (let n = 2; taken.has(id); n++) id = `spot-${at.toString(36)}-${n}`;
      return ok({ ...s, spots: [...spots, { id, title: "new cue", sceneIds: span.value, note: "" }] });
    }
    case "cue-delete":
      return spot === undefined ? no(`no cue ${op.cueId}`) : ok({ ...s, spots: spots.filter((x) => x.id !== op.cueId) });
    default:
      break;
  }
  if (spot === undefined) return no(`no cue ${"cueId" in op ? op.cueId : ""}`);
  switch (op.op) {
    case "cue-span": {
      const span = spanOf(pic, op.first, op.last);
      if (!span.ok) return span;
      return span.value.join() === spot.sceneIds.join() ? no("span unchanged") : put({ ...touched(spot), sceneIds: span.value });
    }
    case "cue-field":
      if (op.field === "title" && op.value.trim() === "") return no("a cue needs a title");
      return put({ ...touched(spot), [op.field]: op.field === "title" ? op.value.trim() : op.value });
    case "cue-bpm": {
      if (!bpmOk(op.bpm)) return no(`a tempo is ${BPM_RANGE[0]}-${BPM_RANGE[1]} bpm`);
      const { bpm: _b, ...rest } = touched(spot);
      void _b;
      return put(op.bpm === null ? rest : { ...rest, bpm: op.bpm });
    }
    case "take-use": {
      if (spot.takeIds?.includes(op.takeId)) return spot.activeTakeId === op.takeId ? no("already in use") : put(activateTake(spot, op.takeId));
      return s.takes[op.takeId] === undefined ? no(`no take ${op.takeId}`) : put(adoptTake(spot, op.takeId));
    }
    case "take-mark":
    case "take-note": {
      const r = applyTake(s, spot.takeIds ?? [], op);
      return r.ok ? ok({ ...r.value, spots }) : r;
    }
  }
}

/* ── acts ─────────────────────────────────────────────────────────────────── */

function acts(ctx: KCtx, s: ScoreRec): PartActView[] {
  if (face(ctx) === "bed") {
    const needs = [...(pickedScenario(ctx) === null ? ["a picked scenario"] : []), ...(s.bed?.bpm == null ? ["a tempo"] : [])];
    return [{ act: "render-bed", label: (s.bed?.takeIds.length ?? 0) === 0 ? "render bed" : "render another take", needs }];
  }
  return [];
}

function units(ctx: KCtx, s: ScoreRec, act: PartActKind, target?: string): Result<number> {
  if (act === "render-bed") {
    const a = acts(ctx, s)[0];
    return a === undefined ? no("render-bed is the ad's act") : a.needs.length > 0 ? no(`render bed needs ${a.needs.join(" · ")}`) : ok(1);
  }
  if (act === "revise-take") {
    const t = target === undefined ? undefined : s.takes[target];
    return t === undefined ? no("revise names a take") : t.revision === undefined ? no(`${t.label} needs a section note`) : ok(1);
  }
  if (face(ctx) === "bed") return no(`${act} is not an ad's act`);
  if (act === "render-cue") {
    const cue = spotting(ctx, s).cues.find((c) => c.id === target);
    if (cue === undefined) return no(target === undefined ? "render cue names a cue" : `no cue ${target} on this picture`);
    return cue.bpm === null ? no(`${cue.title} needs a tempo`) : ok(1);
  }
  return no(`${act} is not a score act`);
}

/** The stand-in a dry render lands: a take the length of the cue, one section per scene. */
function standIn(ctx: KCtx, id: string, label: string, seconds: number, at: number, sections: TakeRec["sections"]): TakeRec {
  return { id, label, at, seconds, mark: null, engine: engineOf(ctx, "score", 0), sections };
}

function land(ctx: KCtx, s: ScoreRec, act: PartActKind, at: number, jobId: string, target?: string): Result<ScoreRec> {
  const n = Object.keys(s.takes).length + 1;
  const id = `take-${at.toString(36)}-${n}`;
  if (act === "render-bed") {
    const sc = pickedScenario(ctx);
    if (sc === null || s.bed?.bpm == null) return no("render bed needs a picked scenario and a tempo");
    const secs = bedRuntimeS(sc, holdOf(ctx));
    const t = standIn(ctx, id, `bed · take ${(s.bed.takeIds.length ?? 0) + 1}`, secs, at, [{ name: "bed", startMs: 0, endMs: Math.round(secs * 1000) }]);
    const b = s.bed.scenarioId === sc.id ? s.bed : { ...s.bed, scenarioId: sc.id, takeIds: [], activeTakeId: null };
    return ok({ ...s, takes: { ...s.takes, [id]: t }, bed: { ...b, takeIds: [...b.takeIds, id], activeTakeId: b.activeTakeId ?? id } });
  }
  if (act === "revise-take" && s.bed !== null && target !== undefined && s.bed.takeIds.includes(target)) {
    const src = s.takes[target];
    if (src?.revision === undefined) return no("revise needs a section note");
    const { revision: _r, ...cleared } = src;
    void _r;
    const t = standIn(ctx, id, `${src.label} · rev §${src.revision.section + 1}`, src.seconds ?? 0, at, src.sections);
    return ok({ ...s, takes: { ...s.takes, [src.id]: cleared, [id]: t }, bed: { ...s.bed, takeIds: [...s.bed.takeIds, id] } });
  }
  const pic = pictureOf(ctx);
  const spots = spotsOf(ctx, s, pic);
  if (act === "render-cue") {
    const cue = spotting(ctx, s).cues.find((c) => c.id === target);
    const spot = spots.find((x) => x.id === target);
    if (cue === undefined || spot === undefined) return no(`no cue ${target ?? ""}`);
    let ms = 0;
    const sections = (pic?.scenes ?? []).filter((x) => spot.sceneIds.includes(x.id)).map((x) => ({ name: `sc ${x.index}`, startMs: ms, endMs: (ms += Math.round(x.targetS * 1000)) }));
    const t = standIn(ctx, id, `${cue.title} · take ${(spot.takeIds?.length ?? 0) + 1}`, cue.durS, at, sections);
    void jobId;
    return ok({ ...s, takes: { ...s.takes, [id]: t }, spots: spots.map((x) => (x.id === spot.id ? bindTake(x, id) : x)) });
  }
  if (act === "revise-take") {
    const src = target === undefined ? undefined : s.takes[target];
    const spot = spots.find((x) => target !== undefined && x.takeIds?.includes(target));
    if (src?.revision === undefined || spot === undefined) return no("revise needs a bound take with a section note");
    const { revision: _r, ...cleared } = src;
    void _r;
    const t = standIn(ctx, id, `${src.label} · rev §${src.revision.section + 1}`, src.seconds ?? 0, at, src.sections);
    return ok({ ...s, takes: { ...s.takes, [src.id]: cleared, [id]: t }, spots: spots.map((x) => (x.id === spot.id ? bindTake(x, id) : x)) });
  }
  return no(`${act} is not a score act`);
}

const ACT_LABELS: Partial<Record<PartActKind, string>> = { "render-cue": "cue render", "revise-take": "section revision", "render-bed": "bed render" };

export const SCORE_KIND: KindModule<"score"> = {
  ops: ["cue-span", "cue-field", "cue-bpm", "cue-add", "cue-delete", "take-use", "take-mark", "take-note"],
  seed: () => ({ spots: null, takes: {}, bed: null }),
  apply: (ctx, s, op) => apply(ctx, s, op, ctx.now),
  label: (op) => finishOpLabel(op),
  verdict: (ctx, s) => verdictFor(ctx, "score", heldTakes(s)),
  acts,
  units,
  land,
  data: (ctx, s): ScoreData => (face(ctx) === "bed" ? bed(ctx, s) : spotting(ctx, s)),
  actLabel: (act) => ACT_LABELS[act] ?? act,
  fromRecords: (recs) => scoreFromRecords(recs),
  toRecords: scoreToRecords,
};

