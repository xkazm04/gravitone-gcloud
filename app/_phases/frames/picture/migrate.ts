// THE FRAMES RECORD, v1 → v2 — pure, at the read seam, and never a write.
//
// v1 (`{ frames, renderId, direction? }`, no `v`) held a list of frames whose
// identity was their index. v2 holds the same cut as PICTURE UNITS (./unit.ts):
// each with an identity and its own place on the film. The `frames` list stays
// in the record as a read-only SHADOW of the BEAT units, written beside the
// units on every save, because two readers have not moved to units yet — the
// board's alternatives source (lib/board/sources/alternative.ts) and Motion
// (motion/useMotion.ts) — and both move onto the def in phase-shared-A's
// lineage stage. Score and Cut read units since frames-phase-A stage 2
// (./read.ts).
//
// THIS RUNS ON READ ONLY. `decodeRecord` (../../_shared/records/registry.ts)
// walks a stored v1 object through `framesV1ToV2` in memory and hands the hook
// v2; nothing is written back. A record that is money (plates) is rewritten when
// somebody edits it, not when somebody opens it — `useFrames`' save is skipped
// while the cut on screen is still exactly what was read.
//
// `withClips` — the hand migration `frames.ts` used to run inline at the read,
// "because there is no migration seam to hang this off" — is folded in here,
// because now there is one.
//
// TWO WRITERS STILL WRITE v1, and that is handled rather than forbidden. The
// board's `decide` and Motion's accept save `{ ...stored, frames }` through the
// def-less store, which stamps `v: 1` — so a v2 record they touch comes back as
// "v1 with units riding along". The two kinds of unit are treated differently:
//
//   · BEAT units are re-derived from `frames`, never trusted from the object.
//     The writer edited `frames` (Motion's accepted line lives only there), and
//     beat units are a pure function of the frame list, the render and its
//     length — so re-deriving is exactly what makes those writes land.
//   · SHOT units have no frame to be re-derived from: `frames` is beat units
//     only. They are KEPT from the object when they were derived from the chain
//     the object names (`sourceId === renderId`); without that, the next v1
//     write would erase every shot a trailer saved. A shot from a different
//     chain is stale and is dropped, as the hook would drop it.
//
// Stage 3 gives shots plates of their own; by then the board and Motion should
// write through the def, and this branch becomes a reader of old records only.

import { RENDER_BY_ID } from "../../script/renders";
import type { ScriptRender } from "../../script/types";
import { isPlainObject, malformed, type RecordRefusal } from "../../_shared/records/registry";
import { emptyClip, type Frame } from "../frames";
import type { FramesStepData } from "../useFrames";
import { framesFromUnits, unitsFromFrames, type PictureUnit } from "./unit";

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

/** v1 → v2. Pure; throws on a v1 object it cannot read, which the registry
 *  turns into a `malformed` refusal (and so into no write). */
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

/** A v2 object → the record. Units are the authority; the shadow is rebuilt
 *  from them, so a reader of the record cannot be handed two cuts that
 *  disagree. */
export function parseFramesRecord(raw: Record<string, unknown>): FramesStepData | RecordRefusal {
  if (typeof raw.renderId !== "string") return malformed("frames.renderId is not a string");
  if (!Array.isArray(raw.units)) return malformed("frames.units is not a list");
  for (const [i, u] of raw.units.entries())
    if (
      !isPlainObject(u) ||
      typeof u.id !== "string" ||
      !isPlainObject(u.plate) ||
      !Array.isArray(u.elements) ||
      !Array.isArray(u.texts)
    )
      return malformed(`frames.units[${i}] is not a picture unit`);
  const units = (raw.units as PictureUnit[]).map((u) => (u.clip ? u : { ...u, clip: emptyClip() }));
  return { ...raw, renderId: raw.renderId, units, frames: framesFromUnits(units) } as FramesStepData;
}
