import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE SCORE PRODUCER (Phase 4 wave C, L37) - a score part's acts as kernel jobs:
//   render-cue   ONE cue's take (v1 POST /api/sound/generate, op "cue", lib/sound/generate.ts on
//                ElevenLabs music), target = the spot id. v1 single-flighted per cue key in the
//                TAB (app/_phases/score/useCueTakes.ts :54-68) - two tabs bought twice; here the
//                job id is the single flight: a live job for the same act and cue is adopted by a
//                second confirm (lib/producers part-job `enqueueActIn`), whoever clicks.
//   revise-take  a section edit of one take (v1 CueTakes' section-revision radiogroup + note,
//                takes.ts `revisionRequest`: the noted section at "medium", every other one
//                `keep`), target = the take id; the note is the record's, written by an op.
//   render-bed   the ads bed (v1 AdsScore `store.generate("ad-bed-…")`, app/_phases/score/ads/
//                bed.ts): the picked scenario's runtime by construction, at the record's tempo.
// The refusals are the work's own and come BEFORE anything is bought: v1 disabled the button
// without a tempo and said so ("no tempo upstream — the bed waits for one"); `cueTakeRequest`
// returns null without one, and "none is invented here".

export const SCORE_ACTS = ["render-cue", "revise-take", "render-bed"] as const;
export type ScoreAct = (typeof SCORE_ACTS)[number];

/** One spotted cue as the act reads it. */
export type CueView = {
  readonly id: string;
  readonly title: string;
  readonly bpm?: number;
  readonly hasPicture: boolean;
  readonly why?: string;
  readonly taken: boolean;
  /** The cue's takes, and the section note waiting on each (a revision's direction). */
  readonly takes: readonly { readonly id: string; readonly revision?: { readonly section: number; readonly note: string } }[];
};

export type ScoreView = {
  readonly face: "standard" | "ads";
  readonly cues: readonly CueView[];
  /** The ads bed's tempo, null until a human chooses one. */
  readonly bedBpm: number | null;
  readonly scenarioPicked: boolean;
};

/** The part's own plan job renders every cue that has none yet (or the bed). */
export const scoreDefaultAct = (v: ScoreView): ScoreAct => (v.face === "ads" ? "render-bed" : "render-cue");

function cueUnit(c: CueView, price: UnitPrice): Result<ActPlan["units"][number]> {
  if (c.bpm === undefined) return refuse(`${c.title} needs a tempo`);
  if (!c.hasPicture) return refuse(`${c.title} ${c.why ?? "has no picture to score against"}`);
  return ok(unitOf(`cue:${c.id}`, price, { cueId: c.id }));
}

export function scorePlan(v: ScoreView, act: string | null, target: string | undefined, price: UnitPrice): Result<ActPlan> {
  const a = act ?? scoreDefaultAct(v);
  switch (a) {
    case "render-cue": {
      if (v.face === "ads") return refuse("an ads score renders its bed, not cues");
      if (target === undefined) {
        // The plan job: every cue still without a take - and none of them silently skipped.
        if (v.cues.length === 0) return refuse("no cues spotted");
        const open = v.cues.filter((c) => !c.taken);
        if (open.length === 0) return refuse("every cue has a take");
        const units = [];
        for (const c of open) {
          const u = cueUnit(c, price);
          if (!u.ok) return u;
          units.push(u.value);
        }
        return ok({ act: a, units });
      }
      const cue = v.cues.find((c) => c.id === target);
      if (cue === undefined) return refuse(`no cue ${target}`);
      const u = cueUnit(cue, price);
      return u.ok ? ok({ act: a, units: [u.value] }) : u;
    }
    case "revise-take": {
      if (target === undefined) return refuse("revise take needs a take");
      const cue = v.cues.find((c) => c.takes.some((t) => t.id === target));
      const take = cue?.takes.find((t) => t.id === target);
      if (cue === undefined || take === undefined) return refuse(`no cue holds take ${target}`);
      if (take.revision === undefined || take.revision.note.trim() === "") return refuse(`${target} has no section note to revise`);
      return ok({ act: a, units: [unitOf(`rev:${target}`, price, { takeId: target, cueId: cue.id, section: take.revision.section, note: take.revision.note })] });
    }
    case "render-bed":
      if (v.face !== "ads") return refuse("a bed is the ads face's act");
      if (!v.scenarioPicked) return refuse("render bed needs a picked scenario");
      if (v.bedBpm === null) return refuse("the bed needs a tempo");
      return ok({ act: a, units: [unitOf("bed", price, { bpm: v.bedBpm })] });
    default:
      return refuse(`${a} is not an act of a score part`);
  }
}

export const defineScore = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
