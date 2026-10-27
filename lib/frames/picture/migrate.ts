// THE FRAMES RECORD, v1 → v2 — pure, at the read seam, and never a write.
//
// v1 (`{ frames, renderId, direction? }`, no `v`) held a list of frames whose
// identity was their index. v2 holds the same cut as PICTURE UNITS (./unit.ts):
// each with an identity and its own place on the film. The `frames` list stays
// in the record as a read-only SHADOW of the BEAT units, which v1 wrote beside
// the units on every save for its readers that had not moved to units.
//
// WHO RUNS THIS NOW: the importer. `lib/import/steps.ts` walks a v1 export's
// `frames` row through `framesV1ToV2`, drops the shadow, and hands the result to
// @gt/domain's FRAMES door (v3, packages/domain/src/steps/frames.ts). It is
// pure and in memory; v1 ran it at its own read seam (`decodeRecord`, retired
// with app/_phases); the probe that pins the walk (tests/golden-path/picture-unit.probe.spec.ts)
// asserts through the importer's path, so there is one door for the record, @gt/domain's.
//
// `withClips` — the hand migration `frames.ts` used to run inline at the read,
// "because there is no migration seam to hang this off" — is folded in here,
// because now there is one.
//
// TWO v1 WRITERS WROTE v1 OVER v2, so an export can carry it, and that is
// handled rather than forbidden. v1's board `decide` and Motion accept saved
// `{ ...stored, frames }` through the def-less store, which stamped `v: 1` — so
// a v2 record they touched reads as "v1 with units riding along". The two
// kinds of unit are treated differently:
//
//   · BEAT units are re-derived from `frames`, never trusted from the object.
//     The writer edited `frames` (Motion's accepted line lives only there), and
//     beat units are a pure function of the frame list, the render and its
//     length — so re-deriving is exactly what makes those writes land.
//   · SHOT units have no frame to be re-derived from: `frames` is beat units
//     only. They are KEPT from the object when they were derived from the chain
//     the object names (`sourceId === renderId`); without that, the next v1
//     write would erase every shot a trailer saved. A shot from a different
//     chain is stale and is dropped, as v1's hook would drop it.
//
// Those writers retired with app/_phases, so this branch reads old records
// only.

import { RENDER_BY_ID } from "@/lib/script/renders";
import type { ScriptRender } from "@/lib/script/types";
import { emptyClip, type Frame } from "@/lib/frames/frames";
import { unitsFromFrames, type PictureUnit } from "@/lib/frames/picture/unit";

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The length of the chain a stored `renderId` names, when it names a shipped
 *  explainer render — the number `durationOf` closes the last beat with. An id
 *  this build does not ship gets null, and its last unit an unknown hold. */
const totalOf = (renderId: string): number | null =>
  (RENDER_BY_ID as Record<string, ScriptRender | undefined>)[renderId]?.durationS ?? null;

/** Cuts stored before the clip layer existed have no `clip` key at all, and a
 *  renderer meeting `undefined` there is a crash rather than a blank row. */
const withClip = (f: Frame): Frame => (f.clip ? f : { ...f, clip: emptyClip() });

function framesIn(raw: Record<string, unknown>): Frame[] {
  const list = raw.frames ?? [];
  if (!Array.isArray(list)) throw new Error("frames is not a list");
  for (const [i, f] of list.entries())
    if (!isPlainObject(f) || typeof f.id !== "string" || !isPlainObject(f.plate))
      throw new Error(`frames[${i}] is not a frame`);
  return (list as Frame[]).map(withClip);
}

/** v1 → v2. Pure; throws on a v1 object it cannot read, which the importer
 *  (lib/import/steps.ts lift) turns into a data-only loss. */
export function framesV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const frames = framesIn(raw);
  const renderId = typeof raw.renderId === "string" ? raw.renderId : "";
  const beats = unitsFromFrames(frames, { sourceId: renderId, totalS: totalOf(renderId) });
  return { ...raw, frames, units: [...beats, ...shotsRiding(raw.units, renderId)] };
}

/** The shot units a v1 object carries for its own chain — see the header. A
 *  v1 record from before units existed has none; anything that is not a shot
 *  unit of this chain is left behind rather than cast. */
function shotsRiding(units: unknown, renderId: string): PictureUnit[] {
  if (!Array.isArray(units) || !renderId) return [];
  return units.filter(
    (u): u is PictureUnit =>
      isPlainObject(u) &&
      u.kind === "shot" &&
      u.sourceId === renderId &&
      typeof u.id === "string" &&
      isPlainObject(u.plate) &&
      Array.isArray(u.elements) &&
      Array.isArray(u.texts),
  );
}
