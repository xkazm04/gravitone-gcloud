// The shared readers every rule checker calls: the chain and kind/movement
// lookups, the dropped-part test, the beat-to-location mapping, and the spine's
// required-role set. Split out of `structure.ts` so each rule module can import
// them without importing the door, which would be a cycle.

import {
  OPTIONAL_ROLES,
  SPINE_ORDER,
  type DroppablePart,
  type MovementRole,
  type TrailerBeat,
  type TrailerBeatKind,
  type TrailerCut,
} from "./types";

/* ───────────────────────────── shared readers ─────────────────────────────── */

/** The beats array order IS the chain order. Nothing sorts by `at`: a timecode is
 *  a position the author wrote, and re-ordering by it would silently repair a
 *  chain whose declared order is wrong — which is a defect the author should see. */
export const chain = (cut: TrailerCut) => cut.beats;

export const kindsOf = (cut: TrailerCut, kind: TrailerBeatKind) =>
  cut.beats.filter((b) => b.kind === kind);

export const movementById = (cut: TrailerCut) =>
  new Map(cut.movements.map((m) => [m.id, m] as const));

export const dropped = (cut: TrailerCut, part: DroppablePart) =>
  (cut.droppedParts ?? []).includes(part);

export const where = (b: TrailerBeat) => ({ at: b.at, beatId: b.id });

/** The roles the spine treats as required for THIS cut — the full spine minus the
 *  optional parts minus whatever the ladder declared dropped. */
export function requiredRoles(cut: TrailerCut): MovementRole[] {
  const optional = new Set<MovementRole>(OPTIONAL_ROLES);
  if (dropped(cut, "introduction")) optional.add("introduction");
  if (dropped(cut, "cold-open")) optional.add("cold-open");
  return SPINE_ORDER.filter((r) => !optional.has(r));
}
