import "server-only";

import { disciplineOf, templateOf, type Discipline } from "@gt/catalog/projects";
import { recipeById } from "@gt/catalog/recipes";
import type { PlanView } from "@gt/domain/produce";
import type { StepKind } from "@gt/domain/steps/registry";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { gateFacts } from "@gt/kernel/parts/gates";
import { planViewIn } from "@gt/kernel/records/read";
import type { Reader } from "@gt/kernel/store";

import type { VerdictInput } from "./verdict.ts";

// ONE PROJECT AS THE PART SIDE READS IT, inside one read snapshot: its plan (with the gates'
// packets wired, so a ratified gate reads ratified), its discipline and clock, and a part's
// snapshot of the step records. Every editor, verdict and gate packet reads THIS project's
// records and nothing else - the v1 "Glass Harbor shows Bitcoin" class of defect (an editor
// falling back to the fixture when its own record was missing, INVENTORY §7.1) has no road here.

export type ProjectRead = {
  readonly plan: PlanView;
  readonly discipline: Discipline;
  /** The project's clock: its runtime, else its template's target. v1's Script never read it. */
  readonly targetS: number | null;
  /** Does the recipe plan a voice part (the Cut's voice lane is then this project's to fill)? */
  readonly plansVoice: boolean;
};

export function disciplineFor(recipeId: string): Discipline {
  const r = recipeById(recipeId);
  if (r?.template !== undefined) return disciplineOf(r.template);
  return r?.family === "album" ? "music-video" : "educational";
}

export function projectRead(r: Reader, projectId: string, now: number): ProjectRead {
  const plan = planViewIn(r, projectId, gateFacts(now));
  const recipe = recipeById(plan.project.recipe);
  const targetS = plan.project.runtimeS ?? (recipe?.template === undefined ? null : templateOf(recipe.template).defaultS);
  return { plan, discipline: disciplineFor(plan.project.recipe), targetS, plansVoice: recipe?.parts.some((p) => p.kind === "voice") === true };
}

/** The part of `kind` in this plan (the first; a recipe plans each studio kind once). */
export function partOfKind(plan: PlanView, kind: StepKind): PlanView["parts"][number] | undefined {
  return plan.parts.find((p) => p.kind === kind);
}

export const keyOf = (projectId: string, partId: string): string => (partId.startsWith(`${projectId}/`) ? partId.slice(projectId.length + 1) : partId);

export function verdictInput(read: ProjectRead, snap: PartSnapshot, takeIds?: ReadonlySet<string> | null): VerdictInput {
  return {
    projectId: read.plan.project.id,
    title: read.plan.project.title,
    discipline: read.discipline,
    targetS: read.targetS,
    plansVoice: read.plansVoice,
    records: snap.records,
    ...(takeIds === undefined ? {} : { takeIds }),
  };
}
