import { recipeById } from "@gt/catalog/recipes";
import { z } from "zod";

import { libraryItemIdSchema, projectIdSchema, styleIdSchema } from "./ids.ts";
import { partSchema, type Part } from "./part.ts";
import { projectMachine } from "./project.machine.ts";

// A PROJECT: a composition on top of the pipeline - a recipe broken into Parts, each run as a Job
// or ratified at a gate (plan §2.2). The v1 project record lived in the browser's IndexedDB
// (lib/projects.ts) with a stepper per studio step; here it is a server record (kernel
// records/, table `projects`) whose state is DERIVED from its parts, by one rule, at read.

/* ── the recipe ───────────────────────────────────────────────────────────── */

// ONE SOURCE FOR THE RECIPE IDS: @gt/catalog/recipes. `film/<template>` is built there from the
// catalogue's templates (music-video excluded - the prototype routes it to the album recipe,
// studio.js `recipeOfTemplate`), so a template appended there is a recipe here with no second
// edit, and a recipe the table dropped is refused at the door.
export const recipeSchema = z.string().refine((id) => recipeById(id) !== undefined, { message: "not a recipe in @gt/catalog/recipes" });
export type RecipeId = z.output<typeof recipeSchema>;

/* ── the state ────────────────────────────────────────────────────────────── */

/** The table and its union live in ./project.machine.ts, zod-free, so a client can hold them. */
export { projectMachine, type ProjectState } from "./project.machine.ts";
export const projectStateSchema = z.enum(projectMachine.states);

/** Lives in ./plan.ts, zod-free, so a client derives a project's state without loading zod. */
export { projectStateOf } from "./plan.ts";

/* ── the record ───────────────────────────────────────────────────────────── */

/** The stored head (`projects.record`). No parts, no state: parts are rows, state is read. */
export const projectSchema = z.object({
  id: projectIdSchema,
  title: z.string().trim().min(1),
  recipe: recipeSchema,
  styleId: styleIdSchema.optional(),
  /** The kept audio take an album video is cut to - a Library item. */
  takeId: libraryItemIdSchema.optional(),
  topic: z.string().trim().min(1).optional(),
  runtimeS: z.number().positive().optional(),
  /** Revision of the plan; minted by the store at write, never by a caller. */
  rev: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  launchedAt: z.iso.datetime().optional(),
  /** A discarded draft keeps its row and its events; reads stop listing it (entity-lifecycle). */
  discardedAt: z.iso.datetime().optional(),
}).superRefine((p, ctx) => {
  // Only a draft is discarded (kernel records/write.ts `discard`): a launched project's jobs are
  // cancelled in Runs, and a tombstone over live jobs would hide them from every list.
  if (p.discardedAt !== undefined && p.launchedAt !== undefined)
    ctx.addIssue({ code: "custom", path: ["discardedAt"], message: "only a draft is discarded; this project was launched" });
});
export type Project = z.output<typeof projectSchema>;

/** A head with its parts, validated as a graph at the door (registry pipeline-dag/graph-validation:
 *  a cycle or a dangling edge is refused when the plan is written, never discovered mid-run). */
export const projectPlanSchema = z.object({ project: projectSchema, parts: z.array(partSchema).min(1) }).superRefine((p, ctx) => {
  const ids = new Set(p.parts.map((x) => x.id));
  if (ids.size !== p.parts.length) ctx.addIssue({ code: "custom", path: ["parts"], message: "part ids are unique within a project" });
  p.parts.forEach((x, i) => {
    for (const dep of x.after)
      if (!ids.has(dep)) ctx.addIssue({ code: "custom", path: ["parts", i, "after"], message: `part ${x.id} waits for ${dep}, which is not in this project` });
  });
  const cycle = cycleIn(p.parts);
  if (cycle) ctx.addIssue({ code: "custom", path: ["parts"], message: `the plan has a cycle: ${cycle.join(" -> ")}` });
});
export type ProjectPlan = z.output<typeof projectPlanSchema>;

/** The first dependency cycle found, as ids, or null. A plan with a cycle has no schedule, and
 *  the Runs day-line would wait on it forever. */
function cycleIn(parts: readonly Pick<Part, "id" | "after">[]): string[] | null {
  const after = new Map<string, readonly string[]>(parts.map((p) => [p.id, p.after]));
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    const at = path.indexOf(id);
    if (at >= 0) return [...path.slice(at), id];
    if (done.has(id)) return null;
    path.push(id);
    for (const dep of after.get(id) ?? []) {
      const c = visit(dep);
      if (c) return c;
    }
    path.pop();
    done.add(id);
    return null;
  };
  for (const p of parts) {
    const c = visit(p.id);
    if (c) return c;
  }
  return null;
}
