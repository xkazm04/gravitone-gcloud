import { TEMPLATES, type TemplateId } from "@gt/catalog/projects";
import { z } from "zod";

import { libraryItemIdSchema, projectIdSchema, styleIdSchema } from "./ids.ts";
import { partSchema, type Part, type PartState } from "./part.ts";
import { projectMachine, type ProjectState } from "./project.machine.ts";

// A PROJECT: a composition on top of the pipeline — a recipe broken into
// Parts, each run as a Job (plan §2.2). The v1 project record lived in the
// browser's IndexedDB (lib/projects.ts) with a stepper per studio step; here
// it is a server record whose state is DERIVED from its parts, by one rule.

/* ── the recipe ───────────────────────────────────────────────────────────── */

// ONE SOURCE FOR THE TEMPLATE IDS. `film/<template>` names a @gt/catalog
// template, so a template appended to the catalogue is a recipe here with no
// second edit, and a recipe naming a template the catalogue dropped is refused
// at the door. `music-video` is not a film: the prototype routes it to the
// album recipe (studio.js `recipeOfTemplate`), so it is excluded here and a
// v1 music-video project imports as `album-video`.
type FilmTemplate = Exclude<TemplateId, "music-video">;
const FILM_TEMPLATES = TEMPLATES.map((t) => t.id).filter((id): id is FilmTemplate => id !== "music-video");

export const recipeSchema = z.union([
  z.templateLiteral(["film/", z.enum(FILM_TEMPLATES)]),
  z.enum(["album-video", "explainer"]),
]);
export type Recipe = z.output<typeof recipeSchema>;

/* ── the state ────────────────────────────────────────────────────────────── */

/** The table and its union live in ./project.machine.ts, zod-free, so a client can hold them. */
export { projectMachine, type ProjectState } from "./project.machine.ts";
export const projectStateSchema = z.enum(projectMachine.states);

/**
 * The prototype's precedence, kept: anything stuck outranks anything at the
 * Weir, which outranks anything running. One change: a `paused` part counts as
 * waiting (queued). The prototype let it fall through to `draft`, so pausing
 * the last open part of a launched project read as an unlaunched plan.
 */
export function projectStateOf(parts: readonly Pick<Part, "state">[]): ProjectState {
  const has = (...s: PartState[]) => parts.some((p) => s.includes(p.state));
  if (has("failed", "blocked")) return "blocked";
  if (has("awaiting_gate")) return "awaiting_gate";
  if (has("running")) return "running";
  if (parts.length > 0 && parts.every((p) => p.state === "ratified")) return "ratified";
  if (has("queued", "paused")) return "queued";
  return "draft";
}

/* ── the record ───────────────────────────────────────────────────────────── */

export const projectSchema = z
  .object({
    id: projectIdSchema,
    title: z.string().trim().min(1),
    recipe: recipeSchema,
    styleId: styleIdSchema.optional(),
    /** The kept audio take an album video is cut to — a Library item. */
    takeId: libraryItemIdSchema.optional(),
    topic: z.string().trim().min(1).optional(),
    runtimeS: z.number().positive().optional(),
    /** Revision of the plan; minted by the store at write, never by a caller. */
    rev: z.number().int().positive(),
    parts: z.array(partSchema).min(1),
    state: projectStateSchema,
  })
  .superRefine((p, ctx) => {
    const ids = new Set(p.parts.map((x) => x.id));
    if (ids.size !== p.parts.length) ctx.addIssue({ code: "custom", path: ["parts"], message: "part ids are unique within a project" });
    p.parts.forEach((x, i) => {
      for (const dep of x.after)
        if (!ids.has(dep)) ctx.addIssue({ code: "custom", path: ["parts", i, "after"], message: `part ${x.id} waits for ${dep}, which is not in this project` });
    });
    const cycle = cycleIn(p.parts);
    if (cycle) ctx.addIssue({ code: "custom", path: ["parts"], message: `the plan has a cycle: ${cycle.join(" -> ")}` });
    const derived = projectStateOf(p.parts);
    if (p.state !== derived)
      ctx.addIssue({ code: "custom", path: ["state"], message: `state ${p.state} disagrees with its parts, which read ${derived}` });
  });
export type Project = z.output<typeof projectSchema>;

/** The first dependency cycle found, as ids, or null. A plan with a cycle has
 *  no schedule, and the Runs day-line would wait on it forever. */
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
