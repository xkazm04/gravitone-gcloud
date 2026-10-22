// A RUN'S BRIEF - what it tried to make, and what to judge it on - read off the run's own record,
// for the opened run's head on the Board (operator, 2026-10-22: "what it tried to achieve and what
// to focus on in the triage"). Pure. Every word is the WORK's: a look's recipe and observables, a
// scene's recipe; nothing here describes the desk.
//
//   aim     one sentence: the recipe's first clause (the medium, named first by the synthesis
//           prompt) for a look; composition and light for a scene.
//   checks  the attributes the replicas are graded on, each `field: value` - a look's declared
//           observables (lib/foundry/extract/types.ts OBSERVABLE_FIELDS), a scene's shot, camera,
//           motion and palette roles.

import type { ExtractedStyle } from "../../../foundry/extract/types.ts";
import type { SceneRecipe } from "../../../foundry/scout/types.ts";

/** The longest aim drawn; a recipe runs 60-110 words and its first clause carries the medium. */
const AIM_MAX = 180;
/** The observables a look is checked on first: medium and rendering decide the look, finish and edges hold it. */
const LOOK_CHECKS = ["medium", "render_mode", "palette_strategy", "edge_treatment", "finish", "black_handling"] as const;

export type RunBrief = { readonly aim: string; readonly checks: readonly string[] };

const words = (v: string): string => v.replace(/[-_]/g, " ").trim();

/** The first sentence (or clause, past AIM_MAX), whole words, no trailing comma. */
export function firstClause(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const sentence = /^(.+?[.!?])(\s|$)/.exec(t)?.[1] ?? t;
  if (sentence.length <= AIM_MAX) return sentence;
  const cut = sentence.slice(0, AIM_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" "))).replace(/[,;:\s]+$/, "")}…`;
}

export function lookBrief(style: Pick<ExtractedStyle, "recipe" | "observables">): RunBrief {
  const checks = LOOK_CHECKS.flatMap((f) => {
    const v = style.observables[f];
    return typeof v === "string" && v.trim() !== "" ? [`${words(f)}: ${words(v)}`] : [];
  });
  return { aim: firstClause(style.recipe), checks };
}

export function sceneBrief(r: SceneRecipe): RunBrief {
  return {
    aim: firstClause(`${r.composition.trim().replace(/[.;,\s]+$/, "")}; ${r.lighting.trim().replace(/[.;,\s]+$/, "")}.`),
    checks: [`shot: ${r.shot}`, `camera: ${r.camera}`, `motion: ${r.motion}`, ...(r.palette.length > 0 ? [`palette: ${r.palette.join(", ")}`] : [])],
  };
}
