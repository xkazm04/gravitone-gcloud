import { createHash } from "node:crypto";

import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit } from "@gt/producers/research/partAct";
import { landPart, partSnapshot, projectOf } from "@gt/producers/research/partJob";
import { defineScore, scorePlan, type CueView, type ScoreView } from "@gt/producers/score/define";

import { adBedRequest, DEFAULT_HOLD_S } from "@/lib/score/ads/bed";
import { bindTake, cueTakeRequest, revisionRequest, sectionsOf } from "@/lib/score/takes";
import type { AdBrief } from "@/lib/ads/types";
import type { PictureUnit } from "@/lib/frames/picture/unit";
import { MusicError } from "@/lib/music/errors";
import { pictureFromUnits } from "@/lib/score/picture";
import { toCueSpots, type ScoreSpot } from "@/lib/score/spots";
import { generateTake } from "@/lib/sound/generate";
import { createTake, getTake } from "@/lib/sound/takes";
import type { GenerateRequest, SoundTake } from "@/lib/sound/types";
import { cuesFrom, type SpottingCue } from "@/lib/studio/score";

import { pickedScenario } from "./frames.ts";
import { asData, field, must, partFacts, priceOf, recOf, text, withRecords, written, type DriveHooks, type PartFacts, type UnitsFn, preflightFrom } from "./research.ts";

// THE SCORE PRODUCER, BOUND (Phase 4 wave C, L37) - packages/producers/src/score's ports over
// v1's cue render: the spot -> cue brief (lib/studio/score.ts `cuesFrom`, over the picture the
// frames units place: lib/score/picture.ts `pictureFromUnits`, the one clock the Cut shares), the
// request (app/_phases/score/takes.ts `cueTakeRequest`, ads `adBedRequest`), the render and its
// filing in the v1 sound store (lib/sound/generate.ts `generateTake`, ElevenLabs), and the
// pointer bound onto the spot (`bindTake`: active only when none is - a second render does not
// steal the slot). The take's BYTES stay in the sound store (v1's ADR, option D); the record
// holds pointers.
//
// SPEND: ElevenLabs music is counted by the v1 music meter in SECONDS of audio
// (lib/music/budget.ts, its own 402 `over-budget`) and reports no dollar figure; the job books
// each served render unpriced with that reason (decision 7), and the meter's 402 is a money stop,
// never a breaker count. A take that landed in the store and died before its booking is a kernel
// interruption on cloud.elevenlabs (a paid lane: it holds until the operator looks) - and the
// stray is not lost: v1 `cueTakes` lists a project's cue takes no pointer names yet.
//
// DRY: the vendor is never asked. A stand-in take - one silent MPEG frame - is filed under an id
// derived from the job and the unit (createTake is idempotent by id), so a dry job runs end to
// end, the Cut's music lane resolves it, and a resumed dry job files nothing twice.

export type ScoreEngines = { readonly generateTake: (req: GenerateRequest) => Promise<SoundTake> };
const LIVE: ScoreEngines = { generateTake: (req) => generateTake(req) };

const UNPRICED = "ElevenLabs music is metered in seconds of audio (lib/music/budget.ts); no dollar figure is reported";
/** One silent MPEG-1 Layer III frame: a playable nothing, so a dry take is a take. */
const SILENT_MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array<number>(413).fill(0)]);

const spotsOf = (s: PartSnapshot): ScoreSpot[] => {
  const sp = recOf(s, "score")["spots"];
  return Array.isArray(sp) ? written<ScoreSpot[]>(sp) : [];
};
const unitsOf = (s: PartSnapshot): PictureUnit[] => {
  const u = recOf(s, "frames")["units"];
  return Array.isArray(u) ? written<PictureUnit[]>(u) : [];
};


/** The project's cues: its spots on its own picture, and the spots that cannot be cues, with why. */
function cuesOf(s: PartSnapshot, f: PartFacts): { cues: SpottingCue[]; unspottable: { id: string; why: string }[] } {
  const picture = pictureFromUnits(unitsOf(s), f.targetS ?? 0);
  const out = cuesFrom(toCueSpots(spotsOf(s)), picture.scenes, { title: f.plan.project.title, logline: "" });
  return { cues: out.cues, unspottable: out.unspottable.map((u) => ({ id: u.spot.id, why: u.why })) };
}

export function scoreView(s: PartSnapshot, f: PartFacts): ScoreView {
  const { cues, unspottable } = cuesOf(s, f);
  const placed = new Set(cues.map((c) => c.id));
  const views: CueView[] = spotsOf(s).map((sp) => {
    const why = unspottable.find((u) => u.id === sp.id)?.why;
    const notes = field(field(sp)?.["revisions"]);
    const takes = (sp.takeIds ?? []).map((id) => {
      const r = field(notes?.[id]);
      const section = r?.["section"];
      const note = r?.["note"];
      return { id, ...(typeof section === "number" && typeof note === "string" ? { revision: { section, note } } : {}) };
    });
    return { id: sp.id, title: sp.title, ...(sp.bpm === undefined ? {} : { bpm: sp.bpm }), hasPicture: placed.has(sp.id), ...(why === undefined ? {} : { why }), taken: sp.activeTakeId !== undefined, takes };
  });
  const bpm = recOf(s, "ads-score")["bpm"];
  return { face: f.discipline === "ads" ? "ads" : "standard", cues: views, bedBpm: typeof bpm === "number" ? bpm : null, scenarioPicked: pickedScenario(s) !== undefined };
}

/** The model a cue render runs on. The catalog's other score option, Suno, is the Suno producer's
 *  (a proposal queue in a browser, lib/producers/suno.ts) and renders no cue against picture;
 *  a part routed there is refused here, before a receipt prices a job no producer can run. */
const RENDERS_CUES = new Set(["elevenlabs"]);

export const scoreUnits: UnitsFn = withRecords((s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act" | "target">): Result<ActPlan> => {
  if (!RENDERS_CUES.has(f.option.provider)) return err("refused", `cues render on ElevenLabs; this score part is routed to ${f.option.label}`);
  return scorePlan(scoreView(s, f), ask.act, ask.target, priceOf(f.option));
});

/** A music engine's failure, classed: the meter's 402 is money, a vendor that may answer next
 *  time feeds the breaker, a missing key or a refusal is the job's sentence. */
export const musicFailure = (e: unknown): StepOutcome =>
  failureOf(e, (x) => (x instanceof MusicError ? (x.kind === "over-budget" ? "money" : x.kind === "rate-limited" || x.kind === "timeout" || x.kind === "failed" ? "retry" : "fatal") : undefined));

/** One render through the meter; dry files the stand-in take under an id derived from the unit. */
async function renderTake(ctx: StepContext, unit: ActUnit, req: GenerateRequest, eng: ScoreEngines): Promise<StepOutcome> {
  const live = await meteredCall<SoundTake | null>(ctx, {
    provider: "elevenlabs",
    model: "music",
    payload: req,
    estimate: unit.estimate,
    stand: () => null,
    live: async () => ({ value: await eng.generateTake(req), unpriced: UNPRICED }),
  });
  if (live !== null) return madePaid({ takeId: live.id }, ctx);
  const id = `st-dry-${createHash("sha256").update(`${ctx.job.id}/${unit.name}`).digest("hex").slice(0, 16)}`;
  const { take } = await createTake(
    { id, kind: "music", title: `${req.title ?? "cue"} (dry stand-in)`, provider: "elevenlabs", op: req.op, origin: "score", prompt: "", tempoBpm: req.tempoBpm, projectId: req.projectId ?? null, cueId: req.cueId ?? null },
    { bytes: SILENT_MP3, mime: "audio/mpeg", name: "dry.mp3" },
  );
  return madeFree({ takeId: take.id, dry: true });
}

async function cueUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, eng: ScoreEngines): Promise<StepOutcome> {
  const id = text(unit.input["cueId"]);
  const cue = cuesOf(s, f).cues.find((c) => c.id === id);
  if (cue === undefined) return { kind: "fatal", code: "refused", message: `cue ${id ?? "?"} is no longer on the picture` };
  const req = cueTakeRequest(cue, projectOf(ctx.job));
  if (req === null) return { kind: "fatal", code: "refused", message: `${cue.title} needs a tempo` };
  return renderTake(ctx, unit, req, eng);
}

async function bedUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, eng: ScoreEngines): Promise<StepOutcome> {
  const scenario = pickedScenario(s);
  if (scenario === undefined) return { kind: "fatal", code: "refused", message: "render bed needs a picked scenario" };
  const brief = field(recOf(s, "ads-brief")["brief"]);
  const holdS = field(recOf(s, "ads-finish")["endCard"])?.["holdS"];
  const bpm = recOf(s, "ads-score")["bpm"];
  const req = adBedRequest({ scenario, brief: brief === undefined ? null : written<AdBrief>(brief), projectTitle: f.plan.project.title, projectId: projectOf(ctx.job), holdS: typeof holdS === "number" ? holdS : DEFAULT_HOLD_S, bpm: typeof bpm === "number" ? bpm : null });
  if (req === null) return { kind: "fatal", code: "refused", message: "the bed needs a tempo between 40 and 220" };
  const out = await renderTake(ctx, unit, req, eng);
  return out.kind === "produced" ? { ...out, output: { ...out.output, scenarioId: scenario.id } } : out;
}

async function reviseUnit(ctx: StepContext, unit: ActUnit, eng: ScoreEngines): Promise<StepOutcome> {
  const takeId = String(unit.input["takeId"]);
  const section = Number(unit.input["section"]);
  const take = await getTake(takeId);
  // v1 offered no revision for a take with no stored plan or song (sectionsOf empty): refused, said.
  if (sectionsOf(take).length <= section) return { kind: "fatal", code: "refused", message: `${takeId} has no section ${section + 1} to revise (no stored plan or song)` };
  const req = revisionRequest(take, section, String(unit.input["note"]), { projectId: projectOf(ctx.job), cueId: text(unit.input["cueId"]) ?? null });
  return renderTake(ctx, unit, req, eng);
}

function landScore(plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot): Result<Record<string, unknown>> {
  if (plan.act === "render-bed") {
    const m = made.get("bed");
    const takeId = text(m?.["takeId"]);
    if (m === undefined || takeId === undefined) return err("internal", "render-bed: no take booked");
    const rec = recOf(s, "ads-score");
    const ids = Array.isArray(rec["takeIds"]) ? written<string[]>(rec["takeIds"]) : [];
    const sameScenario = rec["scenarioId"] === m["scenarioId"];
    return ok({
      "ads-score": {
        ...rec,
        scenarioId: m["scenarioId"],
        takeIds: ids.includes(takeId) ? ids : [...ids, takeId],
        // v1 bindTake: a new render is active only when nothing is - or when the takes in use were
        // scored against another scenario, which the verdict reads as stale anyway.
        activeTakeId: sameScenario && typeof rec["activeTakeId"] === "string" ? rec["activeTakeId"] : takeId,
      },
    });
  }
  // A cue render and a section revision both add a pointer; bindTake makes it active only when
  // the cue has none, so a revision is offered beside the take it revised, never swapped in.
  const byCue = new Map<string, string[]>();
  for (const u of plan.units) {
    const takeId = text(made.get(u.name)?.["takeId"]);
    const cueId = text(u.input["cueId"]);
    if (takeId !== undefined && cueId !== undefined) byCue.set(cueId, [...(byCue.get(cueId) ?? []), takeId]);
  }
  const spots = spotsOf(s).map((sp) => (byCue.get(sp.id) ?? []).reduce((acc, id) => bindTake(acc, id), sp));
  return ok({ score: { ...recOf(s, "score"), spots: asData({ spots })["spots"] } });
}

export function scoreProducer(lane: ResourceLane = "cloud.elevenlabs", hooks: DriveHooks = {}, engines: Partial<ScoreEngines> = {}): Producer {
  const eng: ScoreEngines = { ...LIVE, ...engines };
  return defineScore(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(scoreUnits),
    async plan(_job, ask, ctx) {
      const s = partSnapshot(ctx);
      if (!s.ok) return s;
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return scoreUnits(s.value, f.value, ask);
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        const s = must(partSnapshot(ctx));
        const f = must(partFacts(ctx));
        if (unit.name === "bed") return await bedUnit(ctx, unit, s, f, eng);
        if (unit.name.startsWith("cue:")) return await cueUnit(ctx, unit, s, f, eng);
        if (unit.name.startsWith("rev:")) return await reviseUnit(ctx, unit, eng);
        return { kind: "fatal", code: "invalid", message: `score: no unit ${unit.name}` };
      } catch (e) {
        return musicFailure(e);
      }
    },
    async land(_job, plan, made, ctx) {
      return landPart(ctx, plan.act, (s) => landScore(plan, made, s));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
