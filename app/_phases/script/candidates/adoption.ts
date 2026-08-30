// THE ADOPTION SEAM — which candidate script this project adopted, resolved.
//
// `frames.ts:300` has documented the missing record since the lane resolver
// landed: "nothing in this app stores WHICH candidate script a project
// accepted, so there is nothing in the record to resolve against yet". The
// record now exists (`ScriptAdoptionStepData`, phase key below), the duel
// writes it, and this file is the ONE place its value becomes a render — so
// the Frames step and the Script step cannot resolve the same id differently.
//
// THE CLEARED CASE, stated because it is the subtle one. The committed type
// says `renderId: string`, so un-adoption cannot be modelled as a missing
// field on a present record. The convention, written here and nowhere else:
//
//   · key never written        → never adopted → the positional default
//   · `renderId: ""`           → adopted once, then explicitly cleared → the
//                                positional default again (clearing an
//                                adoption must restore today's behaviour,
//                                not strand the project on a ghost pick)
//   · `renderId: "<unknown>"`  → a record pointing at a render that no longer
//                                ships → the positional default, because a
//                                pointer into a registry that cannot answer
//                                is the same absence with a longer name
//
// Pure on purpose: the node-lane probe (`adopted-render.probe.spec.ts`)
// asserts this table without a DOM, and a resolution rule that lives inside a
// hook is a rule only a browser can check.

import { RENDERS, RENDER_BY_ID } from "../renders";
import type { ScriptRender } from "../types";

/** The step-store phase key for `ScriptAdoptionStepData`. */
export const ADOPTION_PHASE = "script-adopted";

/**
 * The explainer render an adoption record points at — or the positional
 * default (`RENDERS[0]`, the same fixture Frames has always opened on) when
 * the record is absent, cleared (`""`) or names a render that does not exist.
 */
export function resolveExplainerRender(renderId: string | undefined): ScriptRender {
  if (!renderId) return RENDERS[0];
  return (RENDER_BY_ID as Record<string, ScriptRender | undefined>)[renderId] ?? RENDERS[0];
}
